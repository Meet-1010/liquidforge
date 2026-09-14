import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { neon } from "@neondatabase/serverless"
import type { ObjectSource } from "liquidforge/presets"
import { MovingLinkView } from "@/components/moving-link-view"

/**
 * Where a moving link lands. The page is the live look; the preview it
 * unfurls as is the GIF made when it was shared.
 */

export const dynamic = "force-dynamic"

interface Row {
  title: string
  object: ObjectSource
  preset: string
  width: number
  height: number
}

async function load(id: string): Promise<Row | null> {
  const url = process.env.DATABASE_URL
  if (!url || !/^[\w-]{6,16}$/.test(id)) return null
  const rows = (await neon(url)`select title, object, preset, width, height from moving_links where id = ${id}`) as Row[]
  return rows[0] ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const row = await load(id)
  if (!row) return { title: "Liquidforge" }
  const list = await headers()
  const origin = `${list.get("x-forwarded-proto") ?? "https"}://${list.get("x-forwarded-host") ?? list.get("host")}`
  const image = { url: `${origin}/api/links/${id}/gif`, width: row.width, height: row.height, type: "image/gif", alt: row.title }
  const description = "A liquid object you can touch. Made with Liquidforge."
  return {
    title: `${row.title} — Liquidforge`,
    description,
    openGraph: { title: row.title, description, type: "website", url: `${origin}/l/${id}`, images: [image] },
    twitter: { card: "summary_large_image", title: row.title, description, images: [image.url] },
  }
}

export default async function MovingLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await load(id)
  if (!row) notFound()
  return <MovingLinkView title={row.title} object={row.object} preset={row.preset} />
}
