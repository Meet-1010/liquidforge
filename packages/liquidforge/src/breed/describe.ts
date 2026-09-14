import type { LiquidPreset, MaterialFamily } from "../types"
import { hexToOklab, oklabToHex } from "./index"

/**
 * What changed between two looks, in words.
 *
 * A remix of a remix of a cross is twenty numbers apart from its parent in a
 * dozen small ways, and a pair of thumbnails does not say which of them matter.
 * This measures each gene against the range it can take, keeps the few that
 * moved most, and phrases them the way someone would describe the difference
 * out loud: "Warmer and glossier, and the ripples travel half as fast."
 *
 * The reverse of this — words into numbers — is `steer`, below.
 */

export interface LookChange {
  /** Which gene, or `palette`/`family` for the whole-palette and family comparisons. */
  gene: string
  /** How far it moved, as a fraction of that gene's range. For ranking only. */
  size: number
  /** An adjective that can stand in a list ("warmer"), or a clause that cannot ("the ripples travel twice as fast"). */
  phrase: string
  kind: "adjective" | "clause"
}

const FAMILY_WORDS: Record<MaterialFamily, string> = {
  mercury: "chrome",
  aurora: "oil slick",
  prism: "glass",
  magma: "molten",
  pearl: "pearl",
  obsidian: "lacquer",
  velvet: "velvet",
  halo: "holographic foil",
  jade: "jade",
  plasma: "plasma",
  original: "its own surface",
  ferrofluid: "ferrofluid",
}

function paletteStats(palette: string[]) {
  let L = 0
  let chroma = 0
  let warmth = 0
  for (const hex of palette) {
    const [l, a, b] = hexToOklab(hex)
    L += l
    chroma += Math.hypot(a, b)
    // Warm is yellow-orange-red in OKLab: +b, and +a to a lesser degree.
    warmth += b * 0.75 + a * 0.35
  }
  const n = Math.max(1, palette.length)
  return { L: L / n, chroma: chroma / n, warmth: warmth / n }
}

function ratioPhrase(ratio: number, noun: string, faster: string, slower: string): string | null {
  if (ratio >= 2.6) return `${noun} ${Math.round(ratio)} times as ${faster}`
  if (ratio >= 1.8) return `${noun} twice as ${faster}`
  if (ratio >= 1.3) return `${noun} ${faster}er`.replace(/eer$/, "er")
  if (ratio <= 0.38) return `${noun} a third as ${faster}`
  if (ratio <= 0.58) return `${noun} half as ${faster}`
  if (ratio <= 0.77) return `${noun} ${slower}er`.replace(/eer$/, "er")
  return null
}

