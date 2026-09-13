import { existsSync } from "node:fs"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve } from "node:path"
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
  if (finite(source.at)) point.at = round(Math.max(0, Math.min(1, source.at)))

  const anchor = source.anchor as Record<string, unknown> | undefined
  if (anchor && typeof anchor === "object" && typeof anchor.selector === "string") {
    const selector = anchor.selector.trim().slice(0, 200)
    // A selector goes into querySelector in someone's browser; it may not carry
    // markup, and an empty one would match nothing forever.
    if (selector && !/[<>{}]/.test(selector)) {
      point.anchor = { selector }
      if (finite(anchor.ay)) point.anchor.ay = round(Math.max(0, Math.min(1, anchor.ay)))
      if (anchor.followX === true) point.anchor.followX = true
      if (finite(anchor.ax)) point.anchor.ax = round(Math.max(0, Math.min(1, anchor.ax)))
    }
  }

  const object = cleanObject(source.object)
  if (object) point.object = object
  if (typeof source.preset === "string" && PRESET_ID.test(source.preset)) point.preset = source.preset
  return point
}

/** Preset ids are `<collection>-<n>`; anything else is not one. */
const PRESET_ID = /^[a-z]{3,20}-[1-9][0-9]?$/

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

function cleanPath(input: unknown): Placement["path"] | undefined {
  if (typeof input !== "object" || input === null) return undefined
  const path = input as Record<string, unknown>
  if (!Array.isArray(path.points)) return undefined
  // A drawn route is a few dozen points; a thousand is a bug or an attack.
  const points = path.points
    .slice(0, 1000)
    .map(cleanPoint)
    .filter((point): point is PlacementPoint => point !== null)
  if (points.length === 0) return undefined
  const out: NonNullable<Placement["path"]> = { points }
  if (finite(path.ease)) out.ease = round(Math.max(0.01, Math.min(1, path.ease)))
  if (finite(path.morph)) out.morph = round(Math.max(0.005, Math.min(0.3, path.morph)))
  if (path.smooth === false) out.smooth = false
  return out
}

function cleanPlacement(input: unknown): Placement | null {
  if (typeof input !== "object" || input === null) return null
  const source = input as Record<string, unknown>

  const origin = cleanPoint(source.origin)
  if (!origin) return null

  const placement: Placement = { origin }

  const object = cleanObject(source.object)
  if (object) placement.object = object
  if (typeof source.preset === "string" && PRESET_ID.test(source.preset)) placement.preset = source.preset

  const breakpoints = source.breakpoints as Record<string, unknown> | undefined
  if (breakpoints && typeof breakpoints === "object") {
    const cleaned: NonNullable<Placement["breakpoints"]> = {}
    for (const name of ["tablet", "phone"] as const) {
      const override = breakpoints[name] as Record<string, unknown> | undefined
      if (!override || typeof override !== "object") continue
      const entry: Record<string, unknown> = {}
      const o = cleanPoint(override.origin)
      if (o) entry.origin = o
      const p = cleanPath(override.path)
      if (p) entry.path = p
      const obj = cleanObject(override.object)
      if (obj) entry.object = obj
      if (typeof override.preset === "string" && PRESET_ID.test(override.preset)) entry.preset = override.preset
      if (override.frame === "viewport" || override.frame === "section") entry.frame = override.frame
      if (Object.keys(entry).length > 0) cleaned[name] = entry
    }
    if (Object.keys(cleaned).length > 0) placement.breakpoints = cleaned
  }

  if (source.frame === "viewport" || source.frame === "section") placement.frame = source.frame
  if (finite(source.layer)) placement.layer = Math.trunc(source.layer)
  if (typeof source.interactive === "boolean") placement.interactive = source.interactive

  const path = cleanPath(source.path)
  if (path) placement.path = path

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

/* ---------- proposals ---------- */

/**
 * A placement an agent has suggested, waiting for a person.
 *
 * The agent cannot see the page, and the file should only change when someone
 * has looked. So an agent writes a proposal beside the placements file; the
 * editor, next time it opens on that page, picks it up as an unsaved draft
 * with a banner — routing it through the page's empty space first, if asked,
 * because that needs the real layout — and it becomes the placement only when
 * the person presses save.
 */
export interface PlacementProposal {
  id: string
  placement: Placement
  route?: "whitespace"
  note?: string
}

function proposalPath(options: PlacementsRouteOptions): string {
  const file = options.file ?? DEFAULT_FILE
  const target = isAbsolute(file) ? file : resolve(process.cwd(), file)
  return join(dirname(target), "liquidforge.proposal.json")
}

export function cleanProposal(input: unknown): PlacementProposal | null {
  if (typeof input !== "object" || input === null) return null
  const source = input as Record<string, unknown>
  if (typeof source.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(source.id)) return null
  const placement = cleanPlacement(source.placement)
  if (!placement) return null
  const proposal: PlacementProposal = { id: source.id, placement }
  if (source.route === "whitespace") proposal.route = "whitespace"
  if (typeof source.note === "string" && source.note.trim()) proposal.note = source.note.trim().slice(0, 240)
  return proposal
}

/** Write a proposal for the editor to pick up. Used by the MCP server. */
export async function writeProposal(proposal: PlacementProposal, options: PlacementsRouteOptions = {}): Promise<string> {
  const cleaned = cleanProposal(proposal)
  if (!cleaned) throw new Error("liquidforge: that proposal is not a valid placement")
  const target = proposalPath(options)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(cleaned, null, 2)}\n`, "utf8")
  return target
}

export async function readProposal(options: PlacementsRouteOptions = {}): Promise<PlacementProposal | null> {
  const target = proposalPath(options)
  if (!existsSync(target)) return null
  try {
    return cleanProposal(JSON.parse(await readFile(target, "utf8")))
  } catch {
    return null
  }
}

export async function clearProposal(options: PlacementsRouteOptions = {}): Promise<void> {
  await rm(proposalPath(options), { force: true })
}

const devOnly = (options: PlacementsRouteOptions) =>
  process.env.NODE_ENV === "production" && !options.allowInProduction

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
    /** `?proposal=1` — the agent's pending proposal, if there is one. */
    async GET(request: Request): Promise<Response> {
      if (devOnly(options)) return Response.json({ error: "Disabled in production." }, { status: 403 })
      if (!new URL(request.url).searchParams.has("proposal")) return Response.json({ error: "Nothing here." }, { status: 404 })
      return Response.json({ proposal: await readProposal(options) })
    },
    /** `?proposal=1` — dismiss it, once saved or discarded. */
    async DELETE(request: Request): Promise<Response> {
      if (devOnly(options)) return Response.json({ error: "Disabled in production." }, { status: 403 })
      if (!new URL(request.url).searchParams.has("proposal")) return Response.json({ error: "Nothing here." }, { status: 404 })
      await clearProposal(options)
      return Response.json({ cleared: true })
    },
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
        const [pathname, query = ""] = (request.url ?? "").split("?")
        if (pathname !== endpoint) return next()

        const send = (status: number, body: unknown) => {
          response.statusCode = status
          response.setHeader("content-type", "application/json")
          response.end(JSON.stringify(body))
        }
        if (query.includes("proposal")) {
          if (request.method === "GET") {
            void readProposal(options).then((proposal) => send(200, { proposal }))
            return
          }
          if (request.method === "DELETE") {
            void clearProposal(options).then(() => send(200, { cleared: true }))
            return
          }
        }
        if (request.method !== "POST") return next()

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
