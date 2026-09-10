"use client"

import { LiquidCanvas } from "liquidforge"
import type { Demo } from "./catalog"
import { DemoFooter, DemoNav } from "./chrome"

/**
 * The five sites.
 *
 * Each one is a page that would exist without us — a launch page, a release, a
 * product, a portfolio, a token — with the surface doing a job the page needed
 * doing anyway. That is the difference between a showcase and a sticker sheet.
 */

const canvas = (demo: Demo, extra: Record<string, unknown> = {}) => ({
  object: demo.object,
  preset: demo.preset,
  ...extra,
})

/* ========================================================================== */
/* 1. Aurora Labs — developer platform                                        */
/* ========================================================================== */

const FEATURES = [
  { title: "Edge routing", body: "Requests land in the region they came from, without a config file." },
  { title: "Instant rollback", body: "Every deploy is addressable. Going back is a click, not a pipeline." },
  { title: "Real logs", body: "Structured, searchable, and kept long enough to be useful." },
]

export function AuroraLabs({ demo }: { demo: Demo }) {
  return (
    <div className="bg-[#050506] text-white">
      {/* The surface is the page's ground rather than a picture on it, so the
          nav and the headline sit in it. That is the arrangement this kind of
          launch page keeps reaching for and paying an illustrator for. */}
      <section className="relative min-h-[92vh] overflow-hidden">
        <div className="absolute inset-0">
          <LiquidCanvas {...canvas(demo)} motion={{ autoRotate: 0.08, tilt: [0.3, 0] }} style={{ height: "100%", minHeight: 0 }} />
        </div>

        <div className="relative flex min-h-[92vh] flex-col">
          <DemoNav brand="aurora" links={["Product", "Docs", "Pricing", "Changelog"]} cta="Start free" />
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/45">
              v3 is out
            </p>
            <h1
              className="display m-0 mt-5 max-w-4xl text-[clamp(2.4rem,7.5vw,5.5rem)]"
              style={{ mixBlendMode: "difference", color: "#fff" }}
            >
              Ship to the edge without thinking about it
            </h1>
            <p className="mt-6 max-w-xl font-mono text-[13px] leading-relaxed text-white/55">
              Push a branch. It builds, it deploys, it routes. Roll it back from your phone if it
              was a mistake.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <span className="rounded-full bg-white px-5 py-2.5 font-mono text-[12px] text-black">
                Deploy something
              </span>
              <span className="rounded-full border border-white/25 px-5 py-2.5 font-mono text-[12px] text-white/80">
                Read the docs
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20 sm:px-10">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-3 opacity-30">
          {["northwind", "kettle", "meridian", "oxbow", "delta"].map((name) => (
            <span key={name} className="font-mono text-[13px]">
              {name}
            </span>
          ))}
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <article key={feature.title} className="rounded-2xl border border-white/10 p-5">
              {/* One card carries the material, the other two carry the words.
                  Three live surfaces here would be three contexts and a lot of
                  noise around copy nobody would then read. */}
              {index === 0 ? (
                <div className="mb-4 overflow-hidden rounded-xl">
                  <LiquidCanvas
                    {...canvas(demo)}
                    quality="low"
                    style={{ height: 120, minHeight: 0 }}
                  />
                </div>
              ) : (
                <div
                  className="mb-4 h-[120px] rounded-xl"
                  style={{ background: `linear-gradient(140deg, ${demo.accent}22, transparent)` }}
                  aria-hidden
                />
              )}
              <h3 className="m-0 font-mono text-[13px]">{feature.title}</h3>
              <p className="mt-2 font-mono text-[11px] leading-relaxed text-white/45">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20 sm:px-10">
        <div className="relative overflow-hidden rounded-3xl">
          <LiquidCanvas {...canvas(demo)} quality="low" style={{ height: 240, minHeight: 0 }} />
          <div className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center">
            <div style={{ mixBlendMode: "difference", color: "#fff" }}>
              <h2 className="display m-0 text-[clamp(1.5rem,4vw,2.6rem)]">Start in a browser tab</h2>
              <p className="mt-2 font-mono text-[12px] opacity-70">No card. No call.</p>
            </div>
          </div>
        </div>
      </section>

      <DemoFooter brand="Aurora Labs" />
    </div>
  )
}

/* ========================================================================== */
/* 2. VESSEL — album release                                                  */
/* ========================================================================== */

const TRACKS = [
  ["01", "Undertow", "3:48"],
  ["02", "Glass Harbour", "4:12"],
  ["03", "Vessel", "5:36"],
  ["04", "Low Tide", "3:02"],
  ["05", "Anchor", "6:19"],
]

