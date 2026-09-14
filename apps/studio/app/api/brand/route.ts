import { NextResponse } from "next/server"
import { recommend, readSite, stylesheetLinks } from "liquidforge/recommend"
import { findHeadingFont, findLogo, inertPage } from "@/lib/brand"
import { PAGE_LIMIT, SHEET_LIMIT, fetchText } from "@/lib/safe-fetch"

/**
 * A brand from a homepage address.
 *
 * `GET /api/brand?url=example.com` reads the page and its stylesheets once and
 * returns everything the brand preview needs: the palette and ground, the
 * closest colourway, the logo, the heading typeface, and the page itself with
 * everything executable removed, for a sandboxed frame.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

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
        logo: findLogo(page.text, page.url),
        font: findHeadingFont(page.text, sheets),
        page: inertPage(page.text, page.url),
      },
      { headers: { "cache-control": "public, s-maxage=3600" } },
    )
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read that site" }, { status: 422 })
  }
}
