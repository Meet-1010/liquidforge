/**
 * Turn a tuned look into a paste-ready component.
 *
 * The Studio's "copy the code" button and the MCP server's
 * `liquidforge_generate_component` share this one implementation, so the code an
 * agent hands you is byte-identical to the code the site hands you.
 */

import { PRESETS, DEFAULT_PRESET_ID } from "../presets"
import { BACKGROUND_TONES } from "../background"
import { renderShowcase, SHOWCASE_LAYOUTS, type ShowcaseLayout } from "./showcase"
import type {
  LiquidPreset,
  MaterialFamily,
  MotionOptions,
  ObjectSource,
  Quality,
  ShadingOptions,
  SurfaceOptions,
} from "../types"

/** Everything needed to reproduce a look. The Studio's editor state, serialised. */
export interface LiquidConfig {
  object: ObjectSource
  /** The colourway this started from. Emitted as `preset="…"`. */
  preset: string
  family: MaterialFamily
  palette: string[]
  surface: SurfaceOptions
  shading: ShadingOptions
  /** Which of the four grounds the colourway sits on. */
  background: LiquidPreset["background"]
  /** An explicit ground colour, overriding the tone. Empty means "use the tone". */
  backgroundColor?: string
  quality: Quality
  motion: MotionOptions
  layout: "overlay" | "split"
  blend: boolean
  transparent: boolean
  height: string
}

export const DEFAULT_OBJECT_SOURCE: ObjectSource = {
  type: "text",
  value: "LIQUID",
  depth: 0.45,
  bevel: 0.03,
}

const MOTION_DEFAULTS: MotionOptions = {
  autoRotate: 0,
  tilt: [0, 0],
  draggable: true,
  respectReducedMotion: true,
}

/**
 * A config whose look *is* the given colourway.
 *
 * Seeding from a fixed default instead would carry one preset's numbers into
 * every other, and `generateCode` would then dutifully emit them as overrides —
 * producing a component that names one colourway and renders another.
 */
export function configFromPreset(
  presetId: string = DEFAULT_PRESET_ID,
  object: ObjectSource = DEFAULT_OBJECT_SOURCE,
): LiquidConfig {
  const preset = PRESETS[presetId] ?? PRESETS[DEFAULT_PRESET_ID]
  return {
    object,
    preset: preset.id,
    family: preset.family,
    palette: [...preset.palette],
    surface: { ...preset.surface },
    shading: { ...preset.shading },
    background: preset.background,
    backgroundColor: undefined,
    quality: "auto",
    motion: { ...MOTION_DEFAULTS },
    layout: "overlay",
    blend: false,
    transparent: false,
    height: "100vh",
  }
}

/** A source backed by an object URL can't be shared or serialised. */
export function isEphemeral(object: ObjectSource): boolean {
  const src = (object as { src?: string }).src
  return typeof src === "string" && src.startsWith("blob:")
}

function literal(value: unknown, indent: number): string {
  const pad = "  ".repeat(indent)
  const padInner = "  ".repeat(indent + 1)

  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "number") return String(Math.round(value * 10000) / 10000)
  if (typeof value === "boolean") return String(value)
  if (value === null || value === undefined) return "undefined"

  if (Array.isArray(value)) {
    const inline = `[${value.map((v) => literal(v, indent)).join(", ")}]`
    if (inline.length <= 68) return inline
    return `[\n${value.map((v) => `${padInner}${literal(v, indent + 1)},`).join("\n")}\n${pad}]`
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined,
  )
  if (entries.length === 0) return "{}"

  const inline = `{ ${entries.map(([k, v]) => `${k}: ${literal(v, indent)}`).join(", ")} }`
  if (inline.length <= 68) return inline

  return `{\n${entries
    .map(([k, v]) => `${padInner}${k}: ${literal(v, indent + 1)},`)
    .join("\n")}\n${pad}}`
}

/** Keys whose value differs from the named colourway. */
function diff<T extends object>(current: T, base: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(current)) {
    if (value === undefined) continue
    const baseline = (base as Record<string, unknown>)[key]
    if (JSON.stringify(baseline) !== JSON.stringify(value)) out[key] = value
  }
  return out as Partial<T>
}

export interface CodeOptions {
  /**
   * How the surface sits on the page: as a hero, a card, a banner, a badge,
   * a fixed backdrop, or bare. See `SHOWCASE_LAYOUTS`.
   *
   * `component` is the older name for the same thing and still works.
   * @default "hero"
   */
  showcase?: ShowcaseLayout
  /** @deprecated Use `showcase`. */
  component?: "hero" | "canvas"
  /** Package import vs. an ejected local path. */
  importFrom?: string
  /**
   * Paint the colourway's ground, or composite over whatever the host page
   * already has.
   *
   * On, the snippet is a finished section you can drop into an empty route.
   * Off, it is a surface to put inside a layout you have already designed —
   * which is what you want far more often than the default suggests, and is
   * why it is a switch rather than something to work out from `transparent`.
   * @default true
   */
  background?: boolean
}

/**
 * Produce a paste-ready component.
 *
 * Only what actually differs from the named colourway is emitted. A preset is
 * around twenty numbers and restating all of them would bury the two the
 * reader changed.
 */
