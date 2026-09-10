import { NextResponse } from "next/server"
import { getStore } from "@/lib/store"

/**
 * The moderation queue.
 *
 * Posts are live the moment they are made, so this is a takedown tool rather
 * than a gate: list what is up, hide anything that should not be.
 *
 * Guarded by a shared secret in `MODERATION_TOKEN` rather than a login, because
 * a login means accounts, and accounts are a much larger thing to own than this
 * feature is. With no token set the route refuses everything — the failure mode
 * for a missing secret has to be "closed", not "open to anyone who guesses the
 * URL".
 */

export const dynamic = "force-dynamic"

function authorise(request: Request): string | null {
  const expected = process.env.MODERATION_TOKEN
  if (!expected) return "Moderation is not configured on this deployment"
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!provided || provided !== expected) return "Not authorised"
  return null
}

export async function GET(request: Request) {
  const denied = authorise(request)
  if (denied) return NextResponse.json({ error: denied }, { status: 401 })

  const url = new URL(request.url)
  const status = (url.searchParams.get("status") ?? "published") as "published" | "hidden"
  const store = await getStore()
  const { posts, total } = await store.list({ status, limit: 100, offset: 0 })
  return NextResponse.json({ posts, total })
}

export async function PATCH(request: Request) {
  const denied = authorise(request)
  if (denied) return NextResponse.json({ error: denied }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    id?: string
    status?: string
  } | null

  const id = body?.id
  const status = body?.status
  if (!id || (status !== "published" && status !== "hidden")) {
    return NextResponse.json({ error: "Send { id, status }" }, { status: 400 })
  }

  const store = await getStore()
  const updated = await store.setStatus(id, status)
  if (!updated) return NextResponse.json({ error: "No such post" }, { status: 404 })
  return NextResponse.json({ post: updated })
}
