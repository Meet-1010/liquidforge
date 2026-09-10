"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { COLLECTIONS, PRESETS, resolvePreset } from "liquidforge"
import { configFromPreset, decodeState, encodeState, generateCode, SHOWCASE_LAYOUTS } from "liquidforge/codegen"
import type { LiquidConfig, ShowcaseLayout } from "liquidforge/codegen"
import type { ObjectSource } from "liquidforge"
import { MOCKUPS } from "@/components/mockups"
import { DEMOS } from "@/components/demos/catalog"
import { SiteNav } from "@/components/site-nav"
import { CopyButton, Toggle } from "@/components/ui"

/**
 * See it somewhere other than a black square.
 *
 * A colourway is always judged full-bleed on a dark studio page, and that is
 * the one context most people will never use it in. The same surface behaves
 * differently at 150px in a pricing card, behind body copy, or as a 36px mark —
 * which is where a busy palette usually falls apart. These are four pretend
 * sites, running your actual config, with the code for each underneath.
 */

const OBJECTS: Array<{ id: string; label: string; source: ObjectSource }> = [
  { id: "sphere", label: "Sphere", source: { type: "shape", shape: "sphere", detail: 160 } },
  { id: "knot", label: "Knot", source: { type: "shape", shape: "torusknot", detail: 128 } },
  { id: "box", label: "Box", source: { type: "shape", shape: "rounded-box", detail: 128 } },
  { id: "text", label: "Text", source: { type: "text", value: "ACME", depth: 0.5 } },
]

export default function ShowcasePage() {
  return (
    <Suspense fallback={null}>
      <Showcase />
    </Suspense>
  )
}