export function generateCode(config: LiquidConfig, options: CodeOptions = {}): string {
  const {
    component,
    showcase,
    importFrom = "liquidforge",
    background: includeBackground = true,
  } = options
  const base = PRESETS[config.preset] ?? PRESETS[DEFAULT_PRESET_ID]
  const layout: ShowcaseLayout = showcase ?? (component === "canvas" ? "canvas" : "hero")

  /*
   * Two props the layout has an opinion about, resolved here rather than
   * hardcoded into the templates. A template that writes `transparent` itself
   * emits it twice the moment the config asks for it too, and React quietly
   * takes the last one — which is the sort of thing that makes generated code
   * look careless even when it works.
   */
  const forceTransparent = layout === "badge"
  const smallByDefault = layout === "badge" || layout === "grid"
  const name = component === "hero" ? "LiquidHero" : "LiquidCanvas"

  const props: string[] = [
    `object={${literal(config.object, 3)}}`,
    `preset="${config.preset}"`,
  ]

  if (config.family !== base.family) props.push(`family="${config.family}"`)
  if (JSON.stringify(config.palette) !== JSON.stringify(base.palette)) {
    props.push(`palette={${literal(config.palette, 3)}}`)
  }

  const surfaceDiff = diff(config.surface, base.surface)
  if (Object.keys(surfaceDiff).length > 0) props.push(`surface={${literal(surfaceDiff, 3)}}`)

  const shadingDiff = diff(config.shading, base.shading)
  if (Object.keys(shadingDiff).length > 0) props.push(`shading={${literal(shadingDiff, 3)}}`)

  // A 56px badge and a card in a grid of three do not need the adaptive tier.
  const quality = config.quality === "auto" && smallByDefault ? "low" : config.quality
  if (quality !== "auto") props.push(`quality="${quality}"`)

  /*
   * The ground, in one of three ways.
   *
   * There is no prop for the *tone* — `background` on the component takes a
   * colour — so a colourway moved onto a different ground has to export the
   * resolved hex, or the snippet would silently render on the tone the preset
   * ships with.
   */
  if (!includeBackground || config.transparent || forceTransparent) {
    props.push("transparent")
  } else if (config.backgroundColor) {
    props.push(`background="${config.backgroundColor}"`)
  } else if (config.background !== base.background) {
    const tone = BACKGROUND_TONES[config.background]
    if (tone) props.push(`background="${tone}"`)
    else props.push("transparent")
  }

  const motionDiff = diff(config.motion, MOTION_DEFAULTS)
  if (Object.keys(motionDiff).length > 0) props.push(`motion={${literal(motionDiff, 3)}}`)

  if (component === "hero") {
    if (config.layout !== "overlay") props.push(`layout="${config.layout}"`)
    if (config.blend) props.push("blend")
    if (config.height !== "100vh") props.push(`height="${config.height}"`)
  }

  /*
   * The props, re-indented for wherever the layout puts them. A card nests the
   * canvas four levels deep and a hero two, and a snippet whose indentation is
   * wrong is the first thing a reader distrusts about generated code.
   */
  const propsAt = (indent: number) => props.map((prop) => `${" ".repeat(indent)}${prop}`).join("\n")

  const onLight = config.background === "light" && includeBackground && !config.transparent
  const meta = SHOWCASE_LAYOUTS.find((entry) => entry.id === layout)

  // A badge or a backdrop is meant to sit over the page, so those layouts drop
  // the ground whatever the config says — otherwise the emitted code contains a
  // prop that visibly contradicts the layout it is wrapped in.
  const effectiveInk = onLight ? "#111" : "#fff"

  return renderShowcase(layout, {
    props: propsAt,
    importFrom,
    ink: effectiveInk,
    blend: config.blend && (layout === "hero" || layout === "banner" || layout === "backdrop"),
  }) + (meta?.caveat ? `\n// Note: ${meta.caveat.replace(/\n/g, "\n// ")}\n` : "")
}

// -- Share links -------------------------------------------------------------

function toBase64Url(input: string): string {
  const base64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(input)))
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).Buffer.from(input, "utf8").toString("base64")
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/")
  return typeof atob === "function"
    ? decodeURIComponent(escape(atob(base64)))
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).Buffer.from(base64, "base64").toString("utf8")
}

export function encodeState(config: LiquidConfig): string {
  return toBase64Url(JSON.stringify(config))
}

export function decodeState(encoded: string): LiquidConfig | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded))
    if (!parsed || typeof parsed !== "object" || !parsed.object) return null
    // Merge over a fresh default so a link made by an older build still opens.
    return { ...configFromPreset(parsed.preset), ...parsed }
  } catch {
    return null
  }
}

/**
 * A Studio link that reopens this exact look.
 *
 * Returns `null` for an object backed by a blob URL, which cannot survive
 * leaving the browser that made it.
 */
export function shareUrl(config: LiquidConfig, base: string): string | null {
  if (isEphemeral(config.object)) return null
  return `${base.replace(/\/$/, "")}?c=${encodeState(config)}`
}

export {
  SHOWCASE_LAYOUTS,
  renderShowcase,
  type ShowcaseLayout,
  type ShowcaseMeta,
} from "./showcase"
