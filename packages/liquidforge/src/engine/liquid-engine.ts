import {
  BufferGeometry,
  CanvasTexture,
  Matrix4,
  Color,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix3,
  NoColorSpace,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three"
import {
  applyPreset,
  createLiquidMaterial,
  type LiquidMaterialHandle,
  type MaterialAppearance,
} from "../material/liquid-material"
import { backgroundColor } from "../material/environment"
import { computeNormals, prepareGeometry } from "./prepare-geometry"
import { SurfaceProbe, type ProbeMode, type SurfaceHit } from "./pointer"
import { Trail } from "./trail"
import { resolveQuality } from "./quality"
import type { LiquidRig } from "../forge/rig"
import type { ControlOptions, DiagnosticOptions, LiquidPreset, MaterialFamily, MotionOptions, Quality } from "../types"
import { buildRadialMap, Crossfade, envelopeError, morphAttributes, type MorphAttributes, type RadialMap } from "./morph"

/**
 * Above this, a per-frame raycast costs more than the frame has to spare, so
 * the probe falls back to the bounding sphere. A displaced surface is within a
 * few percent of its bounding sphere anyway on the kind of object that gets
 * this dense.
 */
const RAYCAST_TRIANGLE_LIMIT = 90_000

/** The shape `setGeometry` builds. Every other form is registered by key. */
export const PRIMARY_FORM = "primary"

/** A shape the object can take and a look to take it in. */
export interface Look {
  form: string
  preset: LiquidPreset
}

export interface GeometryOptions {
  /** Raycast the bounding sphere instead of the mesh; exact for a sphere. */
  forceSphereProbe?: boolean
  /**
   * Tessellate finer than the quality tier normally would. Ferrofluid spikes are
   * about a tenth of the object's radius across, and a spike needs several
   * vertices over that width to come to a point rather than a lump. Defaults to
   * whether the current look is ferrofluid.
   */
  dense?: boolean
}

/**
 * One shape, prepared and kept.
 *
 * A form is everything expensive about an object — the tessellated geometry, its
 * own surface texture, the radial map a transition aims at, a material per family
 * it has been shown in — built once, so becoming it again costs a few uniform
 * writes rather than a forge and a shader compile in the middle of a scroll.
 */
interface Form {
  key: string
  mesh: Mesh
  /** Same geometry, second material: a family change on one shape crossfades through this. */
  twin: Mesh | null
  radius: number
  extents: Vector3
  appearance: MaterialAppearance | null
  rig: LiquidRig | null
  probeMode: ProbeMode
  /** A lighter copy of the surface for the cursor raycast, when the mesh was refined. */
  probeSurface: BufferGeometry | null
  radial: RadialMap | null
  /** How far the shape sits inside its own radial envelope; see `envelopeError`. */
  fold: number
  aims: Map<string, MorphAttributes>
  handles: Map<MaterialFamily, LiquidMaterialHandle>
  /** Tessellated finely enough for ferrofluid spikes. */
  dense: boolean
}

interface Transition {
  a: Mesh
  aHandle: LiquidMaterialHandle
  b: Mesh
  bHandle: LiquidMaterialHandle
  /** How much of the picture is the second side, 0–1. */
  fade: number
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

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
  controls?: ControlOptions
  /** Switches that break the effect on purpose — see `DiagnosticOptions`. */
  diagnostic?: DiagnosticOptions
  /** Composite over the page instead of painting the preset's background. */
  transparent?: boolean
  /** Override the preset's background colour. */
  background?: string
  /** Render one still frame and stop. */
  reducedMotion?: boolean
  /**
   * Bind pointer, wheel and pinch listeners. Off for an engine used only to
   * capture stills, so a cursor somewhere else on the page cannot press a
   * dimple into a thumbnail.
   * @default true
   */
  interactive?: boolean
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
/** Distance between two tracked pointers. */
function spread(points: Map<number, { x: number; y: number }>): number {
  const [a, b] = [...points.values()]
  if (!a || !b) return 0
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export interface RecordOptions {
  /** Length of the loop. @default 4 */
  seconds?: number
  /** @default 30 */
  fps?: number
  /** Recorded frame width, independent of how large the canvas is on screen. @default 3840 */
  width?: number
  /** @default 2160 */
  height?: number
  /** Bits per second. Defaults to roughly 0.12 bits per pixel per frame. */
  bitrate?: number
  mimeType?: string
}

export class LiquidEngine {
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(38, 1, 0.1, 100)

  private renderer: WebGLRenderer
  private mesh: Mesh | null = null
  private handle: LiquidMaterialHandle | null = null
  private preset: LiquidPreset
  private quality: Quality
  private motion: MotionOptions
  private controls: ControlOptions
  private diagnostic: DiagnosticOptions
  private profile = resolveQuality("auto")

  private trail: Trail
  private probe = new SurfaceProbe()
  /**
   * A second probe for ripples that did not come from this browser's pointer.
   *
   * Sharing one would leave `probe.over` and `probe.point` describing a
   * stranger's cursor at the moment a local click asked where the local pointer
   * was.
   */
  private remoteProbe = new SurfaceProbe()
  private probeMode: ProbeMode = "sphere"

  private readonly pointer = new Vector2(0, 0)
  /** A pointer driven by code — a tracked hand, a stream event — instead of the mouse. */
  private pointerOverride: Vector2 | null = null
  private pressOverride: number | null = null
  private environment: { texture: CanvasTexture; mix: number } | null = null
  private readonly gravityTarget = new Vector3()
  private readonly gravity = new Vector3()
  private readonly gravityVelocity = new Vector3()
  private sloshAmount = 0
  private readonly worldToObject = new Matrix4()
  private readonly smoothed = new Vector2(0, 0)
  private readonly normalMatrix = new Matrix3()
  private readonly spin = new Vector2(0, 0)
  private readonly dragFrom = new Vector2(0, 0)

  private press = 0
  private clickPulse = 0
  /** A milestone splash, decaying: extra rings and a brief simmer. */
  private splashEnergy = 0
  /**
   * The pointer's resting NDC is (0, 0), which is the dead centre of the
   * canvas — so without this the object renders pressed, with a well and a
   * raised lip stamped in the middle, before anyone has touched it. Nothing
   * counts as a hit until a real pointer event has arrived.
   */
  private pointerSeen = false
  private dragging = false
  private radius = 1
  private zoom = 1
  private rig: LiquidRig | null = null
  /** The current object's own surface, for the original family. */
  private appearance: MaterialAppearance | null = null
  private readonly forms = new Map<string, Form>()
  private disposed = false
  private probeSurface: BufferGeometry | null = null
  private active: Form | null = null
  private transition: Transition | null = null
  private readonly crossfade = new Crossfade()
  private readonly bufferSize = new Vector2()
  private mutation = 0
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
    this.controls = options.controls ?? {}
    this.diagnostic = options.diagnostic ?? {}
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
    if (options.interactive !== false) {
      this.bindPointer()
      this.bindScroll()
      this.bindDeviceMotion()
    }
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
  setGeometry(geometry: BufferGeometry, options: GeometryOptions = {}): void {
    this.transition = null
    const form = this.buildForm(PRIMARY_FORM, geometry, options)
    const handle = this.handleFor(form, this.preset.family)
    handle.apply(this.preset)
    this.showOnly(form, handle)
    this.applyDiagnostic()
    this.trail.clear()
    this.frameCamera()
    this.renderOnce()
  }

  /**
   * Prepare another shape the object can become, without showing it.
   *
   * A scroll checkpoint registers each of its objects up front, so that reaching
   * one is a morph between two things already on the GPU rather than a forge and
   * a pop. Replacing a key that is on screen swaps it in place.
   */
  registerForm(key: string, geometry: BufferGeometry, options: GeometryOptions = {}): void {
    const wasActive = this.active?.key === key
    const form = this.buildForm(key, geometry, options)
    if (wasActive) {
      this.transition = null
      const handle = this.handleFor(form, this.preset.family)
      handle.apply(this.preset)
      this.showOnly(form, handle)
      this.frameCamera()
      this.renderOnce()
    }
  }

  /**
   * Whether a shape is registered under `key` — and, if `dense` is given,
   * tessellated to match, since a form built for a smooth family has too few
   * vertices to grow ferrofluid spikes.
   */
  hasForm(key: string, options: { dense?: boolean } = {}): boolean {
    const form = this.forms.get(key)
    return Boolean(form) && (options.dense === undefined || form!.dense === options.dense)
  }

  /** Every registered shape's key, the primary one included. */
  get formKeys(): string[] {
    return [...this.forms.keys()]
  }

  /** Drop one registered shape. The primary one cannot be dropped. */
  releaseForm(key: string): void {
    const form = this.forms.get(key)
    if (!form || key === PRIMARY_FORM) return
    // A transition may be drawing it as its second picture; the next look rebuilds one.
    this.transition = null
    if (this.active === form) {
      const primary = this.forms.get(PRIMARY_FORM)
      if (primary) {
        const handle = this.handleFor(primary, this.preset.family)
        this.showOnly(primary, handle)
      }
    }
    this.disposeForm(form)
    for (const other of this.forms.values()) other.aims.delete(key)
  }

  /** Drop every registered shape except the primary one. */
  releaseForms(): void {
    for (const key of this.formKeys) this.releaseForm(key)
  }

  /**
   * Build everything a look will need before it is needed: the material for
   * each family on each shape, compiled off the main thread where the browser
   * allows, and the morph targets between shapes that follow one another.
   *
   * Without this the first frame of a transition compiles a shader, which is a
   * stall of a tenth of a second or more — exactly the snap a transition exists
   * to avoid.
   */
  async warm(looks: Look[], pairs: Array<[string, string]> = []): Promise<void> {
    const scene = new Scene()
    for (const look of looks) {
      const form = this.forms.get(look.form)
      if (!form) continue
      const handle = this.handleFor(form, look.preset.family)
      scene.add(new Mesh(form.mesh.geometry, handle.material))
    }
    for (const [from, to] of pairs) {
      const a = this.forms.get(from)
      const b = this.forms.get(to)
      if (a && b && a !== b) {
        this.aimFor(a, b)
        this.aimFor(b, a)
      }
    }
    // `compile`, not `compileAsync`. Both hand the shaders to the driver, which
    // links them in the background where the browser supports that; but
    // `compileAsync` then polls each program on a timer, and if the engine is
    // disposed before it finishes — React mounts effects twice in development —
    // the poll reads a program that no longer exists and throws where nothing
    // can catch it. Starting the compile is the part that matters: by the time a
    // transition draws with these materials, the link is done.
    if (this.disposed) return
    try {
      this.renderer.compile(scene, this.camera)
      if (pairs.length > 0 || looks.some((look) => look.preset.family !== this.preset.family)) {
        this.crossfade.warm(this.renderer, scene, this.camera)
      }
    } catch {
      // A shader that fails here fails the same way on first draw, where the
      // engine already reports it.
    }
  }

  /**
   * Be `from`, or `to`, or anywhere between.
   *
   * `t` is how far along the transition is — 0 is entirely `from`, 1 entirely
   * `to` — and can move in either direction, since scrolling back up has to undo
   * a transformation as smoothly as scrolling down made it. Between the two:
   *
   * - the shapes morph toward each other along their radial maps, so the old one
   *   arrives at the new silhouette and the new one leaves the old;
   * - each side keeps its own material, so a change of family is never a
   *   recompile mid-scroll;
   * - and for the stretch where both are visible, the two finished pictures are
   *   mixed, which is the only kind of handover with no frame where one is
   *   swapped for the other.
   */
  setLook(from: Look, to: Look | null = null, t = 0): void {
    const a = this.forms.get(from.form) ?? this.forms.get(PRIMARY_FORM)
    if (!a) return
    const b = to ? (this.forms.get(to.form) ?? this.forms.get(PRIMARY_FORM) ?? a) : null
    const k = Math.max(0, Math.min(1, t))

    if (!b || !to || k <= 0 || k >= 1) {
      const [form, look] = !b || !to || k <= 0 ? [a, from] : [b, to]
      this.transition = null
      this.preset = look.preset
      const handle = this.handleFor(form, look.preset.family)
      handle.apply(look.preset)
      handle.material.uniforms.uMorph.value = 0
      this.showOnly(form, handle)
      this.applyClearColor()
      this.frameCamera()
      return
    }

    const sameForm = a === b
    const aHandle = this.handleFor(a, from.preset.family)
    aHandle.apply(from.preset)

    // One shape, one family: nothing to hand over. The caller has already bred
    // the numbers, so this is a uniform write like any slider.
    if (sameForm && from.preset.family === to.preset.family) {
      this.transition = null
      this.preset = k < 0.5 ? from.preset : to.preset
      aHandle.apply(this.preset)
      aHandle.material.uniforms.uMorph.value = 0
      this.showOnly(a, aHandle)
      this.applyClearColor(from.preset, to.preset, k)
      return
    }

    let bMesh: Mesh
    let bHandle: LiquidMaterialHandle
    if (sameForm) {
      bHandle = this.handleFor(b, to.preset.family)
      if (!b.twin) {
        b.twin = new Mesh(b.mesh.geometry, bHandle.material)
        b.twin.visible = false
        this.scene.add(b.twin)
      }
      bMesh = b.twin
      aHandle.material.uniforms.uMorph.value = 0
      bHandle.material.uniforms.uMorph.value = 0
    } else {
      bHandle = this.handleFor(b, to.preset.family)
      bMesh = b.mesh
      this.bindAim(a, b)
      this.bindAim(b, a)
      aHandle.material.uniforms.uMorph.value = k
      bHandle.material.uniforms.uMorph.value = 1 - k
    }
    bHandle.apply(to.preset)
    a.mesh.material = aHandle.material
    bMesh.material = bHandle.material

    // The dominant side takes the pointer, the rig and the per-frame uniforms;
    // the other is synced from it before each draw.
    const dominant = k < 0.5 ? a : b
    this.preset = k < 0.5 ? from.preset : to.preset
    this.adopt(dominant, k < 0.5 ? aHandle : bHandle, k < 0.5 ? a.mesh : bMesh)

    this.radius = a.radius + (b.radius - a.radius) * k
    this.extents.copy(a.extents).lerp(b.extents, k)
    aHandle.material.uniforms.uRadius.value = this.radius
    bHandle.material.uniforms.uRadius.value = this.radius

    // A new family on the same shape changes nothing but the material, so it
    // fades the whole way. A new shape hands over in a short stretch placed
    // where the two morphing meshes are closest: late when leaving a shape that
    // folds in on itself, early when arriving at one.
    let fade: number
    if (sameForm) {
      fade = smoothstep(0, 1, k)
    } else {
      const centre = Math.max(0.4, Math.min(0.6, 0.5 + ((a.fold - b.fold) / (a.fold + b.fold + 1e-3)) * 0.1))
      fade = smoothstep(centre - 0.28, centre + 0.28, k)
    }
    this.transition = { a: a.mesh, aHandle, b: bMesh, bHandle, fade }
    this.applyClearColor(from.preset, to.preset, k)
    this.frameCamera()
  }

  private buildForm(key: string, geometry: BufferGeometry, options: GeometryOptions): Form {
    const dense = options.dense ?? this.preset.family === "ferrofluid"
    const prepared = prepareGeometry(geometry, {
      maxEdge: dense ? Math.min(this.profile.maxEdge, this.profile.maxEdge * 0.45) : this.profile.maxEdge,
      vertexBudget: dense ? this.profile.vertexBudget * 2 : this.profile.vertexBudget,
    })

    const previous = this.forms.get(key)
    if (previous) this.disposeForm(previous)
    // Every morph aimed at the old version of this shape is aimed at the wrong one.
    for (const other of this.forms.values()) other.aims.delete(key)

    let appearance: MaterialAppearance | null = null
    if (prepared.appearance) {
      let texture: CanvasTexture | null = null
      if (prepared.appearance.atlas) {
        texture = new CanvasTexture(prepared.appearance.atlas)
        // Raw bytes in, raw bytes out: the families write their colour without
        // a conversion, so a texture read without one looks like itself.
        texture.colorSpace = NoColorSpace
        // Matches glTF's own convention, which the atlas was packed in.
        texture.flipY = false
        // No mipmaps: a cell's neighbours would bleed into it at the small end
        // of the chain, and the atlas is already sized for the object on screen.
        texture.generateMipmaps = false
        texture.minFilter = LinearFilter
        texture.magFilter = LinearFilter
        texture.needsUpdate = true
      }
      appearance = { texture, rects: prepared.appearance.rects }
    }

    const form: Form = {
      key,
      mesh: new Mesh(prepared.geometry),
      twin: null,
      radius: prepared.radius,
      extents: prepared.extents.clone(),
      appearance,
      rig: null,
      probeMode:
        options.forceSphereProbe ||
        (prepared.probe ? prepared.probe.getAttribute("position").count / 3 : prepared.triangles) > RAYCAST_TRIANGLE_LIMIT
          ? "sphere"
          : "mesh",
      probeSurface: prepared.probe ?? null,
      radial: null,
      fold: 0,
      aims: new Map(),
      handles: new Map(),
      dense,
    }
    form.mesh.visible = false
    this.scene.add(form.mesh)

    // An animated source rewrites its own positions each frame. It reuses the
    // weld groups computed above rather than re-bucketing, which is what makes
    // rebuilding both normal sets per frame affordable at all.
    const rig = geometry.userData?.rig as LiquidRig | undefined
    if (rig) {
      const normal = prepared.geometry.getAttribute("normal").array as Float32Array
      const flowNormal = prepared.geometry.getAttribute("flowNormal").array as Float32Array
      rig.bind(prepared.geometry, (positions) =>
        computeNormals(positions, prepared.weld, normal, flowNormal),
      )
      form.rig = rig
      rig.play(this.motion.animation ?? true)
    }

    this.forms.set(key, form)
    return form
  }

  /** The material for a family on a shape, built once and kept. */
  private handleFor(form: Form, family: MaterialFamily): LiquidMaterialHandle {
    let handle = form.handles.get(family)
    if (!handle) {
      handle = createLiquidMaterial({ ...this.preset, family }, this.profile.trail, form.appearance)
      this.bind(handle, form.radius)
      this.bindEnvironment(handle)
      handle.material.uniforms.uSlosh.value = this.sloshAmount
      form.handles.set(family, handle)
      const u = handle.material.uniforms
      u.uRebuildNormals.value = this.diagnostic.rebuildNormals === false ? 0 : 1
      u.uWeldSeams.value = this.diagnostic.weldSeams === false ? 0 : 1
    }
    return handle
  }

  private aimFor(form: Form, target: Form): MorphAttributes {
    let aim = form.aims.get(target.key)
    if (!aim) {
      this.radialOf(target)
      this.radialOf(form)
      aim = morphAttributes(form.mesh.geometry, target.radial!)
      form.aims.set(target.key, aim)
    }
    return aim
  }

  private radialOf(form: Form): RadialMap {
    if (!form.radial) {
      form.radial = buildRadialMap(form.mesh.geometry)
      form.fold = envelopeError(form.mesh.geometry, form.radial, form.radius)
    }
    return form.radial
  }

  private bindAim(form: Form, target: Form): void {
    const aim = this.aimFor(form, target)
    const geometry = form.mesh.geometry
    if (geometry.getAttribute("morphPos") !== aim.position) geometry.setAttribute("morphPos", aim.position)
    if (geometry.getAttribute("morphNrm") !== aim.normal) geometry.setAttribute("morphNrm", aim.normal)
  }

  /** Show exactly one mesh, and make it the one everything else reads. */
  private showOnly(form: Form, handle: LiquidMaterialHandle): void {
    for (const other of this.forms.values()) {
      other.mesh.visible = false
      if (other.twin) other.twin.visible = false
    }
    form.mesh.material = handle.material
    form.mesh.visible = true
    // A material last used halfway through a transition still holds that
    // morph; shown on its own, it must be the shape it is.
    handle.material.uniforms.uMorph.value = 0
    this.adopt(form, handle, form.mesh)
    this.radius = form.radius
    this.extents.copy(form.extents)
    handle.material.uniforms.uRadius.value = form.radius
  }

  private adopt(form: Form, handle: LiquidMaterialHandle, mesh: Mesh): void {
    this.active = form
    this.mesh = mesh
    this.handle = handle
    this.appearance = form.appearance
    this.rig = form.rig
    this.probeMode = form.probeMode
    this.probeSurface = form.probeSurface
    handle.material.uniforms.uMutation.value = this.mutation
  }

  private disposeForm(form: Form): void {
    this.scene.remove(form.mesh)
    if (form.twin) this.scene.remove(form.twin)
    form.rig?.dispose()
    form.appearance?.texture?.dispose()
    form.mesh.geometry.dispose()
    form.probeSurface?.dispose()
    for (const handle of form.handles.values()) handle.dispose()
    this.forms.delete(form.key)
    if (this.active === form) {
      this.active = null
      this.mesh = null
      this.handle = null
      this.rig = null
      this.appearance = null
      this.transition = null
    }
  }

  /**
   * Copy the per-frame state the dominant side was given onto the other, then
   * draw — one render, or two mixed.
   */
  private draw(): void {
    const transition = this.transition
    if (!transition) {
      this.renderer.render(this.scene, this.camera)
      return
    }

    const { a, b, aHandle, bHandle, fade } = transition
    const lead = this.handle === aHandle ? aHandle : bHandle
    const follow = lead === aHandle ? bHandle : aHandle
    const from = lead.material.uniforms
    const into = follow.material.uniforms
    for (const name of ["uTime", "uPress", "uMutation", "uRadius", "uSlosh", "uMagnetPull"]) into[name].value = from[name].value
    ;(into.uGravity.value as Vector3).copy(from.uGravity.value as Vector3)
    ;(into.uMagnet.value as Vector3).copy(from.uMagnet.value as Vector3)
    ;(into.uPtr.value as Vector3).copy(from.uPtr.value as Vector3)
    ;(into.uPtrN.value as Vector3).copy(from.uPtrN.value as Vector3)
    ;(into.uPointer.value as Vector2).copy(from.uPointer.value as Vector2)
    const leadMesh = lead === aHandle ? a : b
    const followMesh = lead === aHandle ? b : a
    followMesh.rotation.copy(leadMesh.rotation)
    followMesh.updateMatrixWorld(true)
    followMesh.modelViewMatrix.multiplyMatrices(this.camera.matrixWorldInverse, followMesh.matrixWorld)
    ;(into.uNormalMatrix.value as Matrix3).getNormalMatrix(followMesh.modelViewMatrix)

    for (const form of this.forms.values()) {
      form.mesh.visible = false
      if (form.twin) form.twin.visible = false
    }

    if (fade <= 0.001 || fade >= 0.999) {
      ;(fade <= 0.001 ? a : b).visible = true
      this.renderer.render(this.scene, this.camera)
      return
    }

    const size = this.renderer.getDrawingBufferSize(this.bufferSize)
    this.crossfade.render(
      this.renderer,
      size.x,
      size.y,
      () => {
        a.visible = true
        b.visible = false
        this.renderer.render(this.scene, this.camera)
      },
      () => {
        a.visible = false
        b.visible = true
        this.renderer.render(this.scene, this.camera)
      },
      fade,
    )
    a.visible = false
    b.visible = false
    ;(fade < 0.5 ? a : b).visible = true
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
    u.uMutation.value = this.mutation
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
    this.camera.position.z = distance * 1.12 * this.zoom
    this.camera.lookAt(0, 0, 0)
    this.camera.updateProjectionMatrix()
  }

  // -- configuration ---------------------------------------------------------

  /**
   * Take a new look without an extra frame.
   *
   * For callers that change the preset continuously — a scroll checkpoint
   * breeding one colourway into the next — and already have a render loop
   * running. `setPreset` renders once on every call so a still canvas updates;
   * at scroll rate that doubles the work of every frame.
   */
  setPresetLive(preset: LiquidPreset): void {
    this.applyPresetState(preset)
  }

  setPreset(preset: LiquidPreset): void {
    this.applyPresetState(preset)
    this.renderOnce()
  }

  private applyPresetState(preset: LiquidPreset): void {
    const familyChanged = preset.family !== this.preset.family
    this.preset = preset
    this.applyClearColor()

    if (!this.handle || !this.mesh) return

    // Family is a compile-time branch, not a uniform, so it needs a different
    // material — kept per shape, so going back to a family already seen is free.
    // Everything else moves live, which is what keeps the Studio's sliders from
    // stuttering on every drag.
    if (familyChanged && this.active) {
      this.transition = null
      const next = this.handleFor(this.active, preset.family)
      next.apply(preset)
      this.showOnly(this.active, next)
      this.applyDiagnostic()
    } else {
      applyPreset(this.handle.material, preset)
    }
  }

  /**
   * How far into a melt the surface is, 0 to 1.
   *
   * Nothing in the engine drives this on its own. A placement changing object at
   * a scroll checkpoint does: it raises this toward 1, swaps the geometry while
   * the surface is boiling too hard to read, and lets it fall back. The value is
   * kept here so a material rebuilt mid-melt picks it up.
   */
  setMutation(value: number): void {
    this.mutation = Math.max(0, Math.min(1, value))
    const u = this.handle?.material.uniforms
    if (u?.uMutation) u.uMutation.value = this.mutation
    if (this.transition) {
      this.transition.aHandle.material.uniforms.uMutation.value = this.mutation
      this.transition.bHandle.material.uniforms.uMutation.value = this.mutation
    }
    if (!this.running) this.renderOnce()
  }

  /** Whether the render loop is running, as opposed to drawing only on demand. */
  get isRunning(): boolean {
    return this.running
  }

  /** Whether the current object carries its own surface. */
  get hasAppearance(): boolean {
    return this.appearance !== null
  }

  /** A rotation set from outside — a scroll path's turn and tilt — in radians. */
  private readonly orientation = new Vector2(0, 0)

  /**
   * Turn the object in 3D from code, in radians: `tilt` around the horizontal
   * axis (positive brings the top toward the viewer), `turn` around the vertical
   * one. Added to the resting tilt, the idle spin and whatever the visitor has
   * dragged, so a placement can rotate the object as the page scrolls without
   * taking the gesture away.
   */
  setOrientation(tilt: number, turn: number): void {
    if (this.orientation.x === tilt && this.orientation.y === turn) return
    this.orientation.set(tilt, turn)
    if (!this.running && this.mesh) {
      this.applyRotation(this.mesh)
      this.renderOnce()
    }
  }

  private applyRotation(mesh: Mesh): void {
    const [tiltX, tiltY] = this.motion.tilt ?? [0, 0]
    const autoRotate = this.motion.autoRotate ?? 0
    mesh.rotation.set(
      tiltX + this.spin.y + this.orientation.x,
      tiltY + this.spin.x + this.orientation.y + (autoRotate ? this.time * autoRotate : 0),
      0,
    )
    mesh.updateMatrixWorld(true)
  }

  setMotion(motion: MotionOptions): void {
    const changed = motion.animation !== this.motion.animation
    this.motion = motion
    if (changed) this.rig?.play(motion.animation ?? true)
  }

  setControls(controls: ControlOptions): void {
    this.controls = controls
  }

  setDiagnostic(diagnostic: DiagnosticOptions): void {
    this.diagnostic = diagnostic
    this.applyDiagnostic()
    this.renderOnce()
  }

  private applyDiagnostic(): void {
    for (const form of this.forms.values()) {
      for (const handle of form.handles.values()) {
        const u = handle.material.uniforms
        u.uRebuildNormals.value = this.diagnostic.rebuildNormals === false ? 0 : 1
        u.uWeldSeams.value = this.diagnostic.weldSeams === false ? 0 : 1
      }
    }
  }

  /** Multiplier on the auto-framed camera distance. 1 is the framed default. */
  setZoom(zoom: number): void {
    const [min, max] = this.controls.zoomRange ?? [0.35, 3]
    this.zoom = Math.max(min, Math.min(max, zoom))
    this.frameCamera()
    this.renderOnce()
  }

  getZoom(): number {
    return this.zoom
  }

  resetView(): void {
    this.zoom = 1
    this.spin.set(0, 0)
    this.frameCamera()
    this.renderOnce()
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

  private readonly clearColour = new Color()
  private readonly mixColour = new Color()
  private readonly rgbA = { r: 0, g: 0, b: 0 }
  private readonly rgbB = { r: 0, g: 0, b: 0 }

  /**
   * Paint the ground. Between two looks it is mixed from both, so a colourway
   * lit for a studio-grey page arriving from one lit for black brings its
   * ground in gradually rather than switching it halfway through the melt.
   */
  private applyClearColor(from?: LiquidPreset, to?: LiquidPreset, t = 0): void {
    /*
     * `transparent` is the flag and `background` is a colour, but
     * `background="transparent"` is the obvious thing to write and reads as if
     * it should work. Left alone, three parses that string as an unknown colour
     * and clears opaque black — an object on a white card, with no error. So the
     * spelling is accepted rather than punished.
     */
    if (this.transparent || this.background === "transparent") {
      this.renderer.setClearColor(new Color(0, 0, 0), 0)
      return
    }
    const colour = this.background ?? backgroundColor(this.preset) ?? "#050506"
    if (!this.background && from && to) {
      const a = backgroundColor(from)
      const b = backgroundColor(to)
      if (a && b && a !== b) {
        // Mixed in sRGB, the way CSS mixes a page's own background, so a page
        // fading its ground alongside the canvas stays the same colour as it.
        const from = this.clearColour.set(a).getRGB(this.rgbA, SRGBColorSpace)
        const into = this.mixColour.set(b).getRGB(this.rgbB, SRGBColorSpace)
        const k = Math.max(0, Math.min(1, t))
        this.clearColour.setRGB(from.r + (into.r - from.r) * k, from.g + (into.g - from.g) * k, from.b + (into.b - from.b) * k, SRGBColorSpace)
        this.renderer.setClearColor(this.clearColour, 1)
        return
      }
    }
    this.renderer.setClearColor(this.clearColour.set(colour), 1)
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
        // A finger moving up or down is scrolling the page, which the browser
        // handles; tipping the object with it as well would fight the scroll.
        if (event.pointerType !== "touch" || this.controls.zoom) this.spin.y += (event.clientY - this.dragFrom.y) * 0.005
        this.dragFrom.set(event.clientX, event.clientY)
      }
    }

    const down = (event: PointerEvent) => {
      if (event.target !== canvas) return
      this.pointerSeen = true
      this.clickPulse = 1
      if (this.probe.over) this.trail.strike(this.probe.point, this.probe.normal, this.time)
      if (this.motion.draggable !== false) {
        this.dragging = true
        this.dragFrom.set(event.clientX, event.clientY)
      }
    }

    const up = (event: PointerEvent) => {
      this.dragging = false
      // A mouse stays where it was left; a lifted finger is gone. Without this
      // the dent, and ferrofluid's spikes, stay pinned where the last touch was.
      if (event.pointerType === "touch") this.pointerSeen = false
    }

    /**
     * Wheel-to-zoom is opt-in and `passive: false`, because it has to call
     * `preventDefault` — otherwise the page scrolls at the same time and the
     * hero appears to fight the visitor for the gesture.
     */
    const wheel = (event: WheelEvent) => {
      if (!this.controls.zoom) return
      event.preventDefault()
      // Exponential, so a notch feels the same at every distance.
      this.setZoom(this.zoom * Math.exp(event.deltaY * 0.0012))
    }

    /** Pinch, tracked as the distance between two live pointers. */
    const pinch = new Map<number, { x: number; y: number }>()
    let pinchFrom = 0

    const pinchDown = (event: PointerEvent) => {
      if (!this.controls.zoom || event.target !== canvas) return
      pinch.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pinch.size === 2) {
        pinchFrom = spread(pinch)
        // Two fingers means zoom, not spin.
        this.dragging = false
      }
    }

    const pinchMove = (event: PointerEvent) => {
      if (!pinch.has(event.pointerId)) return
      pinch.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pinch.size !== 2 || pinchFrom === 0) return
      const now = spread(pinch)
      if (now > 0) {
        this.setZoom(this.zoom * (pinchFrom / now))
        pinchFrom = now
      }
    }

    const pinchUp = (event: PointerEvent) => {
      pinch.delete(event.pointerId)
      if (pinch.size < 2) pinchFrom = 0
    }

    const doubleClick = (event: MouseEvent) => {
      if (event.target !== canvas) return
      this.resetView()
    }

    window.addEventListener("pointermove", move, { passive: true })
    window.addEventListener("pointerdown", down, { passive: true })
    window.addEventListener("pointerup", up, { passive: true })
    window.addEventListener("pointercancel", up, { passive: true })
    window.addEventListener("pointerdown", pinchDown, { passive: true })
    window.addEventListener("pointermove", pinchMove, { passive: true })
    window.addEventListener("pointerup", pinchUp, { passive: true })
    window.addEventListener("pointercancel", pinchUp, { passive: true })
    canvas.addEventListener("wheel", wheel, { passive: false })
    canvas.addEventListener("dblclick", doubleClick)

    this.detach.push(() => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerdown", down)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      window.removeEventListener("pointerdown", pinchDown)
      window.removeEventListener("pointermove", pinchMove)
      window.removeEventListener("pointerup", pinchUp)
      window.removeEventListener("pointercancel", pinchUp)
      canvas.removeEventListener("wheel", wheel)
      canvas.removeEventListener("dblclick", doubleClick)
    })
  }

  /**
   * Scroll as an input.
   *
   * A trail entry is a point, a normal and an amplitude — it does not care
   * where those came from, so anything that produces a position and a strength
   * can drive the surface. Scroll is the cheapest of those because it is
   * already happening on every page this will ever sit on.
   */
  private bindScroll(): void {
    if (typeof window === "undefined") return
    let last = window.scrollY

    const onScroll = () => {
      const strength = this.motion.scrollRipple ?? 0
      if (!strength || !this.running) return
      const delta = Math.abs(window.scrollY - last)
      last = window.scrollY
      if (delta < 4) return
      // Emitted at the last known surface point, so the wake follows wherever
      // the reader's pointer happened to leave it.
      this.trail.emit(
        this.probe.point,
        this.probe.normal,
        Math.min(1.6, (delta / 90) * strength),
        this.time,
      )
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    this.detach.push(() => window.removeEventListener("scroll", onScroll))
  }

  /**
   * Tilt as an input.
   *
   * The pointer is just a position in normalised device coordinates, so the
   * phone's orientation can stand in for it: roll becomes x, pitch becomes y.
   * The pitch is measured against a baseline taken from the first reading and
   * drifted slowly toward the current one, because nobody holds a phone flat and
   * everyone holds it at a different angle — a fixed zero would pin the well to
   * the bottom edge for half the people looking at it.
   */
  private bindDeviceMotion(): void {
    if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") return
    const setting = this.motion.deviceMotion ?? "auto"
    if (setting === false) return
    const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches
    if (setting === "auto" && !coarse) return

    let baseline: number | null = null
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return
      if (baseline === null) baseline = event.beta
      baseline += (event.beta - baseline) * 0.004
      const x = Math.max(-1, Math.min(1, event.gamma / 28))
      const y = Math.max(-1, Math.min(1, -(event.beta - baseline) / 28))
      this.pointer.set(x * 0.85, y * 0.85)
      this.pointerSeen = true
    }
    const listen = () => {
      window.addEventListener("deviceorientation", onOrientation)
      this.detach.push(() => window.removeEventListener("deviceorientation", onOrientation))
    }

    const gated = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }
    if (typeof gated.requestPermission === "function") {
      // iOS will only ask inside a user gesture. The first tap anywhere is the
      // earliest honest moment, and asking on load is simply refused.
      const ask = () => {
        gated.requestPermission?.()
          .then((answer) => {
            if (answer === "granted") listen()
          })
          .catch(() => {})
      }
      window.addEventListener("touchend", ask, { once: true, passive: true })
      this.detach.push(() => window.removeEventListener("touchend", ask))
    } else {
      listen()
    }
  }

  /**
   * Audio as an input.
   *
   * One analyser over the low band, sampled per frame. Built lazily because
   * creating an `AudioContext` before a user gesture is blocked in every
   * browser, and connecting one to an element the page has not been given
   * permission to read throws.
   */
  private audioAnalyser: AnalyserNode | null = null
  private audioSource: MediaElementAudioSourceNode | null = null
  private audioBins: Uint8Array<ArrayBuffer> | null = null
  private audioElement: HTMLMediaElement | null = null

  /** A level fed from code — a soundtrack analysed ahead of time — instead of an element. */
  private audioLevelOverride: number | null = null

  /**
   * Set the audio level directly, 0–1, instead of analysing an element.
   *
   * For renders: a track analysed ahead of time drives each frame exactly,
   * where a live analyser would hear whatever happened to be playing. Null
   * goes back to the element, if there is one.
   */
  setAudioLevel(level: number | null): void {
    this.audioLevelOverride = level === null ? null : Math.max(0, Math.min(1.5, level))
  }

  private updateAudio(): number {
    if (this.audioLevelOverride !== null) return this.audioLevelOverride
    const element = this.motion.audio ?? null
    if (!element) return 0

    if (element !== this.audioElement) {
      this.audioElement = element
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const context = new Ctor()
        this.audioSource = context.createMediaElementSource(element)
        this.audioAnalyser = context.createAnalyser()
        this.audioAnalyser.fftSize = 128
        this.audioSource.connect(this.audioAnalyser)
        // Straight through, or the page goes silent the moment it is analysed.
        this.audioAnalyser.connect(context.destination)
        this.audioBins = new Uint8Array(new ArrayBuffer(this.audioAnalyser.frequencyBinCount))
      } catch {
        this.audioAnalyser = null
      }
    }

    if (!this.audioAnalyser || !this.audioBins) return 0
    this.audioAnalyser.getByteFrequencyData(this.audioBins)
    // The bottom eighth of the spectrum: kick and bass, which is what anyone
    // watching expects the surface to move with.
    let sum = 0
    const bands = Math.max(1, Math.floor(this.audioBins.length / 8))
    for (let i = 0; i < bands; i++) sum += this.audioBins[i]
    return sum / bands / 255
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

  /**
   * One frame of simulation and render.
   *
   * `fixedDeltaMs` is for offline rendering: every frame advances by exactly
   * that much, however long it took to encode the one before, so a recording
   * plays back at the speed it was simulated and never drops a frame.
   */
  private step(fixedDeltaMs?: number): void {
    const mesh = this.mesh
    const handle = this.handle
    if (!mesh || !handle) return

    const now = performance.now()
    const deltaMs = fixedDeltaMs ?? now - this.lastNow
    this.lastNow = now
    // Clamp so returning to a backgrounded tab does not fast-forward every ring
    // in the buffer through its whole life in one step.
    this.time += Math.min(deltaMs, 100) / 1000

    const u = handle.material.uniforms
    u.uTime.value = this.time

    // Before anything reads the surface: the probe raycasts it and the shader
    // displaces it, and both want this frame's pose rather than last frame's.
    this.rig?.update((Math.min(deltaMs, 100) / 1000) * (this.motion.animationSpeed ?? 1))

    this.adaptResolution(deltaMs)

    // At 0.14 this lagged about 100ms behind the real pointer, which reads as
    // the liquid not quite knowing where the cursor is. 0.34 takes the jitter
    // off with no perceptible lag (§5.4).
    // A recording drives the pointer itself, so the loop is the same every
    // time and closes on itself.
    const scripted = this.scriptedPointer() ?? this.pointerOverride
    this.smoothed.lerp(scripted ?? this.pointer, scripted ? 0.5 : 0.34)
    if (scripted) this.pointerSeen = true
    ;(u.uPointer.value as Vector2).copy(this.smoothed)

    // Orientation is applied before the probe, because the probe transforms the
    // ray through the mesh's inverse world matrix.
    this.applyRotation(mesh)

    if (this.sloshAmount > 0) {
      // A damped spring toward the target, so a quick tilt overshoots and
      // settles instead of the surface snapping to the new level.
      const dt = Math.min(deltaMs, 100) / 1000
      this.gravityVelocity.addScaledVector(this.gravityTarget.clone().sub(this.gravity), 38 * dt)
      this.gravityVelocity.multiplyScalar(Math.exp(-4.2 * dt))
      this.gravity.addScaledVector(this.gravityVelocity, dt * 6)
      this.worldToObject.copy(mesh.matrixWorld).invert()
      const local = this.gravity.clone().transformDirection(this.worldToObject).multiplyScalar(Math.min(1.4, this.gravity.length()))
      ;(u.uGravity.value as Vector3).copy(local)
    }

    // The flat projection is what this used to do and what almost every version
    // of this effect still does: map the pointer straight onto the object's
    // disc. Correct at dead centre, and further out the further you go.
    const mode = this.diagnostic.rayCast === false ? "flat" : this.probeMode
    const hit =
      mode === "flat"
        ? this.probe.flat(this.smoothed, mesh)
        : this.probe.probe(this.smoothed, this.camera, mesh, this.probeMode, this.probeSurface)
    const over = hit.over && this.pointerSeen
    ;(u.uPtr.value as Vector3).copy(hit.point)
    ;(u.uPtrN.value as Vector3).copy(hit.normal)
    this.updateMagnet(hit, Math.min(deltaMs, 100) / 1000, mesh)
    ;(u.uMagnet.value as Vector3).copy(this.magnet)
    u.uMagnetPull.value = this.magnetPull

    this.clickPulse *= 0.9
    if (this.splashEnergy > 0.002) {
      this.splashEnergy *= 0.965
      const simmer = Math.max(this.mutation, this.splashEnergy * 0.5)
      u.uMutation.value = simmer
      if (this.transition) {
        this.transition.aHandle.material.uniforms.uMutation.value = simmer
        this.transition.bHandle.material.uniforms.uMutation.value = simmer
      }
    } else if (this.splashEnergy > 0) {
      this.splashEnergy = 0
      u.uMutation.value = this.mutation
    }
    const pressing = this.pressOverride ?? 1
    this.press += ((over ? pressing : 0) - this.press) * 0.14
    u.uPress.value = Math.min(1, this.press + this.clickPulse * 0.45)

    // Audio rides on top of the pointer: it adds energy where the surface
    // already is rather than replacing the interaction.
    const level = this.updateAudio()
    if (level > 0.12) {
      this.trail.emit(hit.point, hit.normal, Math.min(2.2, level * 2.4), this.time)
    }

    if (this.diagnostic.trail === false) {
      // One source at the cursor and nothing else — the version where every
      // ripple freezes the moment the pointer stops.
      this.trail.clear()
      if (over) this.trail.emit(hit.point, hit.normal, 1, this.time)
    } else {
      this.trail.update(hit.point, hit.normal, {
        time: this.time,
        over,
        spacing: this.preset.surface.trailSpacing * this.radius,
      })
    }

    // The fragment stage advects an object-space field and then needs it in view
    // space; three only declares `normalMatrix` for the vertex shader.
    mesh.modelViewMatrix.multiplyMatrices(this.camera.matrixWorldInverse, mesh.matrixWorld)
    this.normalMatrix.getNormalMatrix(mesh.modelViewMatrix)
    ;(u.uNormalMatrix.value as Matrix3).copy(this.normalMatrix)

    this.draw()
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
    // A recording owns the resolution; letting this walk it down mid-take is
    // how a 4K export comes out at 1600px.
    if (!this.profile.adaptive || this.recording) return
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

  /**
   * Copy the current frame into a 2D canvas.
   *
   * The copy has to happen in the same task as the render: a WebGL drawing
   * buffer is cleared once the browser composites it, and `preserveDrawingBuffer`
   * would cost a full-buffer copy on every frame of every scene just to serve
   * this one. Rendering and copying back to back avoids both.
   */
  snapshotTo(target: HTMLCanvasElement): boolean {
    if (!this.mesh || !this.handle) return false
    this.renderOnce()
    const context = target.getContext("2d")
    if (!context) return false
    context.clearRect(0, 0, target.width, target.height)
    context.drawImage(this.canvas, 0, 0, target.width, target.height)
    return true
  }

  /**
   * A still of the current frame, at a size of your choosing, as an image file.
   *
   * For the `poster` prop: the page paints this first, as its largest image,
   * and the live surface fades in over it once the browser has time. Rendered
   * at the requested size rather than the on-screen one, the same way a
   * recording is, so a poster for a 1600px hero is not a 400px thumbnail
   * scaled up.
   */
  async posterBlob(
    width = 1600,
    height = 1000,
    type = "image/webp",
    quality = 0.9,
  ): Promise<Blob | null> {
    if (!this.mesh || !this.handle) return null
    const previous = this.renderer.getSize(new Vector2())
    const previousDpr = this.dpr
    const wasRecording = this.recording
    this.recording = true
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.frameCamera()

    // Rendered and read in the same task, or the drawing buffer is already gone.
    const blob = await new Promise<Blob | null>((resolve) => {
      this.renderOnce()
      this.canvas.toBlob(resolve, type, quality)
    })

    this.recording = wasRecording
    this.renderer.setPixelRatio(previousDpr)
    this.renderer.setSize(previous.x, previous.y, false)
    this.camera.aspect = previous.x / previous.y || 1
    this.frameCamera()
    this.renderOnce()
    return blob
  }

  /** One frame, outside the loop — for a resize, a preset change, or reduced motion. */
  renderOnce(): void {
    const mesh = this.mesh
    const handle = this.handle
    // A recording draws every step itself. A look, a splash or a mutation set
    // from its `beforeStep` would otherwise draw the frame a second time.
    if (!mesh || !handle || this.recording) return
    mesh.updateMatrixWorld(true)
    mesh.modelViewMatrix.multiplyMatrices(this.camera.matrixWorldInverse, mesh.matrixWorld)
    this.normalMatrix.getNormalMatrix(mesh.modelViewMatrix)
    ;(handle.material.uniforms.uNormalMatrix.value as Matrix3).copy(this.normalMatrix)
    this.draw()
  }

  // -- teardown --------------------------------------------------------------

  /**
   * Record a loop of the surface being disturbed.
   *
   * The thing that makes this material worth using is that it moves, and a
   * still cannot carry that — so the one asset people would actually post was
   * the one asset the library could not produce.
   *
   * The cursor path is scripted rather than recorded live, and it starts and
   * ends in the same place, so the loop closes invisibly. `MediaRecorder` on
   * the canvas stream does the rest.
   */
  async recordLoop(options: RecordOptions = {}): Promise<Blob> {
    const {
      seconds = 4,
      fps = 30,
      width = 3840,
      height = 2160,
      // Roughly 0.12 bits per pixel per frame. At 4K that is about 30 Mbps —
      // an order of magnitude above the browser default, which is tuned for
      // video calls and turns a chrome gradient into blocks.
      bitrate = Math.round(width * height * fps * 0.12),
    } = options

    if (typeof MediaRecorder === "undefined") {
      throw new Error("liquidforge: this browser cannot record a canvas")
    }

    const mimeType =
      options.mimeType ??
      [
        // Safari and recent Chrome can write MP4 directly; prefer it, since it is
        // the file people can actually drop into an editor or post.
        "video/mp4;codecs=avc1.640033",
        "video/mp4",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ].find((type) =>
        MediaRecorder.isTypeSupported(type),
      )

    const wasRunning = this.running
    if (!wasRunning) this.start()

    /*
     * Record at the requested size, not at the size the canvas happens to be
     * on screen.
     *
     * `captureStream` takes the *drawing buffer*, so a 900px preview recorded a
     * 900px video however large the export was supposed to be. Resizing the
     * buffer without touching the CSS size gives a 4K frame that still displays
     * at preview scale, and the adaptive pixel ratio has to be held off or it
     * spends the recording walking the resolution back down to hit 60fps.
     */
    const previous = this.renderer.getSize(new Vector2())
    const previousDpr = this.dpr
    this.recording = true
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.frameCamera()

    const stream = this.canvas.captureStream(fps)
    const chunks: BlobPart[] = []
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: bitrate,
    })
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }

    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }))
    })

    this.scripted = { startedAt: performance.now(), durationMs: seconds * 1000 }
    recorder.start()

    await new Promise((resolve) => setTimeout(resolve, seconds * 1000))

    recorder.stop()
    this.scripted = null
    const blob = await finished

    // Back to what it was, whatever happened.
    this.recording = false
    this.renderer.setPixelRatio(previousDpr)
    this.renderer.setSize(previous.x, previous.y, false)
    this.camera.aspect = previous.x / previous.y || 1
    this.frameCamera()
    if (!wasRunning) this.stop()

    return blob
  }

  /**
   * Render a loop frame by frame, at exact times, handing each to `onFrame`.
   *
   * The real-time recorder above captures whatever the screen manages to draw,
   * which is why a 4K take on a laptop came out with dropped frames — and why it
   * can only produce WebM, because that is what MediaRecorder writes in most
   * browsers. This one runs the simulation with a fixed step, renders every
   * frame whether or not the machine could have kept up live, and lets the
   * caller encode each one however it likes — to MP4 through WebCodecs, for
   * the Studio.
   *
   * `onFrame` is called in the same task as the render, so the drawing buffer
   * is still intact: capture from the canvas before awaiting anything. The
   * promise it returns is awaited before the next frame, which is how an encoder
   * applies backpressure.
   */
  async renderFrames(
    options: {
      seconds?: number
      fps?: number
      width?: number
      height?: number
      /**
       * Renders per output frame, each a fraction of a frame apart, all handed
       * to `onFrame` with their index — average them for motion blur.
       * @default 1
       */
      subframes?: number
      /** Called before every step, with the frame, the subframe and the time in seconds — to drive the look from a timeline or a soundtrack. */
      beforeStep?: (frame: number, subframe: number, seconds: number) => void
      /** Move the pointer around a closed figure-of-eight, so the surface is disturbed. @default true */
      scriptedPointer?: boolean
      /** Run the tail of the loop first, so the first frame matches the last. Off for timelines that do not loop. @default true */
      preroll?: boolean
    },
    onFrame: (canvas: HTMLCanvasElement, index: number, timestampUs: number, subframe: number) => void | Promise<void>,
  ): Promise<number> {
    const { seconds = 4, fps = 30, width = 3840, height = 2160, beforeStep } = options
    const subframes = Math.max(1, Math.min(16, Math.round(options.subframes ?? 1)))
    const scriptedPointer = options.scriptedPointer ?? true
    if (!this.mesh || !this.handle) throw new Error("liquidforge: nothing to render yet")

    const wasRunning = this.running
    this.stop()

    const previous = this.renderer.getSize(new Vector2())
    const previousDpr = this.dpr
    const previousTime = this.time
    this.recording = true
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.frameCamera()

    const frames = Math.max(1, Math.round(seconds * fps))
    const stepMs = 1000 / fps / subframes
    this.scripted = scriptedPointer ? { startedAt: 0, durationMs: seconds * 1000, progress: 0 } : null
    this.trail.clear()

    try {
      // Pre-roll the tail of the loop without capturing it, so the first frame
      // already has the ripples and the eased pointer the last frame leaves
      // behind. Starting from a still surface is what made the old loop visibly
      // jump at the seam.
      const preroll = options.preroll === false ? 0 : Math.min(frames, Math.round(fps * 1.5))
      for (let i = frames - preroll; i < frames; i++) {
        for (let sub = 0; sub < subframes; sub++) {
          if (this.scripted) this.scripted.progress = (i + sub / subframes) / frames
          beforeStep?.(i, sub, (i + sub / subframes) / fps)
          this.step(stepMs)
        }
      }
      for (let i = 0; i < frames; i++) {
        for (let sub = 0; sub < subframes; sub++) {
          if (this.scripted) this.scripted.progress = (i + sub / subframes) / frames
          beforeStep?.(i, sub, (i + sub / subframes) / fps)
          this.step(stepMs)
          await onFrame(this.canvas, i, Math.round((i * 1_000_000) / fps), sub)
        }
      }
    } finally {
      this.scripted = null
      this.recording = false
      this.time = previousTime
      this.renderer.setPixelRatio(previousDpr)
      this.renderer.setSize(previous.x, previous.y, false)
      this.camera.aspect = previous.x / previous.y || 1
      this.frameCamera()
      this.renderOnce()
      if (wasRunning) this.start()
    }
    return frames
  }

  /** A closed figure-of-eight, so the first frame and the last are the same. */
  private scripted: { startedAt: number; durationMs: number; progress?: number } | null = null
  private recording = false

  private scriptedPointer(): Vector2 | null {
    if (!this.scripted) return null
    const t =
      this.scripted.progress ?? ((performance.now() - this.scripted.startedAt) / this.scripted.durationMs) % 1
    const angle = t * Math.PI * 2
    return this.scratchPointer.set(Math.sin(angle) * 0.55, Math.sin(angle * 2) * 0.34)
  }

  private readonly scratchPointer = new Vector2()

  /**
   * Drive the pointer from code instead of the mouse: a tracked hand, a stream
   * alert, a remote cursor. `x` and `y` are normalised device coordinates
   * (-1 to 1 across the canvas). Pass null to hand the pointer back.
   */
  setPointerOverride(point: { x: number; y: number } | null): void {
    if (!point) {
      this.pointerOverride = null
      return
    }
    this.pointerOverride = (this.pointerOverride ?? new Vector2()).set(point.x, point.y)
    this.pointerSeen = true
  }

  /**
   * How firmly the pointer presses, from code: a tracked hand's palm, a pinch.
   *
   * 1 is the ordinary dent under a cursor, and anything between 0 and 1 a
   * lighter touch. Negative pulls the surface out toward the pointer instead —
   * down to -1.6, a strand drawn out of the liquid. Null goes back to the
   * pointer's own behaviour, where being over the object is a full press.
   */
  setPressOverride(value: number | null): void {
    this.pressOverride = value === null ? null : Math.max(-1.6, Math.min(1, value))
  }

  /**
   * Wrap a picture around the object as its surroundings — the page it sits on,
   * a photograph, a video frame. The canvas is read as an equirectangular
   * panorama, straight ahead in the middle. Call again with the same canvas
   * after drawing into it to refresh; pass null to go back to the studio.
   */
  setEnvironment(source: HTMLCanvasElement | null, mix = 0.85): void {
    if (!source) {
      this.environment?.texture.dispose()
      this.environment = null
    } else if (this.environment && this.environment.texture.image === source) {
      this.environment.texture.needsUpdate = true
      this.environment.mix = mix
    } else {
      this.environment?.texture.dispose()
      const texture = new CanvasTexture(source)
      texture.colorSpace = NoColorSpace
      texture.generateMipmaps = true
      texture.minFilter = LinearMipmapLinearFilter
      texture.magFilter = LinearFilter
      texture.needsUpdate = true
      this.environment = { texture, mix }
    }
    for (const form of this.forms.values()) for (const handle of form.handles.values()) this.bindEnvironment(handle)
    if (!this.running) this.renderOnce()
  }

  private bindEnvironment(handle: LiquidMaterialHandle): void {
    const u = handle.material.uniforms
    u.uEnvMap.value = this.environment?.texture ?? null
    u.uEnvMix.value = this.environment ? this.environment.mix : 0
  }

  /**
   * Let the surface slosh toward a direction, as a tilted phone would pour it.
   * `x`, `y`, `z` are in view space — +x right, +y up, +z toward the viewer —
   * and their length is how hard it pulls. `amount` scales the whole effect;
   * zero turns it off.
   */
  setGravity(x: number, y: number, z: number, amount = 0.12): void {
    this.gravityTarget.set(x, y, z)
    this.sloshAmount = Math.max(0, amount)
    for (const form of this.forms.values()) for (const handle of form.handles.values()) handle.material.uniforms.uSlosh.value = this.sloshAmount
  }

  /**
   * A burst: rings thrown up across the whole surface at once, and the surface
   * simmering for a second as it settles.
   *
   * For the moment a number a hero is bound to passes a milestone — the
   * thousandth sign-up, the hundred-thousandth star. The rings land on random
   * points of the actual mesh, so a word erupts along its letters rather than
   * across a sphere drawn around it.
   */
  splash(strength = 1): void {
    const mesh = this.mesh
    if (!mesh || this.reduced) return
    const position = mesh.geometry.getAttribute("position")
    const normal = mesh.geometry.getAttribute("flowNormal") ?? mesh.geometry.getAttribute("normal")
    const rings = Math.min(this.trail.length, Math.max(3, Math.round(5 * strength)))
    for (let i = 0; i < rings; i++) {
      const index = Math.floor(Math.random() * position.count)
      this.splashPoint.fromBufferAttribute(position, index)
      this.splashNormal.fromBufferAttribute(normal, index).normalize()
      // Staggered by a fraction of a second, so it reads as an eruption rather
      // than as every ring starting on the same frame.
      this.trail.emit(this.splashPoint, this.splashNormal, 2.2 * strength, this.time - i * 0.07)
    }
    this.clickPulse = Math.max(this.clickPulse, strength)
    this.splashEnergy = Math.min(1.5, this.splashEnergy + strength)
    if (!this.running) this.renderOnce()
  }

  /**
   * Where ferrofluid's spikes are drawn toward, and how hard.
   *
   * A magnet held under a dish of ferrofluid is felt before it arrives: the
   * spikes turn toward it as it approaches and follow it around, a beat behind.
   * So this reaches a little past the object's silhouette, fading with distance,
   * and eases after the cursor instead of jumping to it — around the object's
   * centre rather than through it, so crossing from one side to the other sweeps
   * the spikes over the surface instead of collapsing them in the middle.
   */
  private readonly magnet = new Vector3(0, 0, 1)
  private magnetPull = 0
  private readonly magnetFrom = new Vector3()
  private readonly magnetTo = new Vector3()

  private updateMagnet(hit: SurfaceHit, dt: number, mesh: Mesh): void {
    const reach = 1.1
    const closeness = this.pointerSeen ? 1 - Math.min(1, Math.max(0, hit.gap / reach)) : 0
    const target = closeness * closeness * (3 - 2 * closeness)
    if (this.reduced) {
      this.magnet.copy(hit.point)
      this.magnetPull = target
      return
    }
    this.magnetPull += (target - this.magnetPull) * (1 - Math.exp(-dt * 2.6))

    const centre = mesh.geometry.boundingSphere?.center
    const from = this.magnetFrom.copy(this.magnet)
    const to = this.magnetTo.copy(hit.point)
    if (centre) {
      from.sub(centre)
      to.sub(centre)
    }
    const fromLength = from.length() || 1
    const toLength = to.length() || 1
    from.divideScalar(fromLength)
    to.divideScalar(toLength)
    const k = 1 - Math.exp(-dt * 3.2)
    from.lerp(to, k)
    // Exactly opposite, the two directions average to nothing; step sideways.
    if (from.lengthSq() < 1e-6) from.set(to.z, to.x, to.y)
    from.normalize().multiplyScalar(fromLength + (toLength - fromLength) * k)
    if (centre) from.add(centre)
    this.magnet.copy(from)
  }

  private readonly splashPoint = new Vector3()
  private readonly splashNormal = new Vector3()

  /**
   * Disturb the surface from somewhere other than this browser's pointer.
   *
   * `x` and `y` are normalised device coordinates, the same space the local
   * pointer uses, so a position sent by someone on a different screen lands on
   * the same part of the object rather than the same pixel.
   *
   * This is what makes a shared surface shared: without it the other cursors
   * are drawings on top of the canvas, and the liquid only ever answers to one
   * person.
   */
  rippleAt(x: number, y: number, amplitude = 1): void {
    const mesh = this.mesh
    if (!mesh || !this.running) return
    const hit = this.remoteProbe.probe(
      this.remotePointer.set(x, y),
      this.camera,
      mesh,
      this.probeMode,
      this.probeSurface,
    )
    if (!hit.over) return
    this.trail.emit(hit.point, hit.normal, Math.min(2.4, Math.max(0, amplitude)), this.time)
  }

  private readonly remotePointer = new Vector2()

  /** Animation clips in the current object, empty for anything static. */
  get animations(): string[] {
    return this.rig?.names ?? []
  }

  /** `true` plays the first clip, a string picks one by name, `false` stops. */
  playAnimation(which: boolean | string = true): void {
    this.rig?.play(which)
    this.renderOnce()
  }

  private disposeMesh(): void {
    for (const form of [...this.forms.values()]) this.disposeForm(form)
    this.transition = null
    this.crossfade.release()
    this.active = null
    this.mesh = null
    this.handle = null
    this.rig = null
    this.appearance = null
  }

  dispose(): void {
    this.disposed = true
    this.stop()
    for (const off of this.detach) off()
    this.detach = []
    this.disposeMesh()
    this.crossfade.dispose()
    // Frees the WebGL context outright; browsers cap concurrent contexts at
    // around 16 and silently blank the oldest, which is what a gallery of live
    // previews would otherwise walk into.
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }
}
