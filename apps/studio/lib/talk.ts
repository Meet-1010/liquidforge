import { COLLECTIONS, PRESETS, steer, type LiquidPreset, type MaterialFamily, type ObjectSource } from "liquidforge"
import { hexToOklab, oklabToHex } from "liquidforge/breed"

/**
 * Words into a look, without a model.
 *
 * Asking a language model would cost money per sentence and send what someone
 * says to a third party. The vocabulary people actually use to describe a
 * material is small — a family, a colour, and a handful of directions like
 * warmer, slower, glossier — so a grammar covers it, runs instantly, costs
 * nothing, and can say exactly which words it understood.
 */

export interface TalkState {
  preset: LiquidPreset
  object: ObjectSource
}

export interface TalkResult {
  state: TalkState
  /** The phrases that did something, in order. */
  understood: string[]
}

const FAMILY_WORDS: Array<[RegExp, MaterialFamily]> = [
  [/\b(chrome|mercury|metal|metallic|mirror|silver)\b/, "mercury"],
  [/\b(oil|oil ?slick|rainbow|iridescent|aurora|petrol)\b/, "aurora"],
  [/\b(glass|crystal|prism|clear)\b/, "prism"],
  [/\b(lava|molten|magma|fire|hot)\b/, "magma"],
  [/\b(pearl|pearly|soft)\b/, "pearl"],
  [/\b(lacquer|piano|obsidian|expensive|luxury|luxurious)\b/, "obsidian"],
  [/\b(velvet|fabric|cloth|suede)\b/, "velvet"],
  [/\b(holo|holographic|foil|hologram)\b/, "halo"],
  [/\b(jade|stone|marble|ceramic)\b/, "jade"],
  [/\b(plasma|electric|neon|lightning)\b/, "plasma"],
  [/\b(ferro|ferrofluid|magnet|magnetic|spiky|spikes|spiny)\b/, "ferrofluid"],
  [/\b(original|own colou?rs|textured?|real colou?rs)\b/, "original"],
]

const COLOURS: Record<string, string> = {
  gold: "#e8b04a", golden: "#e8b04a", copper: "#d9773f", bronze: "#a8662e", rose: "#e79aa8", pink: "#ff5fa8",
  red: "#e5383b", crimson: "#b3122e", orange: "#ff7a1a", amber: "#ffb000", yellow: "#ffe14d", lime: "#9be22d",
  green: "#2fbf71", emerald: "#10a36b", mint: "#7ff0c6", teal: "#14b8a6", cyan: "#22d3ee", blue: "#2f6bff",
  navy: "#1b2a6b", indigo: "#5b4bff", purple: "#8b5cf6", violet: "#a855f7", lilac: "#c4a7ff", magenta: "#e03ce0",
  white: "#f4f4f6", black: "#0b0b0d", grey: "#8a8f99", gray: "#8a8f99", silver: "#c9ced6", ice: "#cfe8ff",
}

const SHAPES: Record<string, ObjectSource> = {
  sphere: { type: "shape", shape: "sphere", detail: 180 }, ball: { type: "shape", shape: "sphere", detail: 180 },
  knot: { type: "shape", shape: "torusknot", detail: 200 }, ring: { type: "shape", shape: "torus", detail: 200 },
  donut: { type: "shape", shape: "torus", detail: 200 }, torus: { type: "shape", shape: "torus", detail: 200 },
  capsule: { type: "shape", shape: "capsule", detail: 160 }, pill: { type: "shape", shape: "capsule", detail: 160 },
  gem: { type: "shape", shape: "icosahedron", detail: 160 }, crystal: { type: "shape", shape: "icosahedron", detail: 160 },
  cube: { type: "shape", shape: "rounded-box", detail: 140 }, box: { type: "shape", shape: "rounded-box", detail: 140 },
}

