/**
 * A brand, read from its homepage: the logo, the heading typeface, and a copy
 * of the page safe to show in a sandbox.
 *
 * All of it is text work on HTML and CSS a server route already fetched — no
 * headless browser, no screenshot service — which is what keeps it free to run.
 */

export type BrandLogo =
  | { kind: "svg"; markup: string }
  | { kind: "image"; url: string }
  | { kind: "none" }

const LOGO_WORDS = /logo|brand|wordmark|site-?title|navbar-brand|home/i

/** Remove everything from an SVG that could run, fetch or style something outside it. */
export function sanitizeSvg(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\s(on\w+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .slice(0, 60_000)
}

/**
 * The most logo-like thing on the page.
 *
 * Inline SVGs are weighed by where they sit — inside something whose class, id
 * or label says logo or brand, inside the header, early in the document — and
 * against looking like an icon: a 16 or 24 pixel square is a menu or a cart,
 * not a wordmark. Failing an SVG, an image whose name or alt text says logo,
 * then the touch icon.
 */
export function findLogo(html: string, base: string): BrandLogo {
  const headerEnd = html.search(/<\/header>/i)
  let best: { markup: string; score: number } | null = null

  for (const match of html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)) {
    const markup = match[0]
    const at = match.index ?? 0
    if (markup.length < 150 || markup.length > 80_000) continue
    const before = html.slice(Math.max(0, at - 400), at)
    const opening = /<svg\b[^>]*>/i.exec(markup)?.[0] ?? ""
    let score = 0
    if (LOGO_WORDS.test(before.slice(-400).match(/<[^<]*$/)?.[0] ?? "") || LOGO_WORDS.test(before)) score += 3
    if (LOGO_WORDS.test(opening) || /<title>[^<]*logo/i.test(markup)) score += 2
    if (headerEnd > 0 && at < headerEnd) score += 2
    if (at < html.length * 0.2) score += 1
    const width = Number(/\bwidth="(\d+(?:\.\d+)?)/.exec(opening)?.[1])
    const height = Number(/\bheight="(\d+(?:\.\d+)?)/.exec(opening)?.[1])
    const viewBox = /viewBox="[\d.\s-]+?\s([\d.]+)\s([\d.]+)"/.exec(opening)
    const ratio = viewBox ? Number(viewBox[1]) / Number(viewBox[2]) : width && height ? width / height : 1
    if (ratio > 1.6) score += 2
    if (width && width <= 24 && height && height <= 24) score -= 3
    if ((markup.match(/<path\b/gi) ?? []).length === 0 && !/<(?:polygon|rect|circle|ellipse)\b/i.test(markup)) score -= 3
    if (!best || score > best.score) best = { markup, score }
  }
  if (best && best.score >= 4) return { kind: "svg", markup: sanitizeSvg(best.markup) }

  const resolve = (href: string) => {
    try {
      return new URL(href, base).toString()
    } catch {
      return null
    }
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (src && !src.startsWith("data:") && LOGO_WORDS.test(tag)) {
      const url = resolve(src)
      if (url) return { kind: "image", url }
    }
  }
  const touch = /<link\b[^>]*rel\s*=\s*["'][^"']*apple-touch-icon[^"']*["'][^>]*>/i.exec(html)?.[0]
  const href = touch && /href\s*=\s*["']([^"']+)["']/i.exec(touch)?.[1]
  const url = href ? resolve(href) : null
  return url ? { kind: "image", url } : { kind: "none" }
}

/** The typeface the site sets its headings in, when it says so plainly. */
export function findHeadingFont(html: string, stylesheets: string[]): { family: string; google: boolean } | null {
  const google = /fonts\.googleapis\.com\/css2?\?[^"']*family=([^"'&:;]+)/i.exec(html)?.[1]
  const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).concat(stylesheets).join("\n")
  const declared =
    /--(?:font-)?(?:heading|display|headline|title)(?:-font)?(?:-family)?\s*:\s*([^;}]+)/i.exec(css)?.[1] ??
    /(?:^|[}\s,])h1\b[^{]*\{[^}]*font-family\s*:\s*([^;}]+)/i.exec(css)?.[1]
  const first = (value: string) => value.split(",")[0].trim().replace(/^["']|["']$/g, "").replace(/\+/g, " ")
  if (declared && !/var\(|inherit|system-ui|sans-serif$|serif$/i.test(first(declared))) {
    const family = first(declared)
    return { family, google: Boolean(google && decodeURIComponent(google).replace(/\+/g, " ").toLowerCase() === family.toLowerCase()) }
  }
  if (google) return { family: decodeURIComponent(google).replace(/\+/g, " "), google: true }
  return null
}

/**
 * The homepage as inert HTML for a sandboxed frame: every script and handler
 * gone, frames and forms disabled, lazy images given their real sources, and a
 * base address so its own stylesheets and pictures still load.
 */
export function inertPage(html: string, base: string): string {
  let page = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi, "$1")
    .replace(/<(iframe|object|embed|frame|frameset)\b[\s\S]*?(?:<\/\1>|\/>)/gi, "")
    .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh[^>]*>/gi, "")
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/\s(on\w+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(["'\s])javascript:/gi, "$1about:blank#")
    .replace(/\sdata-(src|srcset)\s*=/gi, " $1=")
    .replace(/\sloading\s*=\s*["']lazy["']/gi, "")
  const head = `<base href="${base.replace(/"/g, "&quot;")}"><meta name="referrer" content="no-referrer">`
  page = /<head\b[^>]*>/i.test(page) ? page.replace(/<head\b[^>]*>/i, (tag) => tag + head) : head + page
  return page.slice(0, 1_500_000)
}
