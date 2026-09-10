"use client"

import { LiquidCanvas } from "liquidforge"
import type { LiquidPreset, ObjectSource, Quality } from "liquidforge"

/**
 * Four pretend websites.
 *
 * The point is not the fake copy — it is that a colourway chosen against a
 * black studio page behaves differently as a 180px card thumbnail, as a band
 * above a footer, or as a 56px mark beside a wordmark. A surface that looks
 * expensive full-bleed can turn to mud at badge size, and the only way to know
 * is to see it there.
 *
 * Only one mockup is mounted at a time, so the WebGL context count stays near
 * what the mockup itself needs rather than four pages' worth.
 */

export interface MockupProps {
  object: ObjectSource
  preset: LiquidPreset
  transparent?: boolean
  background?: string
  blend?: boolean
}

const surface = (props: MockupProps, extra: { quality?: Quality } = {}) => ({
  object: props.object,
  preset: props.preset,
  transparent: props.transparent,
  background: props.background,
  quality: extra.quality ?? ("balanced" as Quality),
})

/* -- chrome shared by the fake pages --------------------------------------- */

function FakeNav({ ink = "#fff" }: { ink?: string }) {
  return (
    <nav
      className="flex items-center justify-between px-6 py-4"
      style={{ color: ink }}
      aria-hidden
    >
      <span className="font-mono text-[13px] tracking-tight">acme</span>
      <div className="flex items-center gap-5 font-mono text-[11px] opacity-55">
        <span>Product</span>
        <span>Pricing</span>
        <span>Docs</span>
        <span
          className="rounded-[var(--radius-pill)] px-3 py-1.5"
          style={{ background: ink, color: "#000" }}
        >
          Start
        </span>
      </div>
    </nav>
  )
}

/* -- 1. a SaaS landing page ------------------------------------------------ */

export function HeroMockup(props: MockupProps) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-lg)]">
      <div className="absolute inset-0">
        <LiquidCanvas {...surface(props, { quality: "balanced" })} style={{ height: "100%", minHeight: 0 }} />
      </div>

      {/* Positioned sibling, no z-index — the same rule the generated code
          follows, so what you see here is what you get. */}
      <div className="relative flex min-h-[440px] flex-col">
        <FakeNav />
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
          <h1
            className="display m-0 text-[clamp(2rem,6vw,4rem)]"
            style={props.blend ? { mixBlendMode: "difference", color: "#fff" } : { color: "#fff" }}
          >
            Ship the thing
          </h1>
          <p className="mt-3 max-w-md font-mono text-[12px] leading-relaxed text-white/60">
            One paragraph of supporting copy that explains what this actually is.
          </p>
        </div>
      </div>
    </div>
  )
}

/* -- 2. a pricing / feature grid ------------------------------------------- */

const CARDS = [
  { title: "Starter", body: "Everything you need to try it." },
  { title: "Team", body: "For a handful of people." },
  { title: "Scale", body: "When it stops being a side project." },
]

export function CardsMockup(props: MockupProps) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] bg-ink-2">
      <FakeNav />
      <div className="px-6 pb-8">
        <h2 className="display m-0 text-[clamp(1.4rem,3vw,2.2rem)] text-bone">Pick a plan</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {CARDS.map((card, index) => (
            <article
              key={card.title}
              className="overflow-hidden rounded-[var(--radius-md)] border border-rule"
            >
              <div className="m-1.5 overflow-hidden rounded-[var(--radius-sm)]">
                {/* Only the middle card runs live. Three at once is three
                    contexts for a mockup, and the point is the composition. */}
                {index === 1 ? (
                  <LiquidCanvas {...surface(props, { quality: "low" })} style={{ height: 150, minHeight: 0 }} />
                ) : (
                  <div
                    className="flex h-[150px] w-full"
                    aria-hidden
                    title="Live on the middle card only"
                  >
                    {props.preset.palette.map((colour, i) => (
                      <span key={i} style={{ flex: 1, background: colour, opacity: 0.5 }} />
                    ))}
                  </div>
                )}
              </div>
              <div className="px-3 pt-1 pb-3">
                <p className="font-mono text-[12px] text-bone/80">{card.title}</p>
                <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted">{card.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

/* -- 3. an article with a banner ------------------------------------------- */

export function BannerMockup(props: MockupProps) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] bg-ink-2">
      <FakeNav />
      <div className="px-6 pb-6">
        <p className="label mb-2">Engineering</p>
        <h2 className="display m-0 text-[clamp(1.4rem,3vw,2.2rem)] text-bone">
          How we rebuilt the renderer
        </h2>
        <div className="mt-4 space-y-2" aria-hidden>
          {[100, 96, 88, 92, 60].map((width, i) => (
            <div key={i} className="h-2 rounded-[var(--radius-pill)] bg-rule" style={{ width: `${width}%` }} />
          ))}
        </div>

        <section className="relative mt-6 overflow-hidden rounded-[var(--radius-md)]">
          <LiquidCanvas {...surface(props, { quality: "low" })} style={{ height: 180, minHeight: 0 }} />
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-4 text-center">
            <div style={props.blend ? { mixBlendMode: "difference", color: "#fff" } : { color: "#fff" }}>
              <p className="display m-0 text-[clamp(1.1rem,2.6vw,1.7rem)]">Ready when you are</p>
              <p className="mt-1 font-mono text-[11px] opacity-70">A line of copy, then the button.</p>
            </div>
          </div>
        </section>

        <div className="mt-4 space-y-2" aria-hidden>
          {[100, 90, 70].map((width, i) => (
            <div key={i} className="h-2 rounded-[var(--radius-pill)] bg-rule" style={{ width: `${width}%` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

/* -- 4. a profile / lockup -------------------------------------------------- */

export function BadgeMockup(props: MockupProps) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] bg-ink-2">
      <FakeNav />
      <div className="grid gap-6 px-6 pb-8 sm:grid-cols-[auto_1fr] sm:items-center">
        <span className="inline-flex h-[132px] w-[132px] overflow-hidden rounded-full">
          {/* Transparent, because a mark has to sit on whatever is behind it. */}
          <LiquidCanvas
            {...surface(props, { quality: "low" })}
            transparent
            style={{ height: 132, minHeight: 0 }}
          />
        </span>
        <div>
          <h2 className="display m-0 text-[clamp(1.3rem,3vw,2rem)] text-bone">Your name</h2>
          <p className="mt-1 font-mono text-[11px] text-muted">Building things on the internet</p>
          <div className="mt-4 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 overflow-hidden rounded-full">
              <LiquidCanvas
                {...surface(props, { quality: "low" })}
                transparent
                style={{ height: 36, minHeight: 0 }}
              />
            </span>
            <p className="font-mono text-[11px] text-bone/50">
              …and the same mark at 36px, which is where most of them fall apart.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export const MOCKUPS = [
  { id: "hero", label: "Landing page", Component: HeroMockup },
  { id: "card", label: "Pricing grid", Component: CardsMockup },
  { id: "banner", label: "Article + banner", Component: BannerMockup },
  { id: "badge", label: "Profile + mark", Component: BadgeMockup },
] as const