export function Vessel({ demo }: { demo: Demo }) {
  return (
    <div className="bg-black text-white">
      <DemoNav brand="MERIDIAN SOUND" links={["Releases", "Tour", "Store"]} />

      <section className="grid items-center gap-10 px-6 pb-16 sm:px-10 lg:grid-cols-2">
        {/* The cover, and it is the actual artwork rather than a picture of it.
            Square, because that is the shape a record is. */}
        <div className="mx-auto w-full max-w-[520px]">
          <div className="aspect-square overflow-hidden rounded-lg">
            <LiquidCanvas
              {...canvas(demo)}
              motion={{ autoRotate: 0.05 }}
              style={{ height: "100%", minHeight: 0 }}
            />
          </div>
          <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
            Move the cursor across the cover
          </p>
        </div>

        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/40">
            LP · out now
          </p>
          <h1 className="display m-0 mt-4 text-[clamp(3rem,10vw,7rem)] leading-[0.85]">VESSEL</h1>
          <p className="mt-5 max-w-md font-mono text-[13px] leading-relaxed text-white/55">
            Recorded over one winter in a converted lifeboat station. Nine tracks, no overdubs.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {["Spotify", "Apple Music", "Bandcamp"].map((service) => (
              <span
                key={service}
                className="rounded-full border border-white/20 px-4 py-2 font-mono text-[11px] text-white/75"
              >
                {service}
              </span>
            ))}
          </div>

          <ol className="mt-9 border-t border-white/10">
            {TRACKS.map(([number, title, length]) => (
              <li
                key={number}
                className="flex items-center gap-4 border-b border-white/10 py-3 font-mono text-[12px]"
              >
                <span className="w-6 text-white/30">{number}</span>
                <span className="flex-1 text-white/85">{title}</span>
                <span className="text-white/30">{length}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <DemoFooter brand="Meridian Sound" />
    </div>
  )
}

/* ========================================================================== */
/* 3. FORM 01 — product drop                                                  */
/* ========================================================================== */

const SWATCHES = ["obsidian-1", "obsidian-2", "obsidian-4", "obsidian-6", "obsidian-8"]

export function Form01({
  demo,
  swatch,
  onSwatch,
}: {
  demo: Demo
  swatch: string
  onSwatch: (id: string) => void
}) {
  return (
    <div className="bg-[#0b0c0f] text-white">
      <DemoNav brand="FORM" links={["Shop", "Objects", "About"]} cta="Cart (0)" />

      <section className="grid gap-8 px-6 pb-10 sm:px-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        {/* The stage. A product whose entire pitch is its finish should be
            turnable, not photographed once under one light. */}
        <div className="overflow-hidden rounded-3xl" style={{ background: "#272b35" }}>
          <LiquidCanvas
            {...canvas(demo)}
            motion={{ autoRotate: 0.06, tilt: [0.25, 0] }}
            style={{ height: 520, minHeight: 0 }}
          />
        </div>

        <div className="lg:pl-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/40">
            Drop 01 · limited
          </p>
          <h1 className="display m-0 mt-4 text-[clamp(2.2rem,6vw,3.8rem)]">The Lacquer Object</h1>
          <p className="mt-4 max-w-md font-mono text-[13px] leading-relaxed text-white/55">
            Hand-poured resin over a machined core. Nine coats, cut back between each. Every one
            takes eleven days and no two finish the same.
          </p>

          <div className="mt-8">
            <p className="font-mono text-[11px] text-white/45">Finish</p>
            {/* The swatches are the real colourways, and picking one changes the
                object rather than a photo of it. */}
            <div className="mt-3 flex gap-2">
              {SWATCHES.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSwatch(id)}
                  aria-label={id}
                  className={`h-9 w-9 overflow-hidden rounded-full border transition-transform ${
                    swatch === id ? "scale-110 border-white" : "border-white/20 hover:border-white/50"
                  }`}
                >
                  <span className="flex h-full w-full">
                    {(demo.preset.palette ?? []).slice(0, 3).map((_, i) => (
                      <span
                        key={i}
                        style={{ flex: 1, background: (PRESET_SWATCH[id] ?? [])[i] ?? "#333" }}
                      />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-9 flex items-center gap-4">
            <span className="font-mono text-[22px]">£340</span>
            <span className="rounded-full bg-white px-6 py-3 font-mono text-[12px] text-black">
              Add to bag
            </span>
          </div>
          <p className="mt-3 font-mono text-[11px] text-white/35">Ships in 3 weeks · 40 made</p>
        </div>
      </section>

      <DemoFooter brand="FORM" />
    </div>
  )
}

/** Palettes for the swatch dots, so they read before the object reloads. */
const PRESET_SWATCH: Record<string, string[]> = {
  "obsidian-1": ["#1b1e26", "#0b0d12", "#343a49"],
  "obsidian-2": ["#6e1020", "#3a0812", "#9c2338"],
  "obsidian-4": ["#12357e", "#08204f", "#2456b8"],
  "obsidian-6": ["#8a2a08", "#4d1704", "#c14410"],
  "obsidian-8": ["#0b4f52", "#063134", "#10787c"],
}

/* ========================================================================== */
/* 4. Studio Meridian — design studio                                         */
/* ========================================================================== */

const WORK = [
  { client: "Northwind", year: "2026", kind: "Identity" },
  { client: "Kettle & Sons", year: "2025", kind: "Packaging" },
  { client: "Oxbow", year: "2025", kind: "Web" },
  { client: "Delta Foods", year: "2024", kind: "Identity" },
]

export function Meridian({ demo }: { demo: Demo }) {
  return (
    <div className="bg-[#f2f0ec] text-[#111]">
      <DemoNav
        brand="Meridian"
        links={["Work", "Studio", "Contact"]}
        ink="#111"
        mark={
          /* The mark at 32px. If a colourway cannot survive this it is not an
             identity, and this is the size where most of them fail. */
          <span className="inline-flex h-8 w-8 overflow-hidden rounded-full">
            <LiquidCanvas {...canvas(demo)} transparent quality="low" style={{ height: 32, minHeight: 0 }} />
          </span>
        }
      />

      <section className="grid gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <h1 className="display m-0 text-[clamp(2.2rem,6vw,4.2rem)] leading-[1.02]">
            We make marks that hold up small.
          </h1>
          <p className="mt-6 max-w-lg font-mono text-[13px] leading-relaxed text-black/55">
            A four-person studio in Bristol. Identity, packaging, and the websites that go with
            them. We are usually booked a season out.
          </p>
        </div>

        {/* And the same mark at full size. One object, one palette, both ends
            of the range on one screen.

            Transparent, like the small one: a colourway that ships with a dark
            ground would otherwise punch a black disc into a cream page. */}
        <div className="mx-auto aspect-square w-full max-w-[380px] overflow-hidden rounded-full">
          <LiquidCanvas {...canvas(demo)} transparent style={{ height: "100%", minHeight: 0 }} />
        </div>
      </section>

      <section className="px-6 pb-16 sm:px-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-black/40">
          Selected work
        </p>
        <div className="mt-4 border-t border-black/10">
          {WORK.map((project) => (
            <div
              key={project.client}
              className="flex items-baseline gap-4 border-b border-black/10 py-4 font-mono text-[13px]"
            >
              <span className="flex-1">{project.client}</span>
              <span className="text-black/40">{project.kind}</span>
              <span className="w-12 text-right text-black/40">{project.year}</span>
            </div>
          ))}
        </div>
      </section>

      <DemoFooter brand="Studio Meridian" ink="#111" />
    </div>
  )
}

/* ========================================================================== */
/* 5. Ridge — fintech                                                         */
/* ========================================================================== */

const STATS = [
  ["£2.4bn", "settled last year"],
  ["0.2%", "flat, no tiers"],
  ["11", "currencies"],
]

export function Ridge({ demo }: { demo: Demo }) {
  return (
    <div className="bg-[#07080a] text-white">
      <DemoNav brand="Ridge" links={["Product", "Pricing", "Company"]} cta="Open an account" />

      <section className="grid items-center gap-8 px-6 pb-16 sm:px-10 lg:grid-cols-2">
        <div>
          <h1 className="display m-0 text-[clamp(2.2rem,6vw,4.2rem)] leading-[1.03]">
            Treasury that behaves like software
          </h1>
          <p className="mt-5 max-w-md font-mono text-[13px] leading-relaxed text-white/55">
            Hold, convert and move money in eleven currencies from one balance, with an API that
            was not an afterthought.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="rounded-full bg-white px-5 py-2.5 font-mono text-[12px] text-black">
              Open an account
            </span>
            <span className="rounded-full border border-white/25 px-5 py-2.5 font-mono text-[12px] text-white/80">
              Talk to us
            </span>
          </div>
        </div>

        {/* Every product in this category draws a coin, and a coin is a metal
            object under a light. Turning it is the point. */}
        <div className="mx-auto aspect-square w-full max-w-[440px]">
          <LiquidCanvas
            {...canvas(demo)}
            motion={{ autoRotate: 0.22, tilt: [0.4, 0] }}
            transparent
            style={{ height: "100%", minHeight: 0 }}
          />
        </div>
      </section>

      <section className="border-y border-white/10 px-6 py-10 sm:px-10">
        <div className="grid gap-8 sm:grid-cols-3">
          {STATS.map(([value, label]) => (
            <div key={label}>
              <p className="display m-0 text-[clamp(1.8rem,4vw,2.8rem)]">{value}</p>
              <p className="mt-1 font-mono text-[11px] text-white/45">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-16 sm:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="display m-0 text-[clamp(1.5rem,4vw,2.6rem)]">
            Built for finance teams who write code
          </h2>
          <p className="mt-4 font-mono text-[12px] leading-relaxed text-white/50">
            Webhooks that fire, an idempotent API, and a sandbox with real edge cases in it.
          </p>
        </div>
      </section>

      <DemoFooter brand="Ridge" />
    </div>
  )
}
