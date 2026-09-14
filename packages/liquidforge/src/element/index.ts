import { LiquidEngine } from "../engine/liquid-engine"
import { forgeGeometry } from "../forge"
import { backgroundColor } from "../material/environment"
import { resolvePreset } from "../presets"
import { LiveValue } from "../engine/live-value"
import { pickNumber } from "../hooks/pick-number"
import type { MaterialFamily, ObjectSource, Quality, ShadingOptions, ShapeKind, SurfaceOptions } from "../types"

/**
 * `<liquid-forge>` — the surface without React.
 *
 * Webflow, Framer, Squarespace, WordPress and a plain HTML page all take a
 * custom element and a script tag, and none of them take a React component.
 * This is the same engine the component drives, wired to attributes instead of
 * props, so a no-code site gets the real material rather than a video of it.
 *
 * ```html
 * <script src="https://cdn.jsdelivr.net/npm/liquidforge/dist/element.global.js" defer></script>
 * <liquid-forge text="LIQUID" preset="mercury-1" style="height: 480px"></liquid-forge>
 * ```
 *
 * The object is one of `text`, `shape`, `model`, `svg` or `image`, or a full
 * `object` attribute holding the JSON a `LiquidCanvas` would take. Everything
 * else mirrors the component: `preset`, `family`, `palette` (comma-separated),
 * `surface` and `shading` (JSON, only the numbers you changed),
 * `transparent`, `background`, `quality`, `auto-rotate`, `draggable="false"`,
 * `poster`. Changing an attribute updates the surface in place.
 *
 * Bind it to a number with `value`, `value-min`, `value-max`, `value-to` and
 * `milestones` (comma-separated) — or let it fetch one: `value-src` is a JSON
 * URL, `value-path` the dot path to the number in it, `value-every` the poll
 * interval in milliseconds.
 *
 * Children are the fallback: they are left alone where WebGL is missing, and
 * hidden once the surface is drawing.
 */

const OBJECT_ATTRIBUTES = ["object", "text", "shape", "model", "svg", "image", "depth"] as const
const LOOK_ATTRIBUTES = ["preset", "family", "palette", "surface", "shading"] as const
const OBSERVED = [
  ...OBJECT_ATTRIBUTES,
  ...LOOK_ATTRIBUTES,
  "transparent",
  "background",
  "quality",
  "auto-rotate",
  "draggable",
  "poster",
  "value",
  "value-min",
  "value-max",
  "value-to",
  "milestones",
  "value-src",
  "value-path",
  "value-every",
] as const

const SHAPES: ShapeKind[] = ["sphere", "torus", "torusknot", "capsule", "icosahedron", "rounded-box"]

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"))
  } catch {
    return false
  }
}

/** Read the object from whichever attribute describes it. */
export function objectFromAttributes(read: (name: string) => string | null): ObjectSource | null {
  const depth = Number(read("depth"))
  const withDepth = Number.isFinite(depth) && depth > 0 ? { depth } : {}

  const json = read("object")
  if (json) {
    try {
      const parsed = JSON.parse(json) as ObjectSource
      if (parsed && typeof parsed === "object" && "type" in parsed) return parsed
    } catch {
      // Fall through to the shorthand attributes; a typo in JSON should not
      // leave an empty box when `text` is also there.
    }
  }
  const text = read("text")
  if (text !== null) return { type: "text", value: text || "LIQUID", ...withDepth }
  const shape = read("shape")
  if (shape !== null) {
    return { type: "shape", shape: SHAPES.includes(shape as ShapeKind) ? (shape as ShapeKind) : "sphere" }
  }
  const model = read("model")
  if (model) return { type: "model", src: model }
  const svg = read("svg")
  if (svg) return { type: "svg", src: svg, ...withDepth }
  const image = read("image")
  if (image) return { type: "image", src: image, ...withDepth }
  return null
}

