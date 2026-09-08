import {
  BufferGeometry,
  Color,
  Matrix3,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three"
import { applyPreset, createLiquidMaterial, type LiquidMaterialHandle } from "../material/liquid-material"
import { backgroundColor } from "../material/environment"
import { prepareGeometry } from "./prepare-geometry"
import { SurfaceProbe, type ProbeMode } from "./pointer"
import { Trail } from "./trail"
import { resolveQuality } from "./quality"
import type { LiquidPreset, MotionOptions, Quality } from "../types"

/**
 * Above this, a per-frame raycast costs more than the frame has to spare, so
 * the probe falls back to the bounding sphere. A displaced surface is within a
 * few percent of its bounding sphere anyway on the kind of object that gets
 * this dense.
 */
const RAYCAST_TRIANGLE_LIMIT = 90_000

export interface LiquidEngineOptions {
  /**
   * Where to put the canvas.
   *
   * The engine creates and owns the `<canvas>` rather than taking one, because
   * `dispose()` has to call `forceContextLoss()` to actually hand the WebGL
   * context back — a gallery of live previews depends on that — and a canvas
   * whose context has been force-lost can never get another one. Taking a
   * React-rendered canvas meant that under StrictMode's mount/unmount/mount,
   * the second engine landed on a dead element. Owning the element makes the
   * lifetime obvious and the failure impossible.
   */
  container: HTMLElement
  preset: LiquidPreset
  quality?: Quality
  motion?: MotionOptions
  /** Composite over the page instead of painting the preset's background. */
  transparent?: boolean
  /** Override the preset's background colour. */
  background?: string
  /** Render one still frame and stop. */
  reducedMotion?: boolean
  /**
   * The WebGL context went away — the tab was backgrounded for a long time, the
   * GPU process restarted, or too many contexts are live and the browser
   * reclaimed the oldest. Nothing on this engine works afterwards; the host
   * should throw it away and build another.
   */
  onContextLost?: (reason: string) => void
}

/**
 * The render loop.
 *
 * Deliberately plain three.js rather than react-three-fiber: the loop needs to
 * own frame timing (for adaptive resolution), pointer probing and trail
 * emission, all of which are awkward through a reconciler — and it keeps the
 * package's peer dependencies down to `three` and `react`.
 */
export class LiquidEngine {
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(38, 1, 0.1, 100)

  private renderer: WebGLRenderer
  private mesh: Mesh | null = null
  private handle: LiquidMaterialHandle | null = null
  private preset: LiquidPreset
  private quality: Quality
  private motion: MotionOptions
  private profile = resolveQuality("auto")

  private trail: Trail
  private probe = new SurfaceProbe()
  private probeMode: ProbeMode = "sphere"

  private readonly pointer = new Vector2(0, 0)
  private readonly smoothed = new Vector2(0, 0)
  private readonly normalMatrix = new Matrix3()
  private readonly spin = new Vector2(0, 0)
  private readonly dragFrom = new Vector2(0, 0)

  private press = 0
  private clickPulse = 0
  /**
   * The pointer's resting NDC is (0, 0), which is the dead centre of the
   * canvas — so without this the object renders pressed, with a well and a
   * raised lip stamped in the middle, before anyone has touched it. Nothing
   * counts as a hit until a real pointer event has arrived.
   */
  private pointerSeen = false
  private dragging = false
  private radius = 1
  private readonly extents = new Vector3(1, 1, 1)

  private frame = 0
  private running = false
  private reduced: boolean
  private transparent: boolean
  private background?: string

  private time = 0
  private lastNow = 0
  private frameAccum = 0
  private frameCount = 0
  private lastAdapt = 0
  private dpr = 1

  private detach: Array<() => void> = []
  private readonly canvas: HTMLCanvasElement

  constructor(private options: LiquidEngineOptions) {
    this.preset = options.preset
    this.quality = options.quality ?? "auto"
    this.motion = options.motion ?? {}
    this.reduced = options.reducedMotion ?? false
    this.transparent = options.transparent ?? false
    this.background = options.background
    this.profile = resolveQuality(this.quality)
    this.trail = new Trail(this.profile.trail)

    // MSAA buys almost nothing on a soft-edged liquid with a fresnel rim, and
    // it costs real fill rate on a full-bleed canvas (§5.8.4).
    this.canvas = document.createElement("canvas")
    this.canvas.style.display = "block"
    this.canvas.style.width = "100%"
    this.canvas.style.height = "100%"
    options.container.appendChild(this.canvas)

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    })
    // A context can come back already lost when the browser is at its limit —
    // it does not throw, and the failure only surfaces later as three trying to
    // read a shader info log off a dead context. Catch it here instead.
    const gl = this.renderer.getContext()
    if (!gl || gl.isContextLost()) {
      throw new Error("liquidforge: WebGL context unavailable — too many live canvases?")
    }

    this.canvas.addEventListener("webglcontextlost", this.handleContextLost, false)
    this.detach.push(() =>
      this.canvas.removeEventListener("webglcontextlost", this.handleContextLost, false),
    )

    this.dpr = Math.min(this.profile.dpr[1], typeof devicePixelRatio === "number" ? devicePixelRatio : 1)
    this.renderer.setPixelRatio(this.dpr)
    this.applyClearColor()

    this.camera.position.set(0, 0, 4.4)
    this.bindPointer()
  }

  /**
   * Preventing the default keeps the context restorable, but three's renderer
   * cannot pick up where it left off, so the honest move is to stop and tell
   * the host to rebuild.
   */
  private handleContextLost = (event: Event) => {
    event.preventDefault()
    this.stop()
    this.options.onContextLost?.("WebGL context lost")
  }

  // -- geometry --------------------------------------------------------------

  /**
   * Drop the current object and paint an empty frame.
   *
   * Something has to be renderable between "you picked Model" and "you chose a
   * file", and it is not an error — leaving the previous object on screen while
   * the panel says something else is worse than showing nothing.
   */
  clearGeometry(): void {
    this.disposeMesh()
    this.trail.clear()
    this.renderer.render(this.scene, this.camera)
  }

  /**
   * Swap in new geometry. Takes ownership: the mesh's prepared copy is disposed
   * on the next swap or on `dispose()`, but the geometry handed in is not.
   */
  setGeometry(geometry: BufferGeometry, options: { forceSphereProbe?: boolean } = {}): void {
    const prepared = prepareGeometry(geometry, {
      maxEdge: this.profile.maxEdge,
      vertexBudget: this.profile.vertexBudget,
    })

    this.disposeMesh()

    this.radius = prepared.radius
    this.extents.copy(prepared.extents)
    this.handle = createLiquidMaterial(this.preset, this.profile.trail)
    this.mesh = new Mesh(prepared.geometry, this.handle.material)
    this.scene.add(this.mesh)

    this.probeMode =
      options.forceSphereProbe || prepared.triangles > RAYCAST_TRIANGLE_LIMIT ? "sphere" : "mesh"

    this.bind(this.handle, prepared.radius)
    this.trail.clear()
    this.frameCamera()
    this.renderOnce()
  }

  /**
   * Point the material's uniforms at the engine's own state.
   *
   * The trail arrays in particular: the material is built with placeholder
   * vectors, and `Trail` keeps its own. Without this the ring buffer fills up
   * every frame and the shader reads the empty placeholders — the cursor still
   * dents the surface, so it looks like it is working, and no ripple ever
   * leaves it.
   */
  private bind(handle: LiquidMaterialHandle, radius: number): void {
    const u = handle.material.uniforms
    u.uRadius.value = radius
    u.uTrail.value = this.trail.points
    u.uTrailN.value = this.trail.normals
  }

  /**
   * Frame the object in the current viewport.
   *
   * Fitting the bounding *sphere* is the obvious version and it wastes the
   * frame: a line of text is 2 units wide and a third of a unit tall, so its
   * bounding sphere is mostly empty air and the words end up floating in the
   * middle of the canvas at half the size they should be. Fitting the box on
   * each axis separately, then backing off by its depth, uses the frame.
   *
   * The padding covers the displacement, which pushes the surface out beyond
   * the resting geometry by roughly a fifth of the radius at preset amplitudes.
   */
  private frameCamera(): void {
    const fov = (this.camera.fov * Math.PI) / 180
    const aspect = this.camera.aspect || 1
    const tan = Math.tan(fov / 2)

    const bulge = this.radius * 0.22
    const halfX = this.extents.x + bulge
    const halfY = this.extents.y + bulge
    const halfZ = this.extents.z + bulge

    const distance = Math.max(halfY / tan, halfX / (tan * aspect)) + halfZ
    this.camera.position.z = distance * 1.12
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()
  }

  // -- configuration ---------------------------------------------------------

  setPreset(preset: LiquidPreset): void {
    const familyChanged = preset.family !== this.preset.family
    this.preset = preset
    this.applyClearColor()

    if (!this.handle || !this.mesh) return

    // Family is a compile-time branch, not a uniform, so it needs a new
    // material. Everything else moves live, which is what keeps the Studio's
    // sliders from stuttering on every drag.
    if (familyChanged) {
      const next = createLiquidMaterial(preset, this.profile.trail)
      this.bind(next, this.radius)
      this.mesh.material = next.material
      this.handle.dispose()
      this.handle = next
    } else {
      applyPreset(this.handle.material, preset)
    }
    this.renderOnce()
  }

  setMotion(motion: MotionOptions): void {
    this.motion = motion
  }

  setReducedMotion(reduced: boolean): void {
    if (reduced === this.reduced) return
    this.reduced = reduced
    if (reduced) {
      this.trail.clear()
      this.press = 0
      this.stop()
      this.renderOnce()
    } else if (this.running === false) {
      this.start()
    }
  }

  setTransparent(transparent: boolean, background?: string): void {
    this.transparent = transparent
    this.background = background
    this.applyClearColor()
    this.renderOnce()
  }

  private applyClearColor(): void {
    if (this.transparent) {
      this.renderer.setClearColor(new Color(0, 0, 0), 0)
      return
    }
    const colour = this.background ?? backgroundColor(this.preset) ?? "#050506"
    this.renderer.setClearColor(new Color(colour), 1)
  }

  // -- viewport --------------------------------------------------------------

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.frameCamera()
    this.renderOnce()
  }

  // -- pointer ---------------------------------------------------------------

  /**
   * Pointer is tracked on the window, not the canvas, so a full-bleed hero keeps
   * responding while the cursor crosses the headline sitting on top of it. NDC
   * is still computed against the canvas's own rect, so a canvas in a column
   * behaves correctly too.
   */
  private bindPointer(): void {
    if (typeof window === "undefined") return
    const canvas = this.canvas

    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      this.pointerSeen = true
      this.pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
      )
      if (this.dragging) {
        this.spin.x += (event.clientX - this.dragFrom.x) * 0.005
        this.spin.y += (event.clientY - this.dragFrom.y) * 0.005
        this.dragFrom.set(event.clientX, event.clientY)
      }
    }

    const down = (event: PointerEvent) => {
      if (event.target !== canvas) return
      this.pointerSeen = true
      this.clickPulse = 1
      if (this.probe.over) this.trail.strike(this.probe.point, this.probe.normal, this.time)
      if (this.motion.draggable) {
        this.dragging = true
        this.dragFrom.set(event.clientX, event.clientY)
      }
    }

    const up = () => {
      this.dragging = false
    }

    window.addEventListener("pointermove", move, { passive: true })
    window.addEventListener("pointerdown", down, { passive: true })
    window.addEventListener("pointerup", up, { passive: true })
    window.addEventListener("pointercancel", up, { passive: true })

    this.detach.push(() => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerdown", down)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
    })
  }

  // -- loop ------------------------------------------------------------------

  start(): void {
    if (this.running) return
    if (this.reduced) {
      this.renderOnce()
      return
    }
    this.running = true
    this.lastNow = performance.now()
    const tick = () => {
      if (!this.running) return
      this.frame = requestAnimationFrame(tick)
      this.step()
    }
    this.frame = requestAnimationFrame(tick)
  }

  stop(): void {
    this.running = false
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  private step(): void {
    const mesh = this.mesh
    const handle = this.handle
    if (!mesh || !handle) return

    const now = performance.now()
    const deltaMs = now - this.lastNow
    this.lastNow = now
    // Clamp so returning to a backgrounded tab does not fast-forward every ring
    // in the buffer through its whole life in one step.
    this.time += Math.min(deltaMs, 100) / 1000

    const u = handle.material.uniforms
    u.uTime.value = this.time

    this.adaptResolution(deltaMs)

    // At 0.14 this lagged about 100ms behind the real pointer, which reads as
    // the liquid not quite knowing where the cursor is. 0.34 takes the jitter
    // off with no perceptible lag (§5.4).
    this.smoothed.lerp(this.pointer, 0.34)
    ;(u.uPointer.value as Vector2).copy(this.smoothed)

    // Orientation is applied before the probe, because the probe transforms the
    // ray through the mesh's inverse world matrix.
    const [tiltX, tiltY] = this.motion.tilt ?? [0, 0]
    const autoRotate = this.motion.autoRotate ?? 0
    mesh.rotation.set(
      tiltX + this.spin.y,
      tiltY + this.spin.x + (autoRotate ? this.time * autoRotate : 0),
      0,
    )
    mesh.updateMatrixWorld(true)

    const hit = this.probe.probe(this.smoothed, this.camera, mesh, this.probeMode)
    const over = hit.over && this.pointerSeen
    ;(u.uPtr.value as Vector3).copy(hit.point)
    ;(u.uPtrN.value as Vector3).copy(hit.normal)

    this.clickPulse *= 0.9
    this.press += ((over ? 1 : 0) - this.press) * 0.14
    u.uPress.value = Math.min(1, this.press + this.clickPulse * 0.45)

    this.trail.update(hit.point, hit.normal, {
      time: this.time,
      over,
      spacing: this.preset.surface.trailSpacing * this.radius,
    })

    // The fragment stage advects an object-space field and then needs it in view
    // space; three only declares `normalMatrix` for the vertex shader.
    mesh.modelViewMatrix.multiplyMatrices(this.camera.matrixWorldInverse, mesh.matrixWorld)
    this.normalMatrix.getNormalMatrix(mesh.modelViewMatrix)
    ;(u.uNormalMatrix.value as Matrix3).copy(this.normalMatrix)

    this.renderer.render(this.scene, this.camera)
  }

  /**
   * Walk the pixel ratio to suit the machine.
   *
   * Fragment cost dominates and scales with the square of pixel ratio, so this
   * is the most effective dial there is — and it has to be measured rather than
   * guessed, because a fixed value either wastes a fast GPU or drops frames on
   * a slow one (§5.8.1).
   */
  private adaptResolution(deltaMs: number): void {
    if (!this.profile.adaptive) return
    if (deltaMs > 0 && deltaMs < 200) {
      this.frameAccum += deltaMs
      this.frameCount++
    }
    if (this.time - this.lastAdapt < 0.75 || this.frameCount <= 12) return

    const average = this.frameAccum / this.frameCount
    this.frameAccum = 0
    this.frameCount = 0
    this.lastAdapt = this.time

    const [min, max] = this.profile.dpr
    const ceiling = Math.min(max, typeof devicePixelRatio === "number" ? devicePixelRatio : max)
    const wanted = average > 20 ? this.dpr - 0.25 : average < 12.5 ? this.dpr + 0.25 : this.dpr
    const next = Math.max(min, Math.min(ceiling, wanted))
    if (next === this.dpr) return

    this.dpr = next
    this.renderer.setPixelRatio(next)
    const size = this.renderer.getSize(new Vector2())
    this.renderer.setSize(size.x, size.y, false)
  }

  /** One frame, outside the loop — for a resize, a preset change, or reduced motion. */
  renderOnce(): void {
    const mesh = this.mesh
    const handle = this.handle
    if (!mesh || !handle) return
    mesh.updateMatrixWorld(true)
    mesh.modelViewMatrix.multiplyMatrices(this.camera.matrixWorldInverse, mesh.matrixWorld)
    this.normalMatrix.getNormalMatrix(mesh.modelViewMatrix)
    ;(handle.material.uniforms.uNormalMatrix.value as Matrix3).copy(this.normalMatrix)
    this.renderer.render(this.scene, this.camera)
  }

  // -- teardown --------------------------------------------------------------

  private disposeMesh(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh)
      this.mesh.geometry.dispose()
      this.mesh = null
    }
    this.handle?.dispose()
    this.handle = null
  }

  dispose(): void {
    this.stop()
    for (const off of this.detach) off()
    this.detach = []
    this.disposeMesh()
    // Frees the WebGL context outright; browsers cap concurrent contexts at
    // around 16 and silently blank the oldest, which is what a gallery of live
    // previews would otherwise walk into.
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }
}
