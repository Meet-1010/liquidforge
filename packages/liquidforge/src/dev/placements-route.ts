import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, resolve } from "node:path"
import { PLACEMENTS_ENDPOINT, type Placement, type PlacementFile, type PlacementPoint } from "../placement/types"
import type { ObjectSource } from "../types"

/**
 * The half of the editor that runs on your machine.
 *
 * It does exactly one thing: take a placement file from the browser, check it
 * is actually a placement file, and write it into your repo. It refuses to run
 * outside development, because an endpoint that writes to disk on request is
 * not something anyone should be able to reach in production.
 *
 * Framework-agnostic on purpose — it takes a request body and returns a result,
 * so the Next route, a Vite middleware and an Express handler are each about
 * four lines on top of it.
 */

export interface PlacementsRouteOptions {
  /**
   * Where to write.
   *
   * Relative paths resolve against `process.cwd()`, which is the dev server's
   * working directory and *not* necessarily the repository root — in a
   * monorepo, Next runs with the app folder as its cwd, so passing the path
   * from the repo root writes it twice over. The saved response reports the
   * absolute path it actually used, so this is visible rather than mysterious.
   * @default "liquidforge.placements.json"
   */
  file?: string
  /**
   * Let it run outside development. There is no good reason to set this, and
   * the parameter exists mostly so that saying no is a deliberate act.
   * @default false
   */
  allowInProduction?: boolean
}

export type RouteResult =
  | { status: 200; body: { file: string; path: string; count: number } }
  | { status: 400 | 403 | 500; body: { error: string } }

const DEFAULT_FILE = "liquidforge.placements.json"

/* ---------- validation ---------- */

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

function cleanPoint(input: unknown): PlacementPoint | null {
  if (typeof input !== "object" || input === null) return null
  const source = input as Record<string, unknown>
  if (!finite(source.x) || !finite(source.y)) return null

  const point: PlacementPoint = { x: round(source.x), y: round(source.y) }
  // Sizes are clamped rather than rejected: a slider that briefly reports 4000%
  // should produce a big object, not a failed save.
  if (finite(source.size)) point.size = round(Math.max(0.001, Math.min(8, source.size)))
  if (finite(source.spin)) point.spin = round(source.spin)
  return point
}

/** Four decimals is about a tenth of a pixel on a 5K display, and it halves the file. */
function round(value: number): number {
  return Math.round(value * 1e4) / 1e4
}

/**
 * Rebuild the object from known fields only.
 *
 * Same posture as the community gallery's validator, and for the same reason:
 * this arrives over HTTP and ends up written to a file in someone's repo, so
 * nothing is passed through — every field is read out by name or dropped. A
 * remote `src` is capped and must be https; a blob URL names a file on one
 * machine and would be a broken object everywhere else.
 */
function cleanObject(input: unknown): ObjectSource | null {
  if (typeof input !== "object" || input === null) return null
  const source = input as Record<string, unknown>
  const clamp = (value: unknown, fallback: number, min: number, max: number) => {
    const n = finite(value) ? value : fallback
    return round(Math.min(max, Math.max(min, n)))
  }
  const https = (value: unknown): string | null => {
    const url = String(value ?? "")
    return /^https:\/\//i.test(url) && url.length <= 400 ? url : null
  }

  switch (source.type) {
    case "shape": {
      const shapes = ["sphere", "torus", "torusknot", "capsule", "icosahedron", "rounded-box"]
      const shape = String(source.shape ?? "")
      if (!shapes.includes(shape)) return null
      return { type: "shape", shape: shape as never, detail: clamp(source.detail, 160, 32, 400) }
    }
    case "text": {
      const value = String(source.value ?? "").slice(0, 24)
      if (!value.trim()) return null
      return { type: "text", value, depth: clamp(source.depth, 0.45, 0.05, 1.5), bevel: clamp(source.bevel, 0.03, 0, 0.12) }
    }
    case "model": {
      const src = https(source.src)
      return src ? { type: "model", src } : null
    }
    case "svg": {
      const src = https(source.src)
      return src ? { type: "svg", src, depth: clamp(source.depth, 0.45, 0.05, 1.5) } : null
    }
    case "image": {
      const src = https(source.src)
      return src ? { type: "image", src, depth: clamp(source.depth, 0.45, 0.05, 1.5) } : null
    }
    default:
      return null
  }
}

