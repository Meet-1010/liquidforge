/**
 * Pick a colourway for a site.
 *
 * Lives in the library rather than in the MCP server because both need it: an
 * agent describing somebody's site, and the Studio's brand match, which hands
 * it a palette pulled out of an uploaded logo. One implementation means the
 * recommendation an agent gives and the one the website gives are the same
 * recommendation.
 *
 * Two independent judgements, deliberately kept apart:
 *
 * - **Which family** is a question about register — chrome reads restrained,
 *   magma reads loud — so it is scored from words in the description plus the
 *   one hard constraint, which is that only Pearl is built for a light page.
 * - **Which colourway** is a question about hue, so when a brand colour is
 *   given it is answered by measuring distance in OKLab rather than by more
 *   keywords. sRGB distance would call a dark navy and a dark brown close.
 */

import { COLLECTIONS, PRESETS, presetName } from "../presets"
import type { LiquidPreset, MaterialFamily } from "../types"

export interface RecommendInput {
  /** Colours pulled from a logo or a site, ranked most prominent first. */
  palette?: string[]
  /** What the site is and how it should feel. */
  description?: string
  /** The site's own accent or brand colour, as hex. */
  brandColor?: string
  /** Whether the page the hero lands on is light or dark. */
  background?: "light" | "dark"
}

export interface Recommendation {
  preset: LiquidPreset
  colourway: string
  family: MaterialFamily
  /** Why this one, in a sentence the agent can pass on. */
  reason: string
  runnersUp: Array<{ id: string; label: string; why: string }>
}

const SIGNALS: Record<MaterialFamily, { words: string[]; register: string }> = {
  mercury: {
    // Deliberately not "luxury" or "premium": those now belong to Obsidian's
    // register, and leaving them here made every expensive-sounding brief a tie
    // that fell to Mercury by accident of ordering.
    words: [
      "saas", "developer", "infrastructure", "enterprise", "fintech", "bank", "security",
      "platform", "api", "minimal", "serious", "professional", "b2b", "agency", "portfolio",
      "chrome", "metal", "silver", "mirror", "polished",
    ],
    register: "restrained and clean",
  },
  aurora: {
    words: [
      "music", "festival", "creative", "colourful", "colorful", "playful", "launch", "startup",
      "community", "social", "fashion", "art", "vibrant", "energetic", "iridescent", "rainbow",
      "psychedelic", "media", "editorial",
    ],
    register: "colourful and alive",
  },
  prism: {
    words: [
      "hardware", "product", "device", "optics", "precision", "clarity", "transparent",
      "glass", "crystal", "science", "research", "medical", "clean", "engineering",
      "refraction", "lens",
    ],
    register: "precise and transparent",
  },
  magma: {
    words: [
      "game", "gaming", "esports", "event", "energy", "power", "bold", "loud", "hot", "fire",
      "sports", "crypto", "web3", "nft", "hype", "aggressive", "dramatic", "forge", "molten",
    ],
    register: "loud and hot",
  },
  pearl: {
    words: [
      "wellness", "beauty", "skincare", "calm", "soft", "gentle", "health", "care",
      "pastel", "quiet", "boutique", "wedding", "cosmetics", "spa",
    ],
    register: "soft and quiet",
  },
  obsidian: {
    words: [
      "luxury", "premium", "restrained", "automotive", "car", "watch", "jewellery", "jewelry",
      "audio", "hifi", "piano", "lacquer", "flagship", "concierge", "private", "bespoke",
      "law", "consulting", "architecture", "gloss", "deep",
    ],
    register: "deep and lacquered",
  },
  velvet: {
    words: [
      "fashion", "couture", "theatre", "theater", "cinema", "film", "interiors", "furniture",
      "hotel", "restaurant", "wine", "perfume", "textile", "fabric", "gallery", "museum",
      "opera", "intimate",
    ],
    register: "soft-lit and expensive without shining",
  },
  halo: {
    words: [
      "holographic", "foil", "iridescent", "streetwear", "sneaker", "merch", "drop", "y2k",
      "rave", "club", "ticket", "pass", "collectible", "trading", "sticker", "vinyl",
    ],
    register: "loud and prismatic",
  },
  jade: {
    words: [
      "tea", "ceramic", "craft", "artisan", "botanical", "herbal", "stone", "meditation",
      "clinic", "pharmacy", "supplement", "translucent", "porcelain", "nature", "organic",
      "jade", "marble",
    ],
    register: "translucent and calm",
  },
  plasma: {
    words: [
      "ai", "ml", "data", "network", "graph", "compute", "gpu", "quantum", "signal",
      "telemetry", "observability", "realtime", "streaming", "energy", "grid", "neon",
      "cyber", "synth",
    ],
    register: "electric and technical",
  },
}

