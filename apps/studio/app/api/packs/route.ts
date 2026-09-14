import { NextResponse } from "next/server"
import { hashKey } from "@/lib/store"
import { HANDLE, database, isReserved, newKey } from "@/lib/packs"

/**
 * `GET /api/packs` — packs with at least one look, most used first.
 * `POST /api/packs` — claim a handle. The edit key comes back once and is never shown again.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  const sql = database()
  if (!sql) return NextResponse.json({ packs: [] })
  const packs = await sql`
    select p.handle, p.name, count(l.slug)::int as looks, coalesce(sum(l.uses), 0)::int as uses,
      (select json_build_object('preset', f.preset, 'look', f.look) from pack_looks f where f.handle = p.handle order by f.uses desc, f.created_at limit 1) as cover
    from creator_packs p join pack_looks l on l.handle = p.handle
    group by p.handle, p.name
    order by uses desc, max(l.updated_at) desc
    limit 60
  `
  return NextResponse.json({ packs })
}

export async function POST(request: Request) {
  const sql = database()
  if (!sql) return NextResponse.json({ error: "Packs need a database, and this deployment has none." }, { status: 503 })
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 })
  }
  const handle = String(body.handle ?? "").trim().replace(/^@/, "").toLowerCase()
  const name = String(body.name ?? "").trim()
  if (!HANDLE.test(handle)) return NextResponse.json({ error: "Handles are 3–24 letters, numbers or underscores." }, { status: 400 })
  if (isReserved(handle)) return NextResponse.json({ error: "That handle is reserved." }, { status: 400 })
  if (name.length < 2 || name.length > 40) return NextResponse.json({ error: "A pack name of 2–40 characters, please." }, { status: 400 })

  const forwarded = request.headers.get("x-forwarded-for") ?? ""
  const submitterKey = hashKey(forwarded.split(",")[0]?.trim() || "unknown")
  const [{ count }] = (await sql`
    select count(*)::int as count from creator_packs where submitter_key = ${submitterKey} and created_at > now() - interval '1 day'
  `) as Array<{ count: number }>
  if (count >= 3) return NextResponse.json({ error: "Three new packs a day from one place is the limit." }, { status: 429 })

  const { key, hash } = newKey()
  const rows = await sql`
    insert into creator_packs (handle, name, key_hash, submitter_key) values (${handle}, ${name}, ${hash}, ${submitterKey})
    on conflict (handle) do nothing returning handle
  `
  if (rows.length === 0) return NextResponse.json({ error: "That handle is taken." }, { status: 409 })
  return NextResponse.json({ handle, name, key }, { status: 201 })
}