/** A four-colour ramp around one colour, the way the built-in palettes are built. */
function rampAround(hex: string): string[] {
  const [L, a, b] = hexToOklab(hex)
  const stop = (dl: number, chroma: number) => oklabToHex([Math.max(0.08, Math.min(0.97, L + dl)), a * chroma, b * chroma])
  return [stop(0.18, 0.55), stop(0, 1), stop(0.32, 0.25), stop(-0.34, 0.9)]
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function interpret(input: string, current: TalkState): TalkResult {
  const text = ` ${input.toLowerCase()} `
  const understood: string[] = []
  let preset = current.preset
  let object = current.object

  // Words to write come first and are taken verbatim, so "say GOLD" writes
  // GOLD rather than turning the surface gold.
  const quoted = /(?:\bsay|\bwrite|\bspell|\btext)\s+["“']?([\p{L}\p{N} !?&]{1,14})["”']?/iu.exec(input)
  if (quoted) {
    object = { type: "text", value: quoted[1].trim().toUpperCase(), depth: 0.45, bevel: 0.03 }
    understood.push(`writes "${quoted[1].trim().toUpperCase()}"`)
  }
  const rest = quoted ? text.replace(quoted[0].toLowerCase(), " ") : text

  for (const [pattern, shape] of Object.entries(SHAPES)) {
    if (new RegExp(`\\b(a |an |into a |into an )?${pattern}\\b`).test(rest) && /\b(make|turn|into|become|shape|as)\b/.test(rest)) {
      object = shape
      understood.push(`becomes a ${pattern}`)
      break
    }
  }

  for (const [pattern, family] of FAMILY_WORDS) {
    if (pattern.test(rest) && family !== preset.family) {
      const collection = COLLECTIONS.find((entry) => entry.family === family)
      const base = collection ? PRESETS[`${collection.name.toLowerCase()}-1`] : undefined
      if (base) {
        preset = { ...base, palette: family === "mercury" ? base.palette : base.palette }
        understood.push(`${collection!.name.toLowerCase()}`)
      }
      break
    }
  }

  const colour = Object.keys(COLOURS).find((word) => new RegExp(`\\b${word}\\b`).test(rest))
  if (colour && !(colour === "silver" && preset.family === "mercury" && understood.includes("mercury"))) {
    preset = { ...preset, palette: rampAround(COLOURS[colour]) }
    understood.push(colour)
  }

  const surface = { ...preset.surface }
  const shading = { ...preset.shading }
  const has = (pattern: RegExp) => pattern.test(rest)
  const much = has(/\b(much|way|a lot|really|very)\b/) ? 2 : has(/\b(a bit|slightly|little)\b/) ? 0.5 : 1

  if (has(/\b(slower|slow down|lazier|lazy)\b/)) { surface.rippleSpeed = clamp(surface.rippleSpeed / (1 + 0.6 * much), 0.1, 2.4); understood.push("slower") }
  if (has(/\b(faster|quicker|speed up)\b/)) { surface.rippleSpeed = clamp(surface.rippleSpeed * (1 + 0.6 * much), 0.1, 2.4); understood.push("faster") }
  if (has(/\b(glossier|shinier|shiny|glossy|polished|wet)\b/)) { shading.roughness = clamp(shading.roughness - 0.12 * much, 0, 1); understood.push("glossier") }
  if (has(/\b(matte|rougher|duller|satin|frosted)\b/)) { shading.roughness = clamp(shading.roughness + 0.18 * much, 0, 1); understood.push("more matte") }
  if (has(/\b(bigger ripples|taller|wavier|choppy|stormy)\b/)) { surface.rippleAmp = clamp(surface.rippleAmp * (1 + 0.7 * much), 0, 0.25); understood.push("bigger ripples") }
  if (has(/\b(still|stiller|gentle|gentler|smaller ripples)\b/)) { surface.rippleAmp = clamp(surface.rippleAmp * (1 - 0.4 * Math.min(much, 1.5)), 0, 0.25); understood.push("gentler") }
  if (has(/\b(swirl|swirly|twist|twistier)\b/)) { surface.advection = clamp(surface.advection * (1 + 0.8 * much) + 0.1, 0, 1.5); understood.push("swirlier") }
  if (has(/\b(deeper|press harder|dent)\b/)) { surface.dimple = clamp(surface.dimple * (1 + 0.6 * much), 0, 0.4); understood.push("deeper dent") }
  if (preset.family === "ferrofluid" && has(/\b(spikier|more spikes|sharper|pointier)\b/)) { surface.spikes = clamp((surface.spikes ?? 0.13) * (1 + 0.5 * much), 0, 0.35); understood.push("spikier") }
  if (has(/\b(glow|glowing|brighter glow)\b/)) { shading.emissive = clamp((shading.emissive ?? 0) + 0.8 * much, 0, 3); understood.push("glows") }
  preset = { ...preset, surface, shading }

  let energy = 0
  let warmth = 0
  if (has(/\b(louder|wilder|crazier|energetic|intense|more alive)\b/)) { energy += 0.6 * much; understood.push("louder") }
  if (has(/\b(calmer|calm|quieter|relaxed|chill|subtle)\b/)) { energy -= 0.6 * much; understood.push("calmer") }
  if (has(/\b(warmer|warm|sunnier|sunset)\b/) && !colour) { warmth += 0.6 * much; understood.push("warmer") }
  if (has(/\b(cooler|cold|colder|icy|cool)\b/) && !colour) { warmth -= 0.6 * much; understood.push("cooler") }
  if (energy || warmth) preset = steer(preset, { energy: clamp(energy, -1, 1), warmth: clamp(warmth, -1, 1) })

  if (has(/\b(dark background|on black|darker page|dark mode)\b/)) { preset = { ...preset, background: "dark" }; understood.push("dark page") }
  if (has(/\b(light background|on white|light page|light mode)\b/)) { preset = { ...preset, background: "light" }; understood.push("light page") }

  return { state: { preset, object }, understood }
}
