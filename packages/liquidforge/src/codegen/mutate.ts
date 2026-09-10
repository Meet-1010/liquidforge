import { PRESETS, DEFAULT_PRESET_ID } from "../presets"
import type { LiquidPreset } from "../types"

/**
 * A step sideways, not a new preset.
 *
 * Picking a colourway at random replaces everything you had; this walks the one
 * you are looking at. That difference matters because a colourway is around
 * twenty numbers and nobody dials them in from scratch — people arrive
 * somewhere good by nudging something that was already close, and this is that
 * nudge automated.
 *
 * Hues rotate together rather than independently, so a palette stays a palette:
 * shifting five colours by five different amounts is how you get mud.
 */
export interface MutateOptions {
  /** 0 is no change, 1 is a different colourway entirely. @default 0.35 */
  amount?: number
  random?: () => number
}

export function mutatePreset(preset: LiquidPreset, options: MutateOptions = {}): LiquidPreset {
  const { amount = 0.35, random = Math.random } = options
  const jitter = (value: number, spread: number, min: number, max: number) =>
    clamp(value + (random() * 2 - 1) * spread * amount, min, max)

  const hueShift = (random() * 2 - 1) * 0.22 * amount
  const satShift = 1 + (random() * 2 - 1) * 0.3 * amount

  return {
    ...preset,
    palette: preset.palette.map((hex) => shiftHex(hex, hueShift, satShift)),
    surface: {
      ...preset.surface,
      noise: jitter(preset.surface.noise, 0.05, 0, 0.16),
      dimple: jitter(preset.surface.dimple, 0.09, 0.02, 0.4),
      rippleAmp: jitter(preset.surface.rippleAmp, 0.06, 0, 0.25),
      rippleSpeed: jitter(preset.surface.rippleSpeed, 0.5, 0.15, 2.4),
      rippleTightness: Math.round(jitter(preset.surface.rippleTightness, 26, 12, 118)),
      trailSpacing: jitter(preset.surface.trailSpacing, 0.09, 0.02, 0.38),
      advection: jitter(preset.surface.advection, 0.45, 0, 1.9),
    },
    shading: {
      ...preset.shading,
      metalness: jitter(preset.shading.metalness, 0.3, 0, 1),
      roughness: jitter(preset.shading.roughness, 0.22, 0, 1),
      fresnel: jitter(preset.shading.fresnel, 0.3, 0, 1.5),
      specPower: Math.round(jitter(preset.shading.specPower, 26, 3, 118)),
      ...(preset.shading.thinFilm !== undefined
        ? { thinFilm: jitter(preset.shading.thinFilm, 0.15, 0, 0.6) }
        : {}),
      ...(preset.shading.emissive !== undefined
        ? { emissive: jitter(preset.shading.emissive, 0.8, 0, 4) }
        : {}),
      ...(preset.shading.ior !== undefined
        ? { ior: jitter(preset.shading.ior, 0.35, 1.02, 2.4) }
        : {}),
    },
  }
}

/** A colourway nobody has seen, built on a family picked at random. */
export function randomPreset(random: () => number = Math.random): LiquidPreset {
  const ids = Object.keys(PRESETS)
  const base = PRESETS[ids[Math.floor(random() * ids.length)]] ?? PRESETS[DEFAULT_PRESET_ID]
  return mutatePreset(base, { amount: 0.85, random })
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Rotate a hex colour's hue and scale its saturation, keeping lightness. */
function shiftHex(hex: string, hueShift: number, satScale: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return hex
  const n = Number.parseInt(match[1], 16)
  const [h, s, l] = rgbToHsl(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
  const [r, g, b] = hslToRgb((h + hueShift + 1) % 1, clamp(s * satScale, 0, 1), l)
  const to = (v: number) =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${to(r)}${to(g)}${to(b)}`
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / d + 2) / 6
        : ((r - g) / d + 4) / 6
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)]
}
