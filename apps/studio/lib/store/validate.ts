import { PRESETS } from "liquidforge/presets"
import type { ObjectSource } from "liquidforge/presets"
import type { Look } from "./types"
import { answersDaily } from "../daily"

/**
 * What a submission is allowed to be.
 *
 * Everything here arrives from a stranger's browser, so nothing is trusted:
 * lengths are capped, the preset has to be one that exists, and the object is
 * rebuilt field by field rather than passed through. That last part matters —
 * spreading a posted object into the component would let anyone put arbitrary
 * keys into a JSON blob the gallery renders.
 */

const MAX_TITLE = 60
const MAX_AUTHOR = 40
const MAX_URL = 200

export interface ValidationResult {
  ok: boolean
  error?: string
  value?: {
    title: string
    author: string
    url: string
    object: ObjectSource
    preset: string
    look?: Look
    parentId?: string
    secondParentId?: string
    daily?: string
  }
}

export function validateSubmission(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Expected an object" }
  const body = input as Record<string, unknown>

  const title = String(body.title ?? "").trim()
  if (title.length < 2) return { ok: false, error: "A title of at least two characters is required" }
  if (title.length > MAX_TITLE) return { ok: false, error: `Titles are capped at ${MAX_TITLE} characters` }

  const author = String(body.author ?? "").trim() || "Anonymous"
  if (author.length > MAX_AUTHOR) return { ok: false, error: `Names are capped at ${MAX_AUTHOR} characters` }

  const url = String(body.url ?? "").trim()
  if (url.length > MAX_URL) return { ok: false, error: "That link is too long" }
  if (url && !/^https:\/\//i.test(url)) return { ok: false, error: "Links must be https" }

  const preset = String(body.preset ?? "")
  if (!PRESETS[preset]) return { ok: false, error: `Unknown colourway "${preset}"` }

  const object = validateObject(body.object)
  if (!object) return { ok: false, error: "That object cannot be shared" }

  let look: Look | undefined
  if (body.look !== undefined && body.look !== null) {
    look = validateLook(body.look, preset) ?? undefined
    if (!look) return { ok: false, error: "That look cannot be shared" }
  }

  const parentId = postId(body.parentId)
  // Two parents that are the same post is a remix, not a cross.
  const second = postId(body.secondParentId)
  const secondParentId = second && second !== parentId ? second : undefined

  // A daily tag is a claim — "this is today's object" — so it is checked rather
  // than stored as sent: the right day, and that day's object.
  let daily: string | undefined
  if (body.daily !== undefined && body.daily !== null && body.daily !== "") {
    if (typeof body.daily !== "string" || !answersDaily(body.daily, object)) {
      return { ok: false, error: "That isn't today's object any more — post it without the daily tag" }
    }
    daily = body.daily
  }

  return { ok: true, value: { title, author, url, object, preset, look, parentId, secondParentId, daily } }
}

const POST_ID = /^[a-z0-9][a-z0-9-]{0,79}$/

function postId(value: unknown): string | undefined {
  return typeof value === "string" && POST_ID.test(value) ? value : undefined
}

const FAMILIES = [
  "mercury", "aurora", "prism", "magma", "pearl", "obsidian",
  "velvet", "halo", "jade", "plasma", "original", "ferrofluid",
] as const
const BACKGROUNDS = ["dark", "mid", "light", "transparent"] as const

/** The range every gene may take; the same bounds breeding clamps to. */
const SURFACE: Record<keyof Look["surface"], [number, number]> = {
  noise: [0, 0.16],
  dimple: [0, 0.4],
  rippleAmp: [0, 0.25],
  rippleSpeed: [0.05, 2.4],
  rippleTightness: [4, 160],
  trailSpacing: [0.01, 0.4],
  advection: [0, 1.5],
  spikes: [0, 0.35],
}
const SHADING: Record<keyof Look["shading"], [number, number]> = {
  metalness: [0, 1],
  roughness: [0, 1],
  fresnel: [0, 1.5],
  specPower: [1, 200],
  transmission: [0, 1],
  ior: [1, 2.4],
  thinFilm: [0, 1],
  emissive: [0, 3],
}

/**
 * Rebuild a look from known genes only, each clamped to its range.
 *
 * The same rule as the object: nothing is spread through. A missing number
 * takes the base colourway's value, so a look is always complete however little
 * of it was sent.
 */
function validateLook(input: unknown, presetId: string): Look | null {
  if (typeof input !== "object" || input === null) return null
  const look = input as Record<string, unknown>
  const base = PRESETS[presetId]

  const family = FAMILIES.find((name) => name === look.family)
  if (!family) return null
  const background = BACKGROUNDS.find((name) => name === look.background) ?? base.background

  if (!Array.isArray(look.palette) || look.palette.length === 0 || look.palette.length > 8) return null
  const palette = look.palette.map((colour) => String(colour).toLowerCase())
  if (!palette.every((colour) => /^#[0-9a-f]{6}$/.test(colour))) return null

  const genes = <T extends object>(
    raw: unknown,
    ranges: Record<string, [number, number]>,
    fallback: T,
  ): T => {
    const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
    const out: Record<string, number> = {}
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const value = source[key]
      const fallbackValue = (fallback as Record<string, number | undefined>)[key]
      const n = typeof value === "number" && Number.isFinite(value) ? value : fallbackValue
      if (n === undefined) continue
      out[key] = Math.min(max, Math.max(min, n))
    }
    return out as T
  }

  return {
    family,
    background,
    palette,
    surface: genes(look.surface, SURFACE, base.surface),
    shading: genes(look.shading, SHADING, base.shading),
  }
}

/**
 * Rebuild the object from known fields only.
 *
 * A blob URL is rejected outright: it names a file on the submitter's own
 * machine and would render as a broken entry for everyone else, which is a
 * support question rather than a post.
 */
function validateObject(input: unknown): ObjectSource | null {
  if (typeof input !== "object" || input === null) return null
  const source = input as Record<string, unknown>
  const num = (value: unknown, fallback: number, min: number, max: number) => {
    const n = typeof value === "number" && Number.isFinite(value) ? value : fallback
    return Math.min(max, Math.max(min, n))
  }
  const remoteUrl = (value: unknown): string | null => {
    const url = String(value ?? "")
    if (!/^https:\/\//i.test(url) || url.length > MAX_URL) return null
    return url
  }

  switch (source.type) {
    case "text": {
      const value = String(source.value ?? "").slice(0, 24)
      if (!value.trim()) return null
      return {
        type: "text",
        value,
        depth: num(source.depth, 0.45, 0.05, 1.5),
        bevel: num(source.bevel, 0.03, 0, 0.12),
      }
    }
    case "shape": {
      const shapes = ["sphere", "torus", "torusknot", "capsule", "icosahedron", "rounded-box"]
      const shape = String(source.shape ?? "")
      if (!shapes.includes(shape)) return null
      return { type: "shape", shape: shape as never, detail: num(source.detail, 160, 32, 400) }
    }
    case "model": {
      const src = remoteUrl(source.src)
      return src ? { type: "model", src } : null
    }
    case "svg": {
      const src = remoteUrl(source.src)
      return src ? { type: "svg", src, depth: num(source.depth, 0.45, 0.05, 1.5) } : null
    }
    case "image": {
      const src = remoteUrl(source.src)
      return src ? { type: "image", src, depth: num(source.depth, 0.45, 0.05, 1.5) } : null
    }
    default:
      return null
  }
}
