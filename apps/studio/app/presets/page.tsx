"use client"

import Link from "next/link"
import { useRef, useState } from "react"
import { COLLECTIONS, PRESETS, presetName, type LiquidPreset } from "liquidforge"
import { configFromPreset, shareUrl } from "liquidforge/codegen"
import type { ObjectSource } from "liquidforge"
import { LazyPreview } from "@/components/lazy-preview"
import { SiteNav } from "@/components/site-nav"
import { SteerBar, useFlip, useSteer } from "@/components/steer"

/**
 * The collection gallery.
 *
 * Same object, rendered every way the library knows. Comparing colourways is
 * the only reason to look at this page, so nothing else about the cards is
 * allowed to vary — one object, one size, one framing, forty-five surfaces.
 */

const OBJECTS: Array<{ id: string; label: string; source: ObjectSource }> = [
  { id: "sphere", label: "Sphere", source: { type: "shape", shape: "sphere", detail: 128 } },
  { id: "knot", label: "Knot", source: { type: "shape", shape: "torusknot", detail: 96 } },
  { id: "box", label: "Box", source: { type: "shape", shape: "rounded-box", detail: 96 } },
  { id: "text", label: "Text", source: { type: "text", value: "LF", depth: 0.5 } },
]

export default function PresetsPage() {
  const [objectId, setObjectId] = useState("sphere")
  const object = OBJECTS.find((entry) => entry.id === objectId)?.source ?? OBJECTS[0].source
  const steering = useSteer()
  const grid = useRef<HTMLDivElement>(null)
  const all = COLLECTIONS.flatMap((collection) =>
    collection.colourways.map((_, index) => PRESETS[`${collection.name.toLowerCase()}-${index + 1}`]).filter(Boolean),
  ) as LiquidPreset[]
  const steered = steering.live.energy !== 0 || steering.live.warmth !== 0
  const ordered = steering.order(all, (preset) => preset)
  useFlip(grid, `${steered}|${ordered.map((preset) => preset.id).join(",")}`)
  const filter = steering.filter()

  /*
   * The card is not a link. Every preview is a real object you can grab and
   * turn, and a drag that ends on an anchor navigates away — so the surface
   * takes the gesture and the label row underneath carries the link.
   */
  const card = (preset: LiquidPreset) => {
    const look = steering.look(preset)
    const config = steering.active
      ? { ...configFromPreset(preset.id, object), palette: look.palette, surface: look.surface, shading: look.shading }
      : configFromPreset(preset.id, object)
    const href = shareUrl(config, "/studio") ?? "/studio"
    return (
      <div
        key={preset.id}
        data-flip={preset.id}
        className="group overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink-2 transition-colors hover:border-rule-bright"
      >
        <div className="m-1.5 overflow-hidden rounded-[var(--radius-md)]">
          <LazyPreview preset={look} object={object} height={190} filter={filter} />
        </div>
        <div className="flex items-baseline justify-between gap-2 px-3 pt-1 pb-3">
          <Link href={href} className="-my-2 inline-block py-2 font-mono text-[11px] text-bone/75 hover:text-bone">
            {preset.label}
            <span className="ml-1.5 text-muted group-hover:text-bone/60">{presetName(preset.id)}</span>
          </Link>
          <Link
            href={href}
            className="-my-2 shrink-0 py-2 pl-2 font-mono text-[10px] text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-bone [@media(pointer:coarse)]:opacity-100"
          >
            Open
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-5">
        <header className="mb-10">
          <p className="label mb-3">01 — Collections</p>
          <h1 className="display text-[clamp(2.2rem,6vw,3.6rem)]">
            Twelve families, nine colourways each.
          </h1>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-bone-dim">
            A colourway is data — a palette and about twenty numbers. Every card below is the
            real material on the real object, drawn by one shared context. Point at one and it
            comes alive: ripples, cursor, and hold-and-drag to turn it over.
          </p>
        </header>

        <div className="mb-10 flex flex-wrap items-center gap-2">
          <span className="label mr-1">Object</span>
          {OBJECTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setObjectId(entry.id)}
              className={`rounded-[var(--radius-pill)] border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                objectId === entry.id
                  ? "border-bone bg-bone text-ink"
                  : "border-rule text-bone/50 hover:border-rule-bright hover:text-bone"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <SteerBar state={steering.live} onChange={steering.setLive} count={all.length} />

        <div ref={grid}>
          {steered ? (
            // Steering flattens the collections into one grid, sorted by how far
            // each look already sits in the direction being dragged.
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{ordered.map(card)}</div>
          ) : (
            COLLECTIONS.map((collection) => (
              <section key={collection.name} className="mb-16">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3">
                  <h2 className="font-mono text-[13px] tracking-tight text-bone">{collection.name}</h2>
                  <p className="font-mono text-[11px] text-muted">{collection.blurb}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {collection.colourways.map((_, index) => {
                    const preset = PRESETS[`${collection.name.toLowerCase()}-${index + 1}`]
                    return preset ? card(preset) : null
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </main>
    </>
  )
}
