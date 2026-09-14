import { NextResponse } from "next/server"
import { PRESETS, resolvePreset } from "liquidforge/presets"
import { validateLook } from "@/lib/store/validate"
import { MAX_LOOKS, SLUG, bearer, database, keyMatches, normaliseHandle } from "@/lib/packs"

/**
 * One look in a pack.
 *
 * `GET` — the complete look as a preset object, for anyone to fetch.
 * `POST` — record a use: someone took the look's code. This is the credit.
 * `PUT` — add or replace the look, with the pack's edit key.
 * `DELETE` — remove it, with the key.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Params = { params: Promise<{ handle: string; slug: string }> }
const CORS = { "access-control-allow-origin": "*" }

async function target(params: Params["params"]) {
  const { handle, slug } = await params
  return { handle: normaliseHandle(handle), slug: decodeURIComponent(slug).toLowerCase() }
}

export async function GET(_request: Request, { params }: Params) {
  const sql = database()
  const { handle, slug } = await target(params)
  if (!sql || !SLUG.test(slug)) return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS })
  const rows = (await sql`select title, preset, look, uses from pack_looks where handle = ${handle} and slug = ${slug}`) as Array<{ title: string; preset: string; look: object; uses: number }>
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404, headers: CORS })
  const { title, preset, look, uses } = rows[0]
  return NextResponse.json(
    { id: `@${handle}/${slug}`, title, credit: `@${handle}`, uses, preset: { ...resolvePreset(preset, look), id: `@${handle}/${slug}`, label: title } },
    { headers: { ...CORS, "cache-control": "public, s-maxage=300" } },
  )
}

export async function POST(_request: Request, { params }: Params) {
  const sql = database()
  const { handle, slug } = await target(params)
  if (!sql || !SLUG.test(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const rows = await sql`update pack_looks set uses = uses + 1 where handle = ${handle} and slug = ${slug} returning uses`
  return rows.length ? NextResponse.json({ uses: (rows[0] as { uses: number }).uses }) : NextResponse.json({ error: "Not found" }, { status: 404 })
}

export async function PUT(request: Request, { params }: Params) {
  const sql = database()
  const { handle, slug } = await target(params)
  if (!sql) return NextResponse.json({ error: "No database" }, { status: 503 })
  if (!SLUG.test(slug)) return NextResponse.json({ error: "Look names are letters, numbers and dashes." }, { status: 400 })
  const packs = (await sql`select key_hash from creator_packs where handle = ${handle}`) as Array<{ key_hash: string }>
  if (!packs[0]) return NextResponse.json({ error: "No pack has that handle." }, { status: 404 })
  if (!keyMatches(bearer(request), packs[0].key_hash)) return NextResponse.json({ error: "That edit key doesn't match." }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 })
  }
  const title = String(body.title ?? "").trim()
  const preset = String(body.preset ?? "")
  if (title.length < 2 || title.length > 40) return NextResponse.json({ error: "A title of 2–40 characters, please." }, { status: 400 })
  if (!PRESETS[preset]) return NextResponse.json({ error: "Unknown colourway." }, { status: 400 })
  const look = validateLook(body.look, preset)
  if (!look) return NextResponse.json({ error: "That look can't be saved." }, { status: 400 })

  const [{ count }] = (await sql`select count(*)::int as count from pack_looks where handle = ${handle} and slug <> ${slug}`) as Array<{ count: number }>
  if (count >= MAX_LOOKS) return NextResponse.json({ error: `A pack holds up to ${MAX_LOOKS} looks.` }, { status: 400 })
  await sql`
    insert into pack_looks (handle, slug, title, preset, look) values (${handle}, ${slug}, ${title}, ${preset}, ${JSON.stringify(look)})
    on conflict (handle, slug) do update set title = excluded.title, preset = excluded.preset, look = excluded.look, updated_at = now()
  `
  return NextResponse.json({ id: `@${handle}/${slug}` }, { status: 201 })
}

export async function DELETE(request: Request, { params }: Params) {
  const sql = database()
  const { handle, slug } = await target(params)
  if (!sql) return NextResponse.json({ error: "No database" }, { status: 503 })
  const packs = (await sql`select key_hash from creator_packs where handle = ${handle}`) as Array<{ key_hash: string }>
  if (!packs[0]) return NextResponse.json({ error: "No pack has that handle." }, { status: 404 })
  if (!keyMatches(bearer(request), packs[0].key_hash)) return NextResponse.json({ error: "That edit key doesn't match." }, { status: 403 })
  await sql`delete from pack_looks where handle = ${handle} and slug = ${slug}`
  return NextResponse.json({ ok: true })
}
