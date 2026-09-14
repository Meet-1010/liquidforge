import type { ObjectSource } from "liquidforge"

/**
 * A small made-up studio site, four pages deep, for the melt-between-pages
 * experiment. Each page names the object it shows and the look it wears; the
 * canvas in the layout survives navigation and melts from one to the next.
 */

export interface MeltPage {
  href: string
  label: string
  object: ObjectSource
  preset: string
  eyebrow: string
  headline: string
  body: string
  cta: string
}

export const MELT_PAGES: MeltPage[] = [
  {
    href: "/beta/melt",
    label: "Home",
    object: { type: "shape", shape: "sphere" },
    preset: "mercury-3",
    eyebrow: "Northfold · design studio",
    headline: "We make things that move.",
    body: "Identity, motion and interfaces for companies that would rather be felt than scrolled past.",
    cta: "See the work",
  },
  {
    href: "/beta/melt/work",
    label: "Work",
    object: { type: "text", value: "WORK", depth: 0.5, bevel: 0.03 },
    preset: "magma-4",
    eyebrow: "Selected work · 2024–2026",
    headline: "Forty launches, no two alike.",
    body: "A synth maker's rebrand, a bank that sounds like a record label, and a museum you can touch from your phone.",
    cta: "Read the case studies",
  },
  {
    href: "/beta/melt/studio",
    label: "Studio",
    object: { type: "shape", shape: "torusknot" },
    preset: "aurora-2",
    eyebrow: "The studio",
    headline: "Nine people, one long table.",
    body: "Designers who write code and engineers who draw. We keep the team small so the work stays strange.",
    cta: "Meet the team",
  },
  {
    href: "/beta/melt/contact",
    label: "Contact",
    object: { type: "text", value: "HELLO", depth: 0.5, bevel: 0.03 },
    preset: "pearl-1",
    eyebrow: "Contact",
    headline: "Tell us what should move.",
    body: "New projects start with a thirty-minute call. We answer every message within two working days.",
    cta: "Start a project",
  },
]

export function meltPageFor(pathname: string): MeltPage {
  return MELT_PAGES.find((page) => page.href === pathname.replace(/\/$/, "")) ?? MELT_PAGES[0]
}