/** Every noticeable change from `from` to `to`, largest first. */
export function lookChanges(from: LiquidPreset, to: LiquidPreset): LookChange[] {
  const changes: LookChange[] = []
  const push = (gene: string, size: number, phrase: string, kind: LookChange["kind"] = "adjective") =>
    changes.push({ gene, size, phrase, kind })

  if (from.family !== to.family) {
    push("family", 10, `${FAMILY_WORDS[to.family]} rather than ${FAMILY_WORDS[from.family]}`, "adjective")
  }

  const a = paletteStats(from.palette)
  const b = paletteStats(to.palette)
  const dWarm = b.warmth - a.warmth
  const dL = b.L - a.L
  const dC = b.chroma - a.chroma
  if (Math.abs(dWarm) > 0.025) push("warmth", Math.abs(dWarm) / 0.12, dWarm > 0 ? "warmer" : "cooler")
  if (Math.abs(dL) > 0.06) push("lightness", Math.abs(dL) / 0.4, dL > 0 ? "lighter" : "darker")
  if (Math.abs(dC) > 0.03) push("chroma", Math.abs(dC) / 0.15, dC > 0 ? "more saturated" : "more muted")

  const s0 = from.shading
  const s1 = to.shading
  const dRough = s1.roughness - s0.roughness
  if (Math.abs(dRough) > 0.08) push("roughness", Math.abs(dRough), dRough < 0 ? "glossier" : "more matte")
  const dMetal = s1.metalness - s0.metalness
  if (Math.abs(dMetal) > 0.2) push("metalness", Math.abs(dMetal), dMetal > 0 ? "more metallic" : "less metallic")
  const dFres = s1.fresnel - s0.fresnel
  if (Math.abs(dFres) > 0.25) push("fresnel", Math.abs(dFres) / 1.5, dFres > 0 ? "with a brighter rim" : "with a softer rim", "clause")
  const dGlow = (s1.emissive ?? 0) - (s0.emissive ?? 0)
  if (Math.abs(dGlow) > 0.4) push("emissive", Math.abs(dGlow) / 3, dGlow > 0 ? "glowing harder" : "glowing less", "clause")
  const dClear = (s1.transmission ?? 0) - (s0.transmission ?? 0)
  if (Math.abs(dClear) > 0.15) push("transmission", Math.abs(dClear), dClear > 0 ? "clearer" : "more solid")
  const dFilm = (s1.thinFilm ?? 0) - (s0.thinFilm ?? 0)
  if (Math.abs(dFilm) > 0.2) push("thinFilm", Math.abs(dFilm), dFilm > 0 ? "more iridescent" : "less iridescent")

  const f0 = from.surface
  const f1 = to.surface
  const ratio = (x: number, y: number) => (x > 1e-6 ? y / x : y > 1e-6 ? 99 : 1)
  const speed = ratioPhrase(ratio(f0.rippleSpeed, f1.rippleSpeed), "the ripples travel", "fast", "slow")
  if (speed) push("rippleSpeed", Math.abs(Math.log(ratio(f0.rippleSpeed, f1.rippleSpeed))), speed, "clause")
  const amp = ratio(f0.rippleAmp, f1.rippleAmp)
  if (amp >= 1.4 || amp <= 0.7) push("rippleAmp", Math.abs(Math.log(amp)) * 0.8, amp > 1 ? "the ripples stand taller" : "the ripples are gentler", "clause")
  const drift = ratio(f0.noise, f1.noise)
  if (drift >= 1.5 || drift <= 0.66) push("noise", Math.abs(Math.log(drift)) * 0.6, drift > 1 ? "more restless" : "calmer")
  const dent = ratio(f0.dimple, f1.dimple)
  if (dent >= 1.4 || dent <= 0.7) push("dimple", Math.abs(Math.log(dent)) * 0.6, dent > 1 ? "the cursor presses in deeper" : "the cursor barely dents it", "clause")
  const swirl = ratio(f0.advection, f1.advection)
  if (swirl >= 1.5 || swirl <= 0.66) push("advection", Math.abs(Math.log(swirl)) * 0.6, swirl > 1 ? "the colour swirls harder" : "the colour hardly swirls", "clause")
  const spikes = ratio(f0.spikes ?? 0, f1.spikes ?? 0)
  if ((to.family === "ferrofluid" || from.family === "ferrofluid") && (spikes >= 1.3 || spikes <= 0.77)) {
    push("spikes", Math.abs(Math.log(Math.max(0.01, Math.min(99, spikes)))), spikes > 1 ? "the spikes stand taller" : "the spikes are lower", "clause")
  }

  return changes.sort((x, y) => y.size - x.size)
}

/**
 * One sentence for the difference, naming at most `limit` changes.
 *
 * `subject` finishes a comparison when given — "than Copper Liquid" — which a
 * gallery card wants and a Studio panel does not.
 */
export function describeChange(from: LiquidPreset, to: LiquidPreset, options: { limit?: number; than?: string } = {}): string {
  const { limit = 3, than } = options
  const top = lookChanges(from, to).slice(0, limit)
  if (top.length === 0) return than ? `Almost exactly like ${than}.` : "Almost exactly the same."

  // Adjectives first, as a list; clauses after. Clauses about the same subject
  // share it — "the ripples stand taller and travel faster", not the ripples twice.
  const adjectives = top.filter((change) => change.kind === "adjective").map((change) => change.phrase)
  const clauses: string[] = []
  for (const change of top.filter((entry) => entry.kind === "clause")) {
    const subject = ["the ripples ", "the spikes ", "the cursor ", "the colour "].find((prefix) => change.phrase.startsWith(prefix))
    const earlier = subject ? clauses.findIndex((clause) => clause.startsWith(subject)) : -1
    if (subject && earlier >= 0) clauses[earlier] = `${clauses[earlier]} and ${change.phrase.slice(subject.length)}`
    else clauses.push(change.phrase)
  }

  const list = (items: string[]) =>
    items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`

  let sentence: string
  if (adjectives.length && clauses.length) {
    sentence = `${list(adjectives)}${than ? ` than ${than}` : ""}, and ${list(clauses)}`
  } else if (adjectives.length) {
    sentence = `${list(adjectives)}${than ? ` than ${than}` : ""}`
  } else {
    sentence = `${list(clauses)}${than ? `, compared with ${than}` : ""}`
  }
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`
}

