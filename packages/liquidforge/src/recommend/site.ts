import { hexToOklab, oklabToHex } from "../breed"

/**
 * A site's colours, read from its markup and stylesheets rather than from a
 * screenshot.
 *
 * A screenshot needs a browser on a server, which costs money to run and
 * seconds per request. The colours a site is built from are sitting in its CSS
 * as text, and they are better evidence than pixels anyway: a brand colour
 * declared as `--brand` or used on every button is the brand colour, where the
 * most common pixel on a homepage is usually the photograph in its hero.
 *
 * Free of the DOM, so the Studio's server route and the MCP server — which runs
 * on the user's own machine and can fetch the page itself — share it.
 */

export interface SiteColours {
  /** Three to five colours, most important first. */
  palette: string[]
  /** The ground the page sits on. */
  background: "light" | "dark" | "mid"
  /** The single strongest brand colour, when one stood out. */
  brandColor?: string
  title?: string
  description?: string
  /** How many colour declarations were weighed. Low means the reading is a guess. */
  signals: number
}

interface Tally {
  weight: number
  L: number
  a: number
  b: number
}

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", blue: "#0000ff", green: "#008000",
  orange: "#ffa500", purple: "#800080", yellow: "#ffff00", pink: "#ffc0cb", teal: "#008080",
  navy: "#000080", gold: "#ffd700", silver: "#c0c0c0", gray: "#808080", grey: "#808080",
}

/** Parse one CSS colour value to hex, or null for anything not a solid colour. */
export function parseColour(value: string): string | null {
  const v = value.trim().toLowerCase()
  let match = /^#([0-9a-f]{3,8})\b/.exec(v)
  if (match) {
    let hex = match[1]
    if (hex.length === 3 || hex.length === 4) {
      if (hex.length === 4 && Number.parseInt(hex[3], 16) < 8) return null
      hex = hex.slice(0, 3).split("").map((c) => c + c).join("")
    } else if (hex.length === 8) {
      if (Number.parseInt(hex.slice(6, 8), 16) < 128) return null
      hex = hex.slice(0, 6)
    } else if (hex.length !== 6) {
      return null
    }
    return `#${hex}`
  }
  match = /^rgba?\(\s*([\d.]+)%?[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?(?:[\s,/]+([\d.]+)(%?))?\s*\)/.exec(v)
  if (match) {
    const alpha = match[4] === undefined ? 1 : Number(match[4]) / (match[5] ? 100 : 1)
    if (alpha < 0.5) return null
    const channel = (x: string) => Math.max(0, Math.min(255, Math.round(Number(x))))
    return `#${[match[1], match[2], match[3]].map((x) => channel(x).toString(16).padStart(2, "0")).join("")}`
  }
  match = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+)(%?))?\s*\)/.exec(v)
  if (match) {
    const alpha = match[4] === undefined ? 1 : Number(match[4]) / (match[5] ? 100 : 1)
    if (alpha < 0.5) return null
    const h = (Number(match[1]) % 360) / 360
    const s = Number(match[2]) / 100
    const l = Number(match[3]) / 100
    const hue = (p: number, q: number, t: number) => {
      const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t
      if (u < 1 / 6) return p + (q - p) * 6 * u
      if (u < 1 / 2) return q
      if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const rgb = s === 0 ? [l, l, l] : [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)]
    return `#${rgb.map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`
  }
  return NAMED[v] ?? null
}

/** Stylesheet URLs a page links to, resolved against its address, in document order. */
export function stylesheetLinks(html: string, base: string): string[] {
  const links: string[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(tag)) continue
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]
    if (!href) continue
    try {
      links.push(new URL(href, base).toString())
    } catch {
      // A malformed href is skipped, not fatal.
    }
  }
  return links
}

/**
 * Read a site's palette from its HTML and the text of its stylesheets.
 *
 * Every colour declaration is weighed by where it appears. A custom property
 * named like a brand token (`--brand`, `--primary`, `--accent`) counts most; a
 * colour on a button or a link counts more than one on a paragraph; the page's
 * `theme-color` is taken at its word. Greys and near-greys decide the ground
 * but are kept out of the palette, which should be the colours the brand is
 * recognised by.
 */
