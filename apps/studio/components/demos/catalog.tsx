"use client"

import type { LiquidPreset, ObjectSource } from "liquidforge"
import { PRESETS } from "liquidforge"

/**
 * Five sites where a liquid surface has an actual job.
 *
 * The rule for what got in: the element has to be doing something a designer
 * would otherwise have had to solve another way. A hero visual an agency would
 * have commissioned a render for. Album art that reacts. A product whose whole
 * pitch is its finish. An identity mark. A token.
 *
 * What got left out is as important. There is no dashboard, no docs page, no
 * blog — putting a rippling chrome blob in the middle of a settings screen is
 * how this ends up as a novelty, and it would have been the easiest thing to
 * fake convincingly.
 */

export interface Demo {
  slug: string
  name: string
  kind: string
  /** Why the element belongs on this page, not just that it looks nice there. */
  rationale: string
  uses: string
  object: ObjectSource
  preset: LiquidPreset
  accent: string
}

export const DEMOS: Demo[] = [
  {
    slug: "aurora-labs",
    name: "Aurora Labs",
    kind: "Developer platform",
    rationale:
      "Infrastructure has nothing to photograph. Every company in this category commissions an abstract render for the hero and reuses it, flat, for two years — this is that render, except it responds to the cursor and takes ten seconds to recolour.",
    uses: "Backdrop hero · feature cards · CTA banner",
    object: { type: "shape", shape: "torusknot", detail: 200 },
    preset: PRESETS["mercury-4"],
    accent: "#7fb2ff",
  },
  {
    slug: "vessel",
    name: "VESSEL",
    kind: "Album release",
    rationale:
      "Cover art is the one image on a music page anyone actually looks at, and it is static everywhere it appears. Here it is the record itself — the same artwork on the page, in the tracklist, and as the mark, all driven by one colourway.",
    uses: "Full-bleed artwork · blended title · track rows",
    object: { type: "shape", shape: "sphere", detail: 200 },
    preset: PRESETS["aurora-5"],
    accent: "#ff7a18",
  },
  {
    slug: "form-01",
    name: "FORM 01",
    kind: "Product drop",
    rationale:
      "The pitch for this kind of product is the finish. A photograph fixes the light and the angle; a material you can turn in your hands sells lacquer far better than a studio shot of it does, and the colourway picker is the real colour picker.",
    uses: "Product stage · swatches · sticky buy bar",
    object: { type: "shape", shape: "rounded-box", detail: 180 },
    preset: PRESETS["obsidian-2"],
    accent: "#c14410",
  },
  {
    slug: "meridian",
    name: "Studio Meridian",
    kind: "Design studio",
    rationale:
      "A studio's identity has to survive at 32px next to the wordmark and at full width on a case study. Same object, same palette, two sizes — which is exactly the test a mark has to pass and the one most generated marks fail.",
    uses: "Mark in the nav · work grid · split intro",
    object: { type: "shape", shape: "icosahedron" },
    preset: PRESETS["prism-3"],
    accent: "#d8b4fe",
  },
  {
    slug: "ridge",
    name: "Ridge",
    kind: "Fintech",
    rationale:
      "Money products draw a coin, and a coin is a rendered object with a metal finish — so it may as well be the real thing. Turning it is the whole interaction, and it puts a serious surface on a page that is otherwise numbers.",
    uses: "Rotating token · stat band · light section",
    object: { type: "shape", shape: "capsule", detail: 160 },
    preset: PRESETS["mercury-7"],
    accent: "#ffe08a",
  },
]

export function demoBySlug(slug: string): Demo | undefined {
  return DEMOS.find((demo) => demo.slug === slug)
}
