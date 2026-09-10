import { PRESETS } from "liquidforge/presets"
import type { ObjectSource } from "liquidforge/presets"

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

  return { ok: true, value: { title, author, url, object, preset } }
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
