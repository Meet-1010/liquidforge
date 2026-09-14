import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

/**
 * A moving link's GIF, or — once the budget has dropped it — the still.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = process.env.DATABASE_URL
  if (!url || !/^[\w-]{6,16}$/.test(id)) return new NextResponse("Not found", { status: 404 })
  const sql = neon(url)
  const rows = (await sql`select title, preset, gif from moving_links where id = ${id}`) as Array<{ title: string; preset: string; gif: Buffer | null }>
  const row = rows[0]
  if (!row) return new NextResponse("Not found", { status: 404 })
  if (!row.gif) {
    const still = new URL("/api/og", request.url)
    still.searchParams.set("preset", row.preset)
    still.searchParams.set("title", row.title)
    return NextResponse.redirect(still, 302)
  }
  // Viewed recently enough is recent enough: one write an hour at most.
  await sql`update moving_links set last_viewed_at = now() where id = ${id} and last_viewed_at < now() - interval '1 hour'`
  return new NextResponse(new Uint8Array(row.gif), {
    headers: { "content-type": "image/gif", "cache-control": "public, max-age=86400, s-maxage=86400", "x-content-type-options": "nosniff" },
  })
}