function cleanPlacement(input: unknown): Placement | null {
  if (typeof input !== "object" || input === null) return null
  const source = input as Record<string, unknown>

  const origin = cleanPoint(source.origin)
  if (!origin) return null

  const placement: Placement = { origin }

  const object = cleanObject(source.object)
  if (object) placement.object = object
  // Preset ids are `<collection>-<n>`; anything else is not one.
  if (typeof source.preset === "string" && /^[a-z]{3,20}-[1-9][0-9]?$/.test(source.preset)) {
    placement.preset = source.preset
  }

  if (source.frame === "viewport" || source.frame === "section") placement.frame = source.frame
  if (finite(source.layer)) placement.layer = Math.trunc(source.layer)
  if (typeof source.interactive === "boolean") placement.interactive = source.interactive

  const path = source.path
  if (typeof path === "object" && path !== null) {
    const raw = (path as Record<string, unknown>).points
    if (Array.isArray(raw)) {
      const points = raw.map(cleanPoint).filter((point): point is PlacementPoint => point !== null)
      if (points.length > 0) {
        placement.path = { points }
        const ease = (path as Record<string, unknown>).ease
        if (finite(ease)) placement.path.ease = round(Math.max(0.01, Math.min(1, ease)))
        if ((path as Record<string, unknown>).smooth === false) placement.path.smooth = false
      }
    }
  }

  return placement
}

export function cleanPlacementFile(input: unknown): PlacementFile | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null
  const out: PlacementFile = {}
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    // Ids end up as object keys in someone's repo and as CSS selectors in the
    // editor; keeping them boring avoids both problems at once.
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) continue
    const placement = cleanPlacement(value)
    if (placement) out[id] = placement
  }
  return out
}

/* ---------- the handler ---------- */

export async function handlePlacementsSave(
  body: unknown,
  options: PlacementsRouteOptions = {},
): Promise<RouteResult> {
  const { file = DEFAULT_FILE, allowInProduction = false } = options

  if (process.env.NODE_ENV === "production" && !allowInProduction) {
    return { status: 403, body: { error: "The placements endpoint is disabled in production." } }
  }

  const cleaned = cleanPlacementFile(body)
  if (!cleaned) return { status: 400, body: { error: "Expected an object of placements keyed by id." } }

  const target = isAbsolute(file) ? file : resolve(process.cwd(), file)

  try {
    // Merge rather than replace, so an editor open on one page cannot drop the
    // placements belonging to a page it never loaded.
    let merged = cleaned
    if (existsSync(target)) {
      const existing = cleanPlacementFile(JSON.parse(await readFile(target, "utf8")))
      if (existing) merged = { ...existing, ...cleaned }
    }

    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, `${JSON.stringify(merged, null, 2)}\n`, "utf8")
    return { status: 200, body: { file, path: target, count: Object.keys(merged).length } }
  } catch (error) {
    return {
      status: 500,
      body: { error: error instanceof Error ? error.message : "Could not write the placements file" },
    }
  }
}

/**
 * A Next.js App Router route, complete.
 *
 * ```ts
 * // app/api/liquidforge/placements/route.ts
 * export const { POST } = createPlacementsRoute()
 * ```
 */
export function createPlacementsRoute(options: PlacementsRouteOptions = {}) {
  return {
    async POST(request: Request): Promise<Response> {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return Response.json({ error: "Expected JSON" }, { status: 400 })
      }
      const result = await handlePlacementsSave(body, options)
      return Response.json(result.body, { status: result.status })
    },
  }
}

/**
 * A Vite plugin, for everyone not on Next.
 *
 * ```ts
 * import { liquidforgePlacements } from "liquidforge/dev"
 * export default defineConfig({ plugins: [react(), liquidforgePlacements()] })
 * ```
 */
export function liquidforgePlacements(options: PlacementsRouteOptions = {}) {
  const endpoint = PLACEMENTS_ENDPOINT
  return {
    name: "liquidforge-placements",
    apply: "serve" as const,
    configureServer(server: {
      middlewares: {
        use: (
          handler: (
            request: { url?: string; method?: string; on: (event: string, listener: (chunk?: unknown) => void) => void },
            response: { statusCode: number; setHeader: (key: string, value: string) => void; end: (body?: string) => void },
            next: () => void,
          ) => void,
        ) => void
      }
    }) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== endpoint || request.method !== "POST") return next()

        const chunks: Buffer[] = []
        request.on("data", (chunk) => chunks.push(chunk as Buffer))
        request.on("end", () => {
          void (async () => {
            let parsed: unknown
            try {
              parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"))
            } catch {
              response.statusCode = 400
              response.setHeader("content-type", "application/json")
              response.end(JSON.stringify({ error: "Expected JSON" }))
              return
            }
            const result = await handlePlacementsSave(parsed, options)
            response.statusCode = result.status
            response.setHeader("content-type", "application/json")
            response.end(JSON.stringify(result.body))
          })()
        })
      })
    },
  }
}
