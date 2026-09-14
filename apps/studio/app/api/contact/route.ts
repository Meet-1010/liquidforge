import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { hashKey } from "@/lib/store"

/**
 * The contact form: questions, bug reports, privacy requests.
 *
 * Stored in the same database as the gallery, where the maintainer reads them.
 * The sender's address is hashed for the rate limit and never stored; the only
 * way back to the sender is the reply address they choose to leave.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const TOPICS = ["question", "bug", "privacy", "mcp", "other"] as const
const RATE_LIMIT = 4
const WINDOW_MS = 60 * 60 * 1000

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 })
  }

  const topic = TOPICS.find((entry) => entry === body.topic) ?? "other"
  const message = String(body.message ?? "").trim()
  const replyTo = String(body.replyTo ?? "").trim()
  if (message.length < 10) return NextResponse.json({ error: "A few more words, please — at least ten characters." }, { status: 400 })
  if (message.length > 4000) return NextResponse.json({ error: "Messages are capped at 4,000 characters." }, { status: 400 })
  if (replyTo && (replyTo.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo))) {
    return NextResponse.json({ error: "That reply address doesn't look like an email address." }, { status: 400 })
  }
  // A honeypot field that people never see and form-filling scripts do.
  if (String(body.website ?? "")) return NextResponse.json({ ok: true })

  const url = process.env.DATABASE_URL
  if (!url) return NextResponse.json({ error: "The contact form is not connected to a database on this deployment." }, { status: 503 })

  const forwarded = request.headers.get("x-forwarded-for") ?? ""
  const submitterKey = hashKey(forwarded.split(",")[0]?.trim() || "unknown")

  try {
    const sql = neon(url)
    const since = new Date(Date.now() - WINDOW_MS).toISOString()
    const [{ count }] = (await sql`
      select count(*)::int as count from contact_messages where submitter_key = ${submitterKey} and created_at >= ${since}
    `) as Array<{ count: number }>
    if (count >= RATE_LIMIT) return NextResponse.json({ error: "That's a lot of messages in an hour. Try again later." }, { status: 429 })
    await sql`
      insert into contact_messages (topic, message, reply_to, submitter_key)
      values (${topic}, ${message}, ${replyTo || null}, ${submitterKey})
    `
    // The privacy policy promises messages are gone within twelve months, so
    // the promise is kept here rather than on somebody's calendar.
    await sql`delete from contact_messages where created_at < now() - interval '12 months'`
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send that" }, { status: 500 })
  }
}
