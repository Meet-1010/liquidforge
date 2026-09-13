import type { LiquidPreset, ObjectSource, ShadingOptions, SurfaceOptions } from "../types"

/**
 * Two looks becoming one.
 *
 * Two uses, one idea. Across a scroll checkpoint a colourway is *interpolated*
 * into the next — every in-between frame is a genuine preset, somewhere on the
 * line between the two parents. In the gallery two posts are *bred*: each
 * gene is taken from one parent or the other, sometimes averaged, and then
 * nudged, so a litter of children is spread around both rather than strung
 * between them.
 *
 * None of this is possible with a picture of a material. It is possible here
 * because a colourway is a palette and twenty numbers, and numbers can be
 * averaged, crossed and mutated. Colours are mixed in OKLab, where a midpoint
 * looks like a midpoint; mixed in sRGB, blue and yellow meet in grey.
 *
 * Free of three.js on purpose, so the MCP server and the gallery can breed
 * without pulling in a renderer.
 */

type Vec3 = [number, number, number]

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function linearToSrgb(c: number): number {
  const v = Math.max(0, Math.min(1, c))
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

export function hexToOklab(hex: string): Vec3 {
  const clean = hex.replace("#", "")
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.padEnd(6, "0")
  const n = Number.parseInt(full.slice(0, 6), 16)
  const r = srgbToLinear(((n >> 16) & 255) / 255)
  const g = srgbToLinear(((n >> 8) & 255) / 255)
  const b = srgbToLinear((n & 255) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function oklabToHex([L, a, b]: Vec3): string {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3)
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return `#${[r, g, bl]
    .map((c) => Math.round(linearToSrgb(c) * 255).toString(16).padStart(2, "0"))
    .join("")}`
}

export function mixHex(a: string, b: string, t: number): string {
  const A = hexToOklab(a)
  const B = hexToOklab(b)
  return oklabToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t])
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Palettes of different lengths meet at the longer one, the shorter repeating. */
function mixPalettes(a: string[], b: string[], t: number): string[] {
  const length = Math.max(a.length, b.length)
  return Array.from({ length }, (_, i) => mixHex(a[i % a.length], b[i % b.length], t))
}

function mixNumbers<T extends object>(a: T, b: T, t: number): T {
  const out = { ...a } as Record<string, unknown>
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const av = (a as Record<string, unknown>)[key]
    const bv = (b as Record<string, unknown>)[key]
    if (typeof av === "number" && typeof bv === "number") out[key] = lerp(av, bv, t)
    else if (typeof bv === "number" && av === undefined) out[key] = lerp(0, bv, t)
    else if (typeof av === "number" && bv === undefined) out[key] = lerp(av, 0, t)
    else out[key] = t < 0.5 ? av : bv
  }
  return out as T
}

/**
 * The preset `t` of the way from `a` to `b`.
 *
 * Everything continuous is interpolated. The family is not — it is a branch in
 * the shader, not a number — so it switches at the halfway point, which is
 * where a scroll checkpoint also swaps the object, under the melt.
 */
export function blendPresets(a: LiquidPreset, b: LiquidPreset, t: number): LiquidPreset {
  const k = Math.max(0, Math.min(1, t))
  if (k <= 0) return a
  if (k >= 1) return b
  return {
    ...(k < 0.5 ? a : b),
    id: `${a.id}~${b.id}`,
    palette: mixPalettes(a.palette, b.palette, k),
    surface: mixNumbers<SurfaceOptions>(a.surface, b.surface, k),
    shading: mixNumbers<ShadingOptions>(a.shading, b.shading, k),
  }
}

/** A small deterministic generator, so a litter can be reproduced from its seed. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = state
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export interface Child {
  preset: LiquidPreset
  object: ObjectSource
  /** Which parent each part came from, for crediting and for the card. */
  lineage: { silhouette: "a" | "b"; family: "a" | "b" }
  seed: number
}

export interface BreedOptions {
  /** How far a child may wander from its parents, 0–1. @default 0.15 */
  mutation?: number
}

