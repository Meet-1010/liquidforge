import { NextResponse } from "next/server"
import { database, keyMatches, bearer, normaliseHandle } from "@/lib/packs"

/**
 * `GET /api/packs/<handle>` — a pack and its looks. With the edit key, also whether it is valid.
 * `DELETE /api/packs/<handle>` — delete the whole pack, with the edit key.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const sql = database()
  const handle = normaliseHandle((await params).handle)
  if (!sql) return NextResponse.json({ error: "No database" }, { status: 503 })
  const packs = (await sql`select handle, name, key_hash, created_at from creator_packs where handle = ${handle}`) as Array<{ handle: string; name: string; key_hash: string; created_at: string }>
  const pack = packs[0]
  if (!pack) return NextResponse.json({ error: "No pack has that handle." }, { status: 404 })
  const looks = await sql`select slug, title, preset, look, uses, created_at from pack_looks where handle = ${handle} order by created_at`
  const key = bearer(request)
  return NextResponse.json(
    { handle: pack.handle, name: pack.name, createdAt: pack.created_at, looks, ...(key ? { canEdit: keyMatches(key, pack.key_hash) } : {}) },
    { headers: { "access-control-allow-origin": "*" } },
  )
}

export async function DELETE(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const sql = database()
  const handle = normaliseHandle((await params).handle)
  if (!sql) return NextResponse.json({ error: "No database" }, { status: 503 })
  const packs = (await sql`select key_hash from creator_packs where handle = ${handle}`) as Array<{ key_hash: string }>
  if (!packs[0]) return NextResponse.json({ error: "No pack has that handle." }, { status: 404 })
  if (!keyMatches(bearer(request), packs[0].key_hash)) return NextResponse.json({ error: "That edit key doesn't match." }, { status: 403 })
  await sql`delete from creator_packs where handle = ${handle}`
  return NextResponse.json({ ok: true })
}
