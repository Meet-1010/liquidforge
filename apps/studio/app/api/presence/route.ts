import { hub } from "@/lib/presence/hub"

/**
 * `GET` streams everyone's cursors; `POST` sends yours.
 *
 * Names and colours arrive from the browser and are shown to strangers, so both
 * are clamped here: a name is trimmed to something that fits a pill, and a
 * colour has to be a hex triple. Nothing else a client sends is used.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_NAME = 18

export async function GET(request: Request) {
  const room = new URL(request.url).searchParams.get("room") ?? "home"
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // The client went away mid-write; the abort below cleans up.
        }
      }

      const unsubscribe = hub.subscribe(room, send)
      request.signal.addEventListener("abort", () => {
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Nginx buffers by default, which turns a live stream into a long pause.
      "x-accel-buffering": "no",
    },
  })
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return new Response("Expected JSON", { status: 400 })

  const room = String(body.room ?? "home").slice(0, 40)
  const id = String(body.id ?? "").slice(0, 40)
  if (!id) return new Response("Missing id", { status: 400 })

  if (body.leaving) {
    hub.leave(room, id)
    return new Response(null, { status: 204 })
  }

  const num = (value: unknown) => {
    const n = typeof value === "number" && Number.isFinite(value) ? value : 0.5
    return Math.min(1, Math.max(0, n))
  }
  const colour = String(body.colour ?? "")

  hub.move(room, {
    id,
    x: num(body.x),
    y: num(body.y),
    name: String(body.name ?? "").trim().slice(0, MAX_NAME) || "Someone",
    colour: /^#[0-9a-f]{6}$/i.test(colour) ? colour : "#ffffff",
  })

  return new Response(null, { status: 204 })
}