type Base = new () => HTMLElement
// Node has no HTMLElement. Importing this entry during a server render must not
// throw; it simply defines nothing there.
const ElementBase: Base = typeof HTMLElement === "undefined" ? (class {} as unknown as Base) : HTMLElement

export class LiquidForgeElement extends ElementBase {
  static get observedAttributes(): readonly string[] {
    return OBSERVED
  }

  private engineInstance: LiquidEngine | null = null
  private surface: HTMLDivElement | null = null
  private posterImage: HTMLImageElement | null = null
  private resizeObserver: ResizeObserver | null = null
  private intersection: IntersectionObserver | null = null
  private motionQuery: MediaQueryList | null = null
  private inView = true
  private ready = false
  private forging = 0
  private pendingObject = false
  private pendingLook = false
  private scheduled = false
  private live: LiveValue | null = null
  private fetched: number | undefined
  private pollTimer: ReturnType<typeof setTimeout> | undefined
  private pollUrl = ""

  /** The engine, for anything the attributes do not cover — `recordLoop`, `posterBlob`. */
  get engine(): LiquidEngine | null {
    return this.engineInstance
  }

  connectedCallback(): void {
    if (this.engineInstance) return
    const style = this.style
    if (!style.display) style.display = "block"
    if (!style.position) style.position = "relative"
    if (!style.overflow) style.overflow = "hidden"
    // An element with no height set would be zero pixels tall, which reads as
    // "it does not work" rather than "give it a height".
    if (!style.height && !style.minHeight && this.getBoundingClientRect().height === 0) {
      style.minHeight = "320px"
    }

    if (!supportsWebGL()) {
      this.dispatchEvent(new CustomEvent("error", { detail: new Error("WebGL is not available") }))
      return
    }

    this.syncPoster()

    const surface = document.createElement("div")
    surface.style.cssText = "position:absolute;inset:0;"
    this.appendChild(surface)
    this.surface = surface

    this.motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null
    this.motionQuery?.addEventListener?.("change", this.onMotionPreference)

    try {
      this.engineInstance = new LiquidEngine({
        container: surface,
        preset: this.preset(),
        quality: this.quality(),
        motion: this.motion(),
        transparent: this.hasAttribute("transparent"),
        background: this.getAttribute("background") ?? undefined,
        reducedMotion: this.motionQuery?.matches ?? false,
      })
    } catch (error) {
      surface.remove()
      this.surface = null
      this.dispatchEvent(new CustomEvent("error", { detail: error }))
      return
    }
    this.syncGround()
    this.live = new LiveValue(this.engineInstance, () => this.preset())

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(this)
    this.intersection = new IntersectionObserver(
      (entries) => {
        this.inView = entries[entries.length - 1]?.isIntersecting ?? true
        this.syncRunning()
      },
      { rootMargin: "200px" },
    )
    this.intersection.observe(this)

    this.forge()
  }

  disconnectedCallback(): void {
    this.live?.dispose()
    this.live = null
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.pollTimer = undefined
    this.pollUrl = ""
    this.resizeObserver?.disconnect()
    this.intersection?.disconnect()
    this.motionQuery?.removeEventListener?.("change", this.onMotionPreference)
    this.engineInstance?.dispose()
    this.engineInstance = null
    this.surface?.remove()
    this.surface = null
    this.posterImage?.remove()
    this.posterImage = null
    this.ready = false
    this.forging++
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null): void {
    if (previous === next || !this.engineInstance) {
      if (name === "poster") this.syncPoster()
      return
    }
    if ((OBJECT_ATTRIBUTES as readonly string[]).includes(name)) this.pendingObject = true
    else if ((LOOK_ATTRIBUTES as readonly string[]).includes(name)) this.pendingLook = true
    else if (name === "transparent" || name === "background") this.syncGround()
    else if (name === "auto-rotate" || name === "draggable") this.engineInstance.setMotion(this.motion())
    else if (name === "poster") this.syncPoster()
    else if (name.startsWith("value") || name === "milestones") {
      if (name === "value-src" || name === "value-path" || name === "value-every") this.syncPolling()
      if (this.ready) this.syncData()
    } else if (name === "quality") {
      // The tier is baked into the material and the tessellation; rebuilding
      // is the only honest way to change it.
      this.disconnectedCallback()
      this.connectedCallback()
      return
    }

    // A page script setting three attributes in a row should cause one forge,
    // not three.
    if (!this.scheduled && (this.pendingObject || this.pendingLook)) {
      this.scheduled = true
      queueMicrotask(() => {
        this.scheduled = false
        if (this.pendingObject) {
          this.pendingObject = false
          this.pendingLook = false
          this.engineInstance?.setPreset(this.preset())
          this.forge()
        } else if (this.pendingLook) {
          this.pendingLook = false
          const preset = this.preset()
          // Switching into Original needs the object's own surface, which only
          // a fresh forge carries.
          this.engineInstance?.setPreset(preset)
          this.live?.refresh()
          if (preset.family === "original" || preset.family === "ferrofluid") this.forge()
          this.syncGround()
        }
      })
    }
  }

