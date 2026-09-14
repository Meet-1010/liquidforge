import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { hashKey } from "@/lib/store"
import { validateSubmission } from "@/lib/store/validate"

/**
 * Save a moving link: a look, and the looping GIF the sharer's browser made of it.
 *
 * The GIF is rendered on the sharer's own GPU, so nothing here renders anything —
 * this checks the file is a small GIF, checks the look like any gallery post,
 * and stores both. The database is the free tier, so GIFs share a fixed budget:
 * past it, the least recently viewed lose their GIF and fall back to a still.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const MAX_GIF = 900_000
const BUDGET = 250_000_000
const RATE_LIMIT = 12
const WINDOW_MS = 60 * 60 * 1000

export async function POST(request: Request) {
  const url = process.env.DATABASE_URL
  if (!url) return NextResponse.json({ error: "Moving links need a database, and this deployment has none." }, { status: 503 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Expected a form with the GIF and the look" }, { status: 400 })
  }
  const file = form.get("gif")
  if (!(file instanceof Blob)) return NextResponse.json({ error: "The GIF is missing" }, { status: 400 })
  if (file.size > MAX_GIF) return NextResponse.json({ error: "That GIF is over 900 KB" }, { status: 413 })
  const gif = Buffer.from(await file.arrayBuffer())
  if (gif.subarray(0, 6).toString("latin1") !== "GIF89a") return NextResponse.json({ error: "That isn't a GIF" }, { status: 415 })
  const width = gif.readUInt16LE(6)
  const height = gif.readUInt16LE(8)
  if (width < 200 || height < 100 || width > 800 || height > 800) return NextResponse.json({ error: "That GIF is an odd size" }, { status: 400 })

  let object: unknown
  try {
    object = JSON.parse(String(form.get("object") ?? ""))
  } catch {
    return NextResponse.json({ error: "The object is missing" }, { status: 400 })
  }
  const checked = validateSubmission({ title: form.get("title"), preset: form.get("preset"), object })
  if (!checked.ok || !checked.value) return NextResponse.json({ error: checked.error }, { status: 400 })
  const { title, preset } = checked.value

  const forwarded = request.headers.get("x-forwarded-for") ?? ""
  const submitterKey = hashKey(forwarded.split(",")[0]?.trim() || "unknown")

  try {
    const sql = neon(url)
    const since = new Date(Date.now() - WINDOW_MS).toISOString()
    const [{ count }] = (await sql`
      select count(*)::int as count from moving_links where submitter_key = ${submitterKey} and created_at >= ${since}
    `) as Array<{ count: number }>
    if (count >= RATE_LIMIT) return NextResponse.json({ error: "That's a lot of links in an hour. Try again later." }, { status: 429 })

    const id = randomBytes(8).toString("base64url").slice(0, 10)
    await sql`
      insert into moving_links (id, title, object, preset, width, height, gif, gif_bytes, submitter_key)
      values (${id}, ${title}, ${JSON.stringify(checked.value.object)}, ${preset}, ${width}, ${height}, ${gif}, ${gif.length}, ${submitterKey})
    `
    // Keep every GIF together under the budget, dropping the least recently viewed first.
    await sql`
      update moving_links set gif = null, gif_bytes = 0
      where id in (
        select id from (
          select id, sum(gif_bytes) over (order by last_viewed_at desc, created_at desc) as running
          from moving_links where gif is not null
        ) ranked where running > ${BUDGET}
      )
    `
    return NextResponse.json({ id, path: `/l/${id}` }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save that link" }, { status: 500 })
  }
}