// -- steering ---------------------------------------------------------------

export interface Steer {
  /** -1 calm to +1 loud: motion, swirl, glow and saturation together. */
  energy?: number
  /** -1 cool to +1 warm: the palette's hues turned toward blue or toward amber. */
  warmth?: number
}

/**
 * Move a look along the two directions people actually ask for.
 *
 * Nobody says "raise ripple amplitude by 0.03"; they say "louder" or "warmer".
 * Energy scales the genes that read as intensity — ripple height and speed, the
 * swirl, the drift, the glow, the spikes, and the palette's saturation — up or
 * down together. Warmth turns every palette colour's hue in OKLab toward amber
 * or toward blue, keeping its lightness, so a colourway stays itself and only
 * its temperature changes.
 */
export function steer(preset: LiquidPreset, { energy = 0, warmth = 0 }: Steer): LiquidPreset {
  const e = Math.max(-1, Math.min(1, energy))
  const w = Math.max(-1, Math.min(1, warmth))
  if (e === 0 && w === 0) return preset
  const scale = e >= 0 ? 1 + e * 1.1 : 1 + e * 0.7
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

  const palette = preset.palette.map((hex) => {
    const [L, a, b] = hexToOklab(hex)
    let chroma = Math.hypot(a, b)
    let hue = Math.atan2(b, a)
    chroma = clamp(chroma * (e >= 0 ? 1 + e * 0.45 : 1 + e * 0.6), 0, 0.37)
    // Amber sits near 70° in OKLab, blue near 255°. Turn toward whichever the
    // steer asks for, by up to 70°, taking the short way round.
    const target = w > 0 ? (70 * Math.PI) / 180 : (255 * Math.PI) / 180
    let delta = target - hue
    delta = Math.atan2(Math.sin(delta), Math.cos(delta))
    hue += delta * Math.abs(w) * 0.55
    // A near-grey colour has no hue worth turning, so warmth also leans it a
    // little toward the target — otherwise "warmer" does nothing to chrome.
    const lean = 0.03 * Math.abs(w)
    return oklabToHex([L, Math.cos(hue) * chroma + Math.cos(target) * lean, Math.sin(hue) * chroma + Math.sin(target) * lean])
  })

  return {
    ...preset,
    id: `${preset.id}~${e.toFixed(2)},${w.toFixed(2)}`,
    palette,
    paletteBlend: undefined,
    surface: {
      ...preset.surface,
      noise: clamp(preset.surface.noise * scale, 0, 0.16),
      rippleAmp: clamp(preset.surface.rippleAmp * scale, 0, 0.25),
      rippleSpeed: clamp(preset.surface.rippleSpeed * (e >= 0 ? 1 + e * 0.6 : 1 + e * 0.45), 0.05, 2.4),
      advection: clamp(preset.surface.advection * scale, 0, 1.5),
      ...(preset.surface.spikes !== undefined ? { spikes: clamp(preset.surface.spikes * (1 + e * 0.5), 0, 0.35) } : {}),
    },
    shading: {
      ...preset.shading,
      ...(preset.shading.emissive !== undefined ? { emissive: clamp(preset.shading.emissive * scale, 0, 3) } : {}),
    },
  }
}

/** Where a look sits on the two steering axes, each roughly -1 to +1 across the built-in colourways. */
export function steerScore(preset: LiquidPreset): { energy: number; warmth: number } {
  const stats = paletteStats(preset.palette)
  const s = preset.surface
  const motion =
    (s.rippleAmp / 0.07 - 1) * 0.3 +
    (s.rippleSpeed / 0.9 - 1) * 0.2 +
    (s.advection / 0.6 - 1) * 0.25 +
    (s.noise / 0.03 - 1) * 0.1 +
    ((preset.shading.emissive ?? 0) / 1.5) * 0.3 +
    ((s.spikes ?? 0) / 0.15) * 0.2
  const energy = Math.max(-1, Math.min(1, motion + (stats.chroma - 0.1) * 3))
  const warmth = Math.max(-1, Math.min(1, stats.warmth * 9))
  return { energy, warmth }
}
