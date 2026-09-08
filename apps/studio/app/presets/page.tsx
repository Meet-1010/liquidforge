"use client"

import Link from "next/link"
import { useState } from "react"
import { COLLECTIONS, PRESETS, presetName } from "liquidforge"
import { configFromPreset, shareUrl } from "liquidforge/codegen"
import type { ObjectSource } from "liquidforge"
import { LazyPreview } from "@/components/lazy-preview"
import { SiteNav } from "@/components/site-nav"

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

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-5">
        <header className="mb-10">
          <p className="label mb-3">01 — Collections</p>
          <h1 className="display text-[clamp(2.2rem,6vw,3.6rem)]">
            Five families, nine colourways each.
          </h1>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-bone-dim">
            A colourway is data — a palette and about twenty numbers. Every card below is a
            running scene, not a screenshot; move the cursor across one. Click a card to open it
            in the Studio.
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

        {COLLECTIONS.map((collection) => (
          <section key={collection.name} className="mb-16">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3">
              <h2 className="font-mono text-[13px] tracking-tight text-bone">
                {collection.name}
              </h2>
              <p className="font-mono text-[11px] text-muted">{collection.blurb}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {collection.colourways.map((colourway, index) => {
                const id = `${collection.name.toLowerCase()}-${index + 1}`
                const preset = PRESETS[id]
                if (!preset) return null
                const href = shareUrl(configFromPreset(id, object), "/studio") ?? "/studio"

                return (
                  <Link
                    key={id}
                    href={href}
                    className="group overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink-2 transition-colors hover:border-rule-bright"
                  >
                    <div className="overflow-hidden rounded-[var(--radius-md)] m-1.5">
                      <LazyPreview preset={preset} object={object} height={190} />
                    </div>
                    <div className="flex items-baseline justify-between px-3 pt-1 pb-3">
                      <span className="font-mono text-[11px] text-bone/75">{preset.label}</span>
                      <span className="font-mono text-[10px] text-muted">
                        {presetName(id)}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </main>
    </>
  )
}