  /** The bound number, from `value` or the last fetch of `value-src`. */
  private syncData(): void {
    const own = this.getAttribute("value")
    const value = own !== null && own !== "" ? Number(own) : this.fetched
    if (value === undefined || !Number.isFinite(value)) {
      this.live?.set(null)
      return
    }
    const number = (name: string) => {
      const raw = this.getAttribute(name)
      return raw === null || raw === "" || !Number.isFinite(Number(raw)) ? undefined : Number(raw)
    }
    this.live?.set({
      value,
      min: number("value-min"),
      max: number("value-max"),
      to: this.getAttribute("value-to") || undefined,
      milestones: (this.getAttribute("milestones") ?? "")
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((m) => Number.isFinite(m)),
    })
  }

  private syncPolling(): void {
    const src = this.getAttribute("value-src") ?? ""
    if (src === this.pollUrl && this.pollTimer) return
    if (this.pollTimer) clearTimeout(this.pollTimer)
    this.pollTimer = undefined
    this.pollUrl = src
    if (!src || !this.engineInstance) return
    const every = Math.max(5_000, Number(this.getAttribute("value-every")) || 30_000)
    const poll = async () => {
      if (this.pollUrl !== src) return
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch(src, { headers: { accept: "application/json" } })
          if (response.ok) {
            const next = pickNumber(await response.json(), this.getAttribute("value-path") ?? undefined)
            if (next !== undefined && this.pollUrl === src) {
              this.fetched = next
              if (this.ready) this.syncData()
            }
          }
        } catch {
          // Keep the last value; the next poll may succeed.
        }
      }
      if (this.pollUrl === src) this.pollTimer = setTimeout(poll, every)
    }
    void poll()
  }

  private preset() {
    const palette = this.getAttribute("palette")
      ?.split(",")
      .map((colour) => colour.trim())
      .filter((colour) => /^#[0-9a-f]{3,8}$/i.test(colour))
    const json = <T>(name: string): Partial<T> | undefined => {
      const raw = this.getAttribute(name)
      if (!raw) return undefined
      try {
        const parsed = JSON.parse(raw) as unknown
        return parsed && typeof parsed === "object" ? (parsed as Partial<T>) : undefined
      } catch {
        return undefined
      }
    }
    const base = resolvePreset(this.getAttribute("preset") ?? undefined)
    const surface = json<SurfaceOptions>("surface")
    const shading = json<ShadingOptions>("shading")
    return resolvePreset(base, {
      family: (this.getAttribute("family") as MaterialFamily | null) ?? undefined,
      palette: palette && palette.length > 0 ? palette : undefined,
      surface: surface ? { ...base.surface, ...surface } : undefined,
      shading: shading ? { ...base.shading, ...shading } : undefined,
    })
  }

  private quality(): Quality {
    const value = this.getAttribute("quality")
    return value === "low" || value === "balanced" || value === "high" ? value : "auto"
  }

  private motion() {
    const spin = Number(this.getAttribute("auto-rotate"))
    return {
      autoRotate: Number.isFinite(spin) ? spin : 0,
      draggable: this.getAttribute("draggable") !== "false",
    }
  }

  private syncGround(): void {
    const transparent = this.hasAttribute("transparent")
    const background = this.getAttribute("background") ?? undefined
    this.engineInstance?.setTransparent(transparent, background)
    // The element paints the ground too, so the box is the right colour before
    // the first frame rather than flashing white on a light page.
    this.style.background = transparent ? "transparent" : (background ?? backgroundColor(this.preset()) ?? "#050506")
    // Vertical swipes scroll the page on a phone; sideways drags turn the object.
    this.style.touchAction = this.getAttribute("draggable") === "false" ? "" : "pan-y"
  }

  private syncPoster(): void {
    const src = this.getAttribute("poster")
    if (!src) {
      this.posterImage?.remove()
      this.posterImage = null
      return
    }
    if (!this.posterImage) {
      const image = document.createElement("img")
      image.alt = ""
      image.setAttribute("aria-hidden", "true")
      image.decoding = "async"
      image.setAttribute("fetchpriority", "high")
      image.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;transition:opacity 450ms ease;z-index:1;"
      this.appendChild(image)
      this.posterImage = image
    }
    this.posterImage.src = src
    this.posterImage.style.opacity = this.ready ? "0" : "1"
  }

  private resize(): void {
    const rect = this.getBoundingClientRect()
    this.engineInstance?.resize(rect.width, rect.height)
  }

  private syncRunning(): void {
    const engine = this.engineInstance
    if (!engine || !this.ready) return
    if (this.inView && !(this.motionQuery?.matches ?? false)) engine.start()
    else engine.stop()
  }

  private onMotionPreference = () => {
    this.engineInstance?.setReducedMotion(this.motionQuery?.matches ?? false)
    this.syncRunning()
  }

  private forge(): void {
    const engine = this.engineInstance
    if (!engine) return
    const object = objectFromAttributes((name) => this.getAttribute(name)) ?? { type: "shape", shape: "sphere" }
    const preset = this.preset()
    const appearance =
      preset.family === "original" && (object.type === "model" || object.type === "image" || object.type === "svg")

    const run = ++this.forging
    forgeGeometry(object, undefined, { appearance })
      .then((geometry) => {
        if (run !== this.forging || this.engineInstance !== engine) {
          geometry.dispose()
          return
        }
        engine.setGeometry(geometry, {
          forceSphereProbe: object.type === "shape" && (object.shape === "sphere" || object.shape === "icosahedron"),
          dense: preset.family === "ferrofluid",
        })
        geometry.dispose()
        this.resize()
        this.ready = true
        if (this.posterImage) this.posterImage.style.opacity = "0"
        // Fallback content steps aside once there is something to see.
        for (const child of Array.from(this.children)) {
          if (child !== this.surface && child !== this.posterImage && child instanceof HTMLElement) {
            child.style.visibility = "hidden"
          }
        }
        this.syncRunning()
        this.syncPolling()
        this.syncData()
        this.dispatchEvent(new CustomEvent("ready", { detail: { animations: engine.animations } }))
      })
      .catch((error) => {
        if (run !== this.forging) return
        this.dispatchEvent(new CustomEvent("error", { detail: error }))
      })
  }
}

/** Register `<liquid-forge>`. Safe to call more than once, and a no-op on a server. */
export function defineLiquidForge(tag = "liquid-forge"): void {
  if (typeof customElements === "undefined") return
  if (!customElements.get(tag)) customElements.define(tag, LiquidForgeElement as unknown as CustomElementConstructor)
}

defineLiquidForge()

declare global {
  interface HTMLElementTagNameMap {
    "liquid-forge": LiquidForgeElement
  }
}