const RANGES: Record<string, [number, number]> = {
  noise: [0, 0.16],
  dimple: [0.02, 0.4],
  rippleAmp: [0, 0.25],
  rippleSpeed: [0.15, 2.4],
  rippleTightness: [12, 118],
  trailSpacing: [0.02, 0.38],
  advection: [0, 1.4],
  metalness: [0, 1],
  roughness: [0, 1],
  fresnel: [0, 1.5],
  specPower: [2, 160],
  transmission: [0, 1],
  ior: [1, 2.4],
  thinFilm: [0, 1],
  emissive: [0, 3],
}

/**
 * One child of two parents.
 *
 * Crossover gene by gene: each number comes from parent a, parent b, or — a
 * third of the time — somewhere between them, and then takes a small mutation
 * scaled to that gene's own range, so a roughness moves by hundredths and a
 * spec power by whole units. The palette is crossed colour by colour. The
 * silhouette and the family each come whole from one parent, independently,
 * which is what makes a child recognisable as both.
 */
export function breed(
  a: { preset: LiquidPreset; object: ObjectSource },
  b: { preset: LiquidPreset; object: ObjectSource },
  seed: number,
  options: BreedOptions = {},
): Child {
  const random = seeded(seed)
  const mutation = Math.max(0, Math.min(1, options.mutation ?? 0.15))

  const gene = (key: string, av: number | undefined, bv: number | undefined): number | undefined => {
    if (av === undefined && bv === undefined) return undefined
    const x = av ?? bv!
    const y = bv ?? av!
    const roll = random()
    let value = roll < 0.33 ? x : roll < 0.66 ? y : lerp(x, y, random())
    const [min, max] = RANGES[key] ?? [Math.min(x, y), Math.max(x, y) || 1]
    value += (random() * 2 - 1) * (max - min) * mutation * 0.5
    return Math.max(min, Math.min(max, value))
  }

  const cross = <T extends object>(ao: T, bo: T): T => {
    const out: Record<string, unknown> = {}
    for (const key of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
      const av = (ao as Record<string, unknown>)[key]
      const bv = (bo as Record<string, unknown>)[key]
      if (typeof av === "number" || typeof bv === "number") {
        const value = gene(key, av as number | undefined, bv as number | undefined)
        if (value !== undefined) out[key] = key === "rippleTightness" ? Math.round(value) : value
      } else {
        out[key] = random() < 0.5 ? av : bv
      }
    }
    return out as T
  }

  const length = Math.max(a.preset.palette.length, b.preset.palette.length)
  const hueDrift = (random() * 2 - 1) * mutation * 0.12
  const palette = Array.from({ length }, (_, i) => {
    const pa = a.preset.palette[i % a.preset.palette.length]
    const pb = b.preset.palette[i % b.preset.palette.length]
    const roll = random()
    const base = roll < 0.4 ? pa : roll < 0.8 ? pb : mixHex(pa, pb, 0.5)
    // A shared hue drift across the whole palette, so a mutated palette is
    // still a palette and not five colours wandering off in five directions.
    const [L, A, B] = hexToOklab(base)
    const angle = Math.atan2(B, A) + hueDrift * Math.PI * 2
    const chroma = Math.hypot(A, B)
    return oklabToHex([L, Math.cos(angle) * chroma, Math.sin(angle) * chroma])
  })

  const familyFrom = random() < 0.5 ? "a" : "b"
  const silhouette = random() < 0.5 ? "a" : "b"
  const familyParent = familyFrom === "a" ? a.preset : b.preset

  return {
    preset: {
      ...familyParent,
      id: `bred-${seed.toString(36)}`,
      palette,
      surface: cross<SurfaceOptions>(a.preset.surface, b.preset.surface),
      shading: cross<ShadingOptions>(a.preset.shading, b.preset.shading),
    },
    object: silhouette === "a" ? a.object : b.object,
    lineage: { silhouette, family: familyFrom },
    seed,
  }
}

/** A litter: `count` children from consecutive seeds. */
export function litter(
  a: { preset: LiquidPreset; object: ObjectSource },
  b: { preset: LiquidPreset; object: ObjectSource },
  count = 6,
  seed = Date.now(),
  options: BreedOptions = {},
): Child[] {
  return Array.from({ length: count }, (_, i) => breed(a, b, (seed + i * 7919) >>> 0, options))
}
