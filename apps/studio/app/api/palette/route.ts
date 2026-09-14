import { NextResponse } from "next/server"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { recommend, readSite, stylesheetLinks } from "liquidforge/recommend"

/**
 * A colourway from someone's website.
 *
 * `GET /api/palette?url=https://example.com` fetches the page and up to six of
 * its stylesheets, reads the colours they declare, and returns a palette, the
 * ground the page sits on, and the closest built-in colourway to start from.
 *
 * It fetches a URL a stranger typed, from this server — so every address is
 * checked before a byte is requested, including the address each redirect
 * points at: only public http and https hosts, never this machine or anything
 * on a private network, with hard limits on time and size.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const PAGE_LIMIT = 1_500_000
const SHEET_LIMIT = 800_000
const TIMEOUT_MS = 8000

function isPrivate(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number)
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
    )
  }
  const v6 = address.toLowerCase()
  if (v6.startsWith("::ffff:")) return isPrivate(v6.slice(7))
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80")
}

async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http and https addresses")
  if (url.username || url.password) throw new Error("Addresses with credentials are not fetched")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("That address is not on the public internet")
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivate(address))) {
    throw new Error("That address is not on the public internet")
  }
}

/** Fetch with redirects followed by hand, so every hop is checked, and the body capped. */
async function fetchText(start: string, limit: number): Promise<{ text: string; url: string }> {
  let url = new URL(start)
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url)
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "Mozilla/5.0 (compatible; liquidforge-palette/1.0)", accept: "text/html,text/css,*/*" },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new Error("A redirect with nowhere to go")
      url = new URL(location, url)
      continue
    }
    if (!response.ok || !response.body) throw new Error(`The site answered ${response.status}`)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (size < limit) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
    }
    await reader.cancel().catch(() => {})
    return { text: new TextDecoder().decode(Buffer.concat(chunks).subarray(0, limit)), url: url.toString() }
  }
  throw new Error("Too many redirects")
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url")?.trim() ?? ""
  if (!raw) return NextResponse.json({ error: "Pass ?url=" }, { status: 400 })
  let target: string
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString()
  } catch {
    return NextResponse.json({ error: "That is not a web address" }, { status: 400 })
  }

  try {
    const page = await fetchText(target, PAGE_LIMIT)
    const sheets = await Promise.all(
      stylesheetLinks(page.text, page.url)
        .slice(0, 6)
        .map((href) => fetchText(href, SHEET_LIMIT).then((sheet) => sheet.text).catch(() => "")),
    )
    const site = readSite(page.text, sheets)
    const suggestion = recommend({
      palette: site.palette,
      brandColor: site.brandColor,
      description: [site.title, site.description].filter(Boolean).join(". "),
      background: site.background === "light" ? "light" : "dark",
    })
    return NextResponse.json(
      {
        url: page.url,
        ...site,
        suggestion: { preset: suggestion.preset.id, family: suggestion.family, reason: suggestion.reason },
      },
      { headers: { "cache-control": "public, s-maxage=3600" } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read that site" },
      { status: 422 },
    )
  }
}
