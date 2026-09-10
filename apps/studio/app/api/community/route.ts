import { NextResponse } from "next/server"
import { getStore, hashKey } from "@/lib/store"
import { validateSubmission } from "@/lib/store/validate"

/**
 * The community gallery's API.
 *
 * `GET` returns published posts; `POST` publishes one straight away.
 *
 * Posting is meant to feel like posting anywhere else: press the button, see
 * your thing. Holding submissions for review is safer and it is also the reason
 * nobody bothers — you publish into a void and check back tomorrow. The defence
 * is validation on the way in, a rate limit, and a moderation route that takes
 * something down rather than one that lets it up.
 */

export const dynamic = "force-dynamic"

const PAGE_LIMIT = 60

/** Three an hour is generous for a person and useless for a script. */
const RATE_LIMIT = 3
const RATE_WINDOW_MS = 60 * 60 * 1000

export async function GET(request: Request) {
  const url = new URL(request.url)
  const limit = Math.min(PAGE_LIMIT, Math.max(1, Number(url.searchParams.get("limit") ?? 24)))
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0))

  try {
    const store = await getStore()
    const { posts, total } = await store.list({ status: "published", limit, offset })
    // The submitter key is an implementation detail of rate limiting and has no
    // business leaving the server, even hashed.
    const safe = posts.map(({ submitterKey: _ignored, ...post }) => post)
    return NextResponse.json({ posts: safe, total })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read the gallery" },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 })
  }

  const result = validateSubmission(body)
  if (!result.ok || !result.value) {
    return NextResponse.json({ error: result.error ?? "Invalid submission" }, { status: 400 })
  }

  // Behind a proxy the socket address is the proxy's, so the forwarded header
  // is what identifies the caller. It is spoofable, which is why this is a
  // speed bump rather than a security control — the real gate is moderation.
  const forwarded = request.headers.get("x-forwarded-for") ?? ""
  const address = forwarded.split(",")[0]?.trim() || "unknown"
  const submitterKey = hashKey(address)

  try {
    const store = await getStore()
    const recent = await store.countRecent(submitterKey, new Date(Date.now() - RATE_WINDOW_MS))
    if (recent >= RATE_LIMIT) {
      return NextResponse.json(
        { error: `That is ${RATE_LIMIT} in an hour, which is plenty. Try again later.` },
        { status: 429 },
      )
    }

    const parentId = typeof (body as { parentId?: unknown }).parentId === "string"
      ? ((body as { parentId: string }).parentId || undefined)
      : undefined

    const post = await store.create({ ...result.value, submitterKey, parentId })
    return NextResponse.json(
      { id: post.id, status: post.status, message: "Posted." },
      { status: 201 },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save that" },
      { status: 500 },
    )
  }
}