/**
 * Families lit for a light page. Everything else is built to sit on a dark
 * ground, and a light page with Mercury is not a near miss — it is unreadable.
 */
const LIGHT_FAMILIES: MaterialFamily[] = ["pearl", "jade"]

/** How many families claim each word, for the weighting in `recommend`. */
const CLAIMS = new Map<string, number>()
for (const signal of Object.values(SIGNALS)) {
  for (const word of signal.words) CLAIMS.set(word, (CLAIMS.get(word) ?? 0) + 1)
}

// -- colour ------------------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim())
  if (!match) return null
  let value = match[1]
  if (value.length === 3) value = value.split("").map((c) => c + c).join("")
  const n = Number.parseInt(value, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** OKLab. Perceptually uniform enough that a distance here means something. */
function oklab(hex: string): [number, number, number] | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const [r, g, b] = rgb.map(srgbToLinear)

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  // Lightness counts for less than hue: a brand colour and a colourway rarely
  // agree on brightness, and it is the hue that has to match.
  const dl = (a[0] - b[0]) * 0.5
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dl * dl + da * da + db * db)
}

/** How close a palette gets to a target colour, at its nearest swatch. */
function paletteDistance(palette: string[], target: [number, number, number]): number {
  let best = Number.POSITIVE_INFINITY
  for (const hex of palette) {
    const lab = oklab(hex)
    if (!lab) continue
    best = Math.min(best, distance(lab, target))
  }
  return best
}

// -- scoring -----------------------------------------------------------------

export function recommend(input: RecommendInput): Recommendation {
  const text = (input.description ?? "").toLowerCase()

  const scores = new Map<MaterialFamily, number>()
  for (const [family, signal] of Object.entries(SIGNALS) as Array<[MaterialFamily, typeof SIGNALS.mercury]>) {
    let score = 0
    for (const word of signal.words) {
      // A word two families both claim says half as much about either. Without
      // this, a brief full of generic praise scores every family equally and
      // the winner is whichever happens to be declared first.
      if (text.includes(word)) score += 1 / (CLAIMS.get(word) ?? 1)
    }
    scores.set(family, score)
  }

  // The one hard constraint, and it outweighs everything the description says.
  for (const family of LIGHT_FAMILIES) {
    const score = scores.get(family) ?? 0
    scores.set(family, input.background === "light" ? score + 4 : input.background === "dark" ? score - 2 : score)
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1])
  // Mercury is the fallback when nothing in the description tips it: it is the
  // least likely to be wrong on a site nobody has described.
  const family: MaterialFamily = (ranked[0]?.[1] ?? 0) > 0 ? ranked[0][0] : "mercury"

  const collection = COLLECTIONS.find((entry) => entry.family === family)
  const ids = (collection?.colourways ?? []).map(
    (_, index) => `${collection?.name.toLowerCase()}-${index + 1}`,
  )

  // An extracted palette leads with its most prominent colour, which is the
  // one a brand is actually recognised by.
  const target = input.brandColor
    ? oklab(input.brandColor)
    : input.palette?.[0]
      ? oklab(input.palette[0])
      : null
  const scored = ids
    .map((id) => PRESETS[id])
    .filter((preset): preset is LiquidPreset => Boolean(preset))
    .map((preset) => ({
      preset,
      distance: target ? paletteDistance(preset.palette, target) : 0,
    }))
    .sort((a, b) => a.distance - b.distance)

  const winner = scored[0]?.preset ?? PRESETS["mercury-1"]
  const name = presetName(winner.id) ?? winner.label

  const register = SIGNALS[family].register
  const matched = SIGNALS[family].words.filter((word) => text.includes(word)).slice(0, 3)

  const reason = [
    `${collection?.name ?? "Mercury"} reads ${register}`,
    matched.length > 0
      ? `, which suits ${matched.join(", ")}`
      : input.description
        ? ", the safest default when nothing in the description pulls harder"
        : "",
    input.background === "light" && LIGHT_FAMILIES.includes(family)
      ? " — and it is one of the two families built for a light page"
      : "",
    target
      ? `. ${name} is the colourway whose palette sits closest to ${input.brandColor}`
      : `. ${name} is the collection's most neutral colourway`,
    ".",
  ].join("")

  return {
    preset: winner,
    colourway: name,
    family,
    reason,
    runnersUp: scored.slice(1, 4).map(({ preset }) => ({
      id: preset.id,
      label: preset.label,
      why: presetName(preset.id) ?? preset.label,
    })),
  }
}

export { extractPalette, type PaletteOptions } from "./palette"