function Showcase() {
  const params = useSearchParams()
  const [config, setConfig] = useState<LiquidConfig>(() =>
    configFromPreset("mercury-3", OBJECTS[0].source),
  )
  const [mockup, setMockup] = useState<string>("hero")
  const [blend, setBlend] = useState(true)

  // Arriving from the Studio's export, carrying the exact look.
  useEffect(() => {
    const encoded = params.get("c")
    if (!encoded) return
    const decoded = decodeState(encoded)
    if (decoded) {
      setConfig(decoded)
      setBlend(decoded.blend)
    }
  }, [params])

  const preset = useMemo(
    () =>
      resolvePreset(config.preset, {
        family: config.family,
        palette: config.palette,
        surface: config.surface,
        shading: config.shading,
        background: config.background,
      }),
    [config],
  )

  const active = MOCKUPS.find((entry) => entry.id === mockup) ?? MOCKUPS[0]
  const layout = (SHOWCASE_LAYOUTS.find((entry) => entry.id === active.id)?.id ??
    "hero") as ShowcaseLayout
  const meta = SHOWCASE_LAYOUTS.find((entry) => entry.id === layout)
  const code = generateCode({ ...config, blend }, { showcase: layout })

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-5">
        <header className="mb-8">
          <p className="label mb-3">01 — Showcase</p>
          <h1 className="display text-[clamp(2.2rem,6vw,3.6rem)]">
            See it somewhere other than a black square.
          </h1>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-bone-dim">
            Every colourway looks good full-bleed on a dark page, which is the one place most of
            them will never go. Below are five complete sites you can open and use, and under
            those a layout explorer for the eight placements the export ships.
          </p>
        </header>

        {/* -- the real sites ---------------------------------------------- */}
        <section className="mb-16">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3">
            <h2 className="font-mono text-[13px] tracking-tight text-bone">Five working sites</h2>
            <p className="font-mono text-[11px] text-muted">
              Full pages, not crops — open one and move the cursor
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {DEMOS.map((demo) => (
              <Link
                key={demo.slug}
                href={`/showcase/${demo.slug}`}
                className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4 transition-colors hover:border-rule-bright"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-[13px] text-bone">{demo.name}</span>
                  <span className="font-mono text-[10px] text-muted">{demo.kind}</span>
                </div>
                {/* Why it belongs there, which is the part that took the
                    thinking — anything looks good floating alone on black. */}
                <p className="font-mono text-[11px] leading-relaxed text-bone-dim">
                  {demo.rationale}
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                  <span className="font-mono text-[10px] text-muted">{demo.uses}</span>
                  <span className="flex h-5 w-16 overflow-hidden rounded-[var(--radius-pill)]" aria-hidden>
                    {demo.preset.palette.map((colour, i) => (
                      <span key={i} style={{ flex: 1, background: colour }} />
                    ))}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-bone/45 group-hover:text-bone">
                  Open the site →
                </span>
              </Link>
            ))}
          </div>
        </section>

        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3">
          <h2 className="font-mono text-[13px] tracking-tight text-bone">Layout explorer</h2>
          <p className="font-mono text-[11px] text-muted">Your config, in each placement, with the code</p>
        </div>

        {/* -- controls ---------------------------------------------------- */}
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label mr-1">Object</span>
            {OBJECTS.map((entry) => (
              <Chip
                key={entry.id}
                active={JSON.stringify(config.object) === JSON.stringify(entry.source)}
                onClick={() => setConfig({ ...config, object: entry.source })}
              >
                {entry.label}
              </Chip>
            ))}
          </div>

          <label className="flex items-center gap-2">
            <span className="label">Colourway</span>
            <select
              value={config.preset}
              onChange={(event) => {
                const next = PRESETS[event.target.value]
                if (next) setConfig(configFromPreset(next.id, config.object))
              }}
              className="rounded-[var(--radius-pill)] border border-rule bg-ink px-3 py-1.5 font-mono text-[11px] text-bone/80 outline-none focus:border-bone"
            >
              {COLLECTIONS.map((collection) => (
                <optgroup key={collection.name} label={collection.name}>
                  {collection.colourways.map((colourway, index) => {
                    const id = `${collection.name.toLowerCase()}-${index + 1}`
                    return (
                      <option key={id} value={id} className="bg-ink">
                        {collection.name} {index + 1} — {colourway.name}
                      </option>
                    )
                  })}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="w-40">
            <Toggle label="Blend the text" checked={blend} onChange={setBlend} />
          </div>
        </div>

        {/* -- which pretend site ------------------------------------------ */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {MOCKUPS.map((entry) => (
            <Chip key={entry.id} active={entry.id === active.id} onClick={() => setMockup(entry.id)}>
              {entry.label}
            </Chip>
          ))}
        </div>

        <active.Component object={config.object} preset={preset} blend={blend} />

        {meta?.caveat && (
          <p className="mt-4 max-w-3xl font-mono text-[11px] leading-relaxed text-bone/35">
            {meta.caveat}
          </p>
        )}

        {/* -- the code ----------------------------------------------------- */}
        <section className="mt-8 overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink-2">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3">
            <div>
              <p className="font-mono text-[11px] text-bone/70">{meta?.label}</p>
              <p className="font-mono text-[10px] text-muted">{meta?.blurb}</p>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton text={code} label="Copy the code" variant="primary" />
              <Link
                href={`/studio?c=${encodeState({ ...config, blend })}`}
                className="rounded-[var(--radius-pill)] border border-rule px-3.5 py-2 font-mono text-[11px] text-bone/70 transition-colors hover:border-rule-bright hover:text-bone"
              >
                Tune it
              </Link>
            </div>
          </header>
          <pre className="max-h-[420px] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-bone/75">
            {code}
          </pre>
        </section>

        <p className="mt-6 font-mono text-[11px] text-muted">
          Eight layouts ship in total — {SHOWCASE_LAYOUTS.map((entry) => entry.label).join(", ")}.
          All of them are in the Studio&apos;s export.
        </p>
      </main>
    </>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--radius-pill)] border px-3 py-1.5 font-mono text-[11px] transition-colors ${
        active
          ? "border-bone bg-bone text-ink"
          : "border-rule text-bone/50 hover:border-rule-bright hover:text-bone"
      }`}
    >
      {children}
    </button>
  )
}
