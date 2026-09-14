import { NextResponse } from "next/server"
import { getStore } from "@/lib/store"
import type { Post } from "@/lib/store"
import { ancestorsOf, childrenIndex, descendantIds, descendantsOf, mostBred } from "@/lib/lineage"

/**
 * `GET /api/community/family?id=<post>` — a post with its ancestors and descendants.
 * `GET /api/community/family?top=week` — the most-bred lines of the last seven days.
 *
 * Computed from the published gallery in memory, which is right for a gallery
 * of hundreds of posts and would want a recursive query at tens of thousands.
 */

export const dynamic = "force-dynamic"

type PublicPost = Omit<Post, "submitterKey" | "status">

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  try {
    const store = await getStore()
    const { posts: raw } = await store.list({ status: "published", limit: 2000, offset: 0 })
    const posts: PublicPost[] = raw.map(({ submitterKey: _key, status: _status, ...post }) => post)

    if (params.get("top") === "week") {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      return NextResponse.json({ since: since.toISOString(), lines: mostBred(posts, since, 6), posts: posts.slice(0, 60) })
    }

    const id = params.get("id") ?? ""
    const byId = new Map(posts.map((post) => [post.id, post]))
    const post = byId.get(id)
    if (!post) return NextResponse.json({ error: "That post isn't in the gallery" }, { status: 404 })
    const children = childrenIndex(posts)
    return NextResponse.json({
      post,
      ancestors: ancestorsOf(post, byId),
      descendants: descendantsOf(post, children),
      descendantCount: descendantIds(post.id, children).size,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read the gallery" }, { status: 500 })
  }
}
