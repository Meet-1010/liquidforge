import type { BufferGeometry } from "three"
import { LiquidEngine } from "./liquid-engine"
import { forgeGeometry } from "../forge"
import type { LiquidPreset, ObjectSource } from "../types"

export interface CaptureRequest {
  object: ObjectSource
  preset: LiquidPreset
  /** CSS pixels. The device pixel ratio is applied on top. */
  width: number
  height: number
  target: HTMLCanvasElement
}

/**
 * One WebGL context, shared by every still on the page.
 *
 * A gallery of 90 colourways cannot have 90 live contexts: Chrome does not
 * refuse them past its limit, it hands one over and silently kills an older
 * one, so the page tears itself down as you scroll. But a card showing a flat
 * colour swatch is not a preview of anything.
 *
 * So the stills all come from a single off-screen engine, rendered one at a
 * time and copied into each card's own 2D canvas — and 2D contexts are not
 * rationed. Every card shows the real material on the real object; only the
 * card you are pointing at needs a live context of its own.
 *
 * Two things make this cheap enough to do for ninety cards. Geometry is cached by
 * source, so a gallery whose cards differ only by colourway tessellates once
 * rather than ninety times. And the engine is only re-pointed at new geometry when
 * the source actually changes, because that is the expensive half.
 */
export class PreviewRenderer {
  private container: HTMLDivElement | null = null
  private engine: LiquidEngine | null = null
  private readonly geometry = new Map<string, Promise<BufferGeometry>>()
  private currentObject: string | null = null
  private chain: Promise<unknown> = Promise.resolve()
  private disposed = false

  constructor(private readonly quality: "high" | "balanced" | "low" = "balanced") {}

  /**
   * Paint one still into `target`.
   *
   * Serialised: there is one engine, so overlapping calls would fight over its
   * geometry and its camera. Cards resolve in the order they asked.
   */
  capture(request: CaptureRequest): Promise<boolean> {
    const run = () => this.draw(request)
    this.chain = this.chain.then(run, run)
    return this.chain as Promise<boolean>
  }

  private async draw(request: CaptureRequest): Promise<boolean> {
    if (this.disposed || typeof document === "undefined") return false
    const { object, preset, width, height, target } = request
    if (width <= 0 || height <= 0) return false

    const engine = this.ensureEngine()
    if (!engine) return false

    const key = JSON.stringify(object)
    if (key !== this.currentObject) {
      let cached = this.geometry.get(key)
      if (!cached) {
        cached = forgeGeometry(object)
        // Don't cache a rejection — a transient network failure would
        // otherwise be permanent for the rest of the session.
        cached.catch(() => this.geometry.delete(key))
        this.geometry.set(key, cached)
      }
      const forged = await cached
      if (this.disposed) return false

      engine.setGeometry(forged, {
        forceSphereProbe:
          object.type === "shape" && (object.shape === "sphere" || object.shape === "icosahedron"),
      })
      this.currentObject = key
    }

    engine.setPreset(preset)

    const dpr = Math.min(2, typeof devicePixelRatio === "number" ? devicePixelRatio : 1)
    if (this.container) {
      this.container.style.width = `${width}px`
      this.container.style.height = `${height}px`
    }
    engine.resize(width, height)

    target.width = Math.round(width * dpr)
    target.height = Math.round(height * dpr)
    target.style.width = "100%"
    target.style.height = "100%"

    return engine.snapshotTo(target)
  }

  private ensureEngine(): LiquidEngine | null {
    if (this.engine) return this.engine
    if (typeof document === "undefined") return null

    const container = document.createElement("div")
    // Off-screen rather than `display: none`: a hidden element has no layout,
    // so the canvas would size to nothing.
    container.style.cssText =
      "position:fixed;left:-10000px;top:0;width:320px;height:200px;pointer-events:none;"
    container.setAttribute("aria-hidden", "true")
    document.body.appendChild(container)
    this.container = container

    this.engine = new LiquidEngine({
      container,
      // Replaced on the first capture; this is only what the material is built
      // from before one arrives.
      preset: { id: "seed", collection: "", family: "mercury", label: "", palette: ["#ffffff"],
        surface: { noise: 0.03, dimple: 0.115, rippleAmp: 0.072, rippleSpeed: 0.85,
          rippleTightness: 46, trailSpacing: 0.07, advection: 0.5 },
        shading: { metalness: 1, roughness: 0.08, fresnel: 0.35, specPower: 42 },
        background: "dark" },
      quality: this.quality,
      // A still has no loop, no cursor and no wheel.
      interactive: false,
      motion: { autoRotate: 0, tilt: [0.22, 0.35] },
    })

    return this.engine
  }

  dispose(): void {
    this.disposed = true
    this.engine?.dispose()
    this.engine = null
    this.container?.remove()
    this.container = null
    for (const pending of this.geometry.values()) {
      pending.then((geometry) => geometry.dispose()).catch(() => {})
    }
    this.geometry.clear()
    this.currentObject = null
  }
}

let shared: PreviewRenderer | null = null

/** The page-wide still renderer. One context, however many cards there are. */
export function sharedPreviewRenderer(): PreviewRenderer {
  if (!shared) shared = new PreviewRenderer()
  return shared
}