export function readSite(html: string, stylesheets: string[] = []): SiteColours {
  const tallies = new Map<string, Tally>()
  const neutrals: Array<{ L: number; weight: number; ground: boolean }> = []
  let signals = 0

  const add = (hex: string, weight: number, ground = false) => {
    const [L, a, b] = hexToOklab(hex)
    signals++
    const chroma = Math.hypot(a, b)
    if (chroma < 0.035) {
      neutrals.push({ L, weight, ground })
      return
    }
    // Colours within a hair of each other are one colour written two ways.
    const key = `${Math.round(L * 20)}:${Math.round(a * 25)}:${Math.round(b * 25)}`
    const tally = tallies.get(key)
    if (tally) {
      tally.L += L * weight
      tally.a += a * weight
      tally.b += b * weight
      tally.weight += weight
    } else {
      tallies.set(key, { L: L * weight, a: a * weight, b: b * weight, weight })
    }
    if (ground) neutrals.push({ L, weight: weight * 0.5, ground })
  }

  const theme = /<meta\b[^>]*name\s*=\s*["']theme-color["'][^>]*>/i.exec(html)?.[0]
  const themeColour = theme ? parseColour(/content\s*=\s*["']([^"']+)["']/i.exec(theme)?.[1] ?? "") : null
  if (themeColour) add(themeColour, 6)

  const inlineStyles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
  const styleAttributes = [...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => `x{${m[1]}}`)

  for (const css of [...inlineStyles, ...stylesheets, ...styleAttributes]) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "").slice(0, 1_500_000)
    for (const rule of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim().toLowerCase()
      const important = /\b(button|btn|cta|a\b|a:|link|primary|brand|accent|hero|nav|header|logo)/.test(selector)
      const isGround = /(^|,)\s*(html|body|:root|main)\s*($|,|\{)/.test(selector)
      for (const declaration of rule[2].matchAll(/(--[\w-]+|[a-z-]+)\s*:\s*([^;]+)/gi)) {
        const property = declaration[1].toLowerCase()
        const value = declaration[2]
        const colours = value.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) ?? []
        if (colours.length === 0) continue
        let weight: number
        if (property.startsWith("--")) {
          weight = /brand|primary|accent|main|highlight|cta|theme|key/.test(property) ? 5 : 1.5
        } else if (property === "background" || property === "background-color") {
          weight = 2
        } else if (property === "color") {
          weight = 1.2
        } else if (/border|fill|stroke|outline|shadow|gradient/.test(property)) {
          weight = 0.8
        } else {
          continue
        }
        if (important) weight *= 1.6
        for (const raw of colours) {
          const hex = parseColour(raw)
          if (hex) add(hex, weight, isGround && property.startsWith("background"))
        }
      }
    }
  }

  const ranked = [...tallies.values()]
    .map((t) => {
      const lab = [t.L / t.weight, t.a / t.weight, t.b / t.weight] as [number, number, number]
      // A brand is recognised by its most vivid colour, not its body text: a
      // navy used on every paragraph outweighs a purple used on every button
      // by count alone, so vividness tips the ranking.
      return { lab, weight: t.weight * (0.55 + Math.hypot(lab[1], lab[2]) * 4) }
    })
    .sort((x, y) => y.weight - x.weight)

  const chosen: Array<[number, number, number]> = []
  for (const { lab } of ranked) {
    if (chosen.length >= 5) break
    if (chosen.every((c) => Math.hypot(c[0] - lab[0], c[1] - lab[1], c[2] - lab[2]) >= 0.12)) chosen.push(lab)
  }

  // The ground: what html and body are painted, or failing that the heaviest
  // neutral on the page.
  const grounds = neutrals.filter((n) => n.ground)
  const pool = grounds.length ? grounds : neutrals
  const groundL = pool.length
    ? pool.reduce((sum, n) => sum + n.L * n.weight, 0) / pool.reduce((sum, n) => sum + n.weight, 0)
    : 0.95
  const background = groundL > 0.72 ? "light" : groundL < 0.32 ? "dark" : "mid"

  // A monochrome site still needs a palette the shader can ramp through: fill
  // from the brand colour's own lightness range, then from the page's neutrals.
  const palette = chosen.map(oklabToHex)
  if (palette.length < 3) {
    const seed = chosen[0] ?? [0.62, 0.02, -0.08]
    const fills: Array<[number, number, number]> = [
      [Math.min(0.97, seed[0] + 0.28), seed[1] * 0.5, seed[2] * 0.5],
      [Math.max(0.12, seed[0] - 0.32), seed[1] * 0.7, seed[2] * 0.7],
      [background === "light" ? 0.22 : 0.9, 0, 0],
    ]
    for (const fill of fills) {
      if (palette.length >= 3) break
      palette.push(oklabToHex(fill))
    }
  }

  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1])
  const description = decode(
    /<meta\b[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i.exec(html)?.[1] ??
      /<meta\b[^>]*property\s*=\s*["']og:description["'][^>]*content\s*=\s*["']([^"']*)["']/i.exec(html)?.[1],
  )

  return {
    palette,
    background,
    ...(chosen[0] ? { brandColor: oklabToHex(chosen[0]) } : {}),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    signals,
  }
}

function decode(text: string | undefined): string | undefined {
  if (!text) return undefined
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
}
