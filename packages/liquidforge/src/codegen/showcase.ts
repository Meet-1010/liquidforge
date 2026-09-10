/**
 * Ways to put the thing on a page.
 *
 * A hero is the obvious one and it is not usually the useful one. Most people
 * arriving here already have a layout and want the surface *inside* it — as the
 * media on a card, as a band above the footer, as the mark next to a wordmark.
 * Each of these emits a self-contained component with inline styles and no
 * dependency beyond the library, so it pastes into any project regardless of
 * how that project does CSS.
 */

export type ShowcaseLayout =
  | "hero"
  | "split"
  | "card"
  | "grid"
  | "banner"
  | "badge"
  | "backdrop"
  | "canvas"

export interface ShowcaseMeta {
  id: ShowcaseLayout
  label: string
  blurb: string
  /** What the component is called in the emitted file. */
  componentName: string
  /** This layout only makes sense composited over the page behind it. */
  wantsTransparent?: boolean
  /** Worth saying out loud before someone pastes it. */
  caveat?: string
}

export const SHOWCASE_LAYOUTS: ShowcaseMeta[] = [
  {
    id: "hero",
    label: "Hero",
    blurb: "Full-bleed section with your headline over the surface.",
    componentName: "LiquidHeroSection",
  },
  {
    id: "split",
    label: "Split",
    blurb: "Copy on one side, the surface on the other.",
    componentName: "LiquidSplitSection",
  },
  {
    id: "card",
    label: "Card",
    blurb: "A product or feature card with the surface as its media.",
    componentName: "LiquidCard",
  },
  {
    id: "grid",
    label: "Card grid",
    blurb: "Three feature cards in a row.",
    componentName: "LiquidCardGrid",
    caveat:
      "Three canvases means three WebGL contexts. Browsers cap those around 16 for the whole tab, so keep an eye on how many of these end up on one page.",
  },
  {
    id: "banner",
    label: "Banner",
    blurb: "A wide strip — a call to action, or a divider with weight.",
    componentName: "LiquidBanner",
  },
  {
    id: "badge",
    label: "Badge",
    blurb: "A small round mark, for a logo lockup or an avatar.",
    componentName: "LiquidBadge",
    wantsTransparent: true,
  },
  {
    id: "backdrop",
    label: "Backdrop",
    blurb: "Fixed behind a whole page, with your content scrolling over it.",
    componentName: "LiquidBackdrop",
    caveat:
      "The backdrop is fixed and painted first, and the content is a positioned sibling after it — no z-index anywhere. Adding one, or a transform or a filter, on any wrapper will isolate the blend group and flatten `mix-blend-mode` text to white.",
  },
  {
    id: "canvas",
    label: "Bare canvas",
    blurb: "Just the surface. You do the layout.",
    componentName: "LiquidSurface",
  },
]

export interface RenderContext {
  /** The `<LiquidCanvas />` props, one per line, already indented. */
  props(indent: number): string
  importFrom: string
  /** Text colour that reads against whatever ground this config uses. */
  ink: string
  /** True when the config blends its content into the surface. */
  blend: boolean
}

const HERO_IMPORT = (from: string) => `import { LiquidHero } from "${from}"`
const CANVAS_IMPORT = (from: string) => `import { LiquidCanvas } from "${from}"`

export function renderShowcase(layout: ShowcaseLayout, ctx: RenderContext): string {
  switch (layout) {
    case "hero":
      return hero(ctx)
    case "split":
      return split(ctx)
    case "card":
      return card(ctx)
    case "grid":
      return grid(ctx)
    case "banner":
      return banner(ctx)
    case "badge":
      return badge(ctx)
    case "backdrop":
      return backdrop(ctx)
    default:
      return bare(ctx)
  }
}

function hero({ props, importFrom, ink, blend }: RenderContext): string {
  const blendNote = blend
    ? `      {/* mix-blend-mode: difference. No ancestor of this section may set a
          z-index, transform, filter or opacity below 1 — any of those isolates
          the blend group and the headline renders flat white. */}\n`
    : ""
  const colour = blend ? "" : `, color: "${ink}"`
  return `"use client"

${HERO_IMPORT(importFrom)}

export function LiquidHeroSection() {
  return (
    <LiquidHero
${props(6)}
    >
${blendNote}      <h1 style={{ fontSize: "clamp(2.5rem, 9vw, 7rem)", margin: 0, letterSpacing: "-0.03em"${colour} }}>
        Your headline goes here
      </h1>
    </LiquidHero>
  )
}
`
}

function split({ props, importFrom, ink }: RenderContext): string {
  return `"use client"

${HERO_IMPORT(importFrom)}

export function LiquidSplitSection() {
  return (
    <LiquidHero
      layout="split"
${props(6)}
    >
      <div style={{ maxWidth: 460, color: "${ink}" }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.5 }}>
          Now shipping
        </p>
        <h2 style={{ margin: "16px 0 0", fontSize: "clamp(1.8rem, 4vw, 3rem)", letterSpacing: "-0.02em", lineHeight: 1.05 }}>
          A headline with room to breathe
        </h2>
        <p style={{ margin: "16px 0 0", fontSize: 15, lineHeight: 1.6, opacity: 0.65 }}>
          One paragraph of supporting copy, then whatever you want people to do next.
        </p>
      </div>
    </LiquidHero>
  )
}
`
}

function card({ props, importFrom, ink }: RenderContext): string {
  return `"use client"

${CANVAS_IMPORT(importFrom)}

export function LiquidCard() {
  return (
    <article
      style={{
        maxWidth: 360,
        overflow: "hidden",
        borderRadius: 18,
        border: "1px solid rgba(127,127,127,0.18)",
        background: "transparent",
        color: "${ink}",
      }}
    >
      {/* The media well. Rounded a step tighter than the card, so the corners
          sit inside its own rather than fighting them. */}
      <div style={{ margin: 6, overflow: "hidden", borderRadius: 13 }}>
        <LiquidCanvas
${props(10)}
          style={{ height: 220, minHeight: 0 }}
        />
      </div>
      <div style={{ padding: "10px 16px 18px" }}>
        <h3 style={{ margin: 0, fontSize: 15, letterSpacing: "-0.01em" }}>Your product</h3>
        <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.6, opacity: 0.6 }}>
          One line about what it does.
        </p>
      </div>
    </article>
  )
}
`
}

function grid({ props, importFrom, ink }: RenderContext): string {
  return `"use client"

${CANVAS_IMPORT(importFrom)}

const ITEMS = [
  { title: "First", body: "One line about this one." },
  { title: "Second", body: "One line about this one." },
  { title: "Third", body: "One line about this one." },
]

export function LiquidCardGrid() {
  return (
    <section
      style={{
        display: "grid",
        gap: 16,
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        color: "${ink}",
      }}
    >
      {ITEMS.map((item) => (
        <article
          key={item.title}
          style={{
            overflow: "hidden",
            borderRadius: 18,
            border: "1px solid rgba(127,127,127,0.18)",
          }}
        >
          <div style={{ margin: 6, overflow: "hidden", borderRadius: 13 }}>
            {/* Each of these holds its own WebGL context. Browsers cap those at
                roughly 16 per tab, so a long page of them needs the visible
                ones mounted and the rest not. */}
            <LiquidCanvas
${props(14)}
              style={{ height: 180, minHeight: 0 }}
            />
          </div>
          <div style={{ padding: "10px 16px 18px" }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>{item.title}</h3>
            <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.6, opacity: 0.6 }}>
              {item.body}
            </p>
          </div>
        </article>
      ))}
    </section>
  )
}
`
}

function banner({ props, importFrom, blend }: RenderContext): string {
  const content = blend
    ? `        <div style={{ mixBlendMode: "difference", color: "#fff", textAlign: "center" }}>`
    : `        <div style={{ color: "#fff", textAlign: "center" }}>`
  return `"use client"

${CANVAS_IMPORT(importFrom)}

export function LiquidBanner() {
  return (
    <section style={{ position: "relative", overflow: "hidden", borderRadius: 24 }}>
      <LiquidCanvas
${props(8)}
        style={{ height: 260, minHeight: 0 }}
      />

      {/*
        Positioned, with no z-index. Two positioned siblings paint in DOM order,
        so the copy lands above the surface — and giving it a z-index instead
        would isolate the blend group and flatten the text to white.
      */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          padding: 24,
          pointerEvents: "none",
        }}
      >
${content}
          <h2 style={{ margin: 0, fontSize: "clamp(1.4rem, 3.5vw, 2.4rem)", letterSpacing: "-0.02em" }}>
            Ready when you are
          </h2>
          <p style={{ margin: "8px 0 0", fontSize: 14, opacity: 0.75 }}>
            A line of copy, then the button.
          </p>
        </div>
      </div>
    </section>
  )
}
`
}

function badge({ props, importFrom, ink }: RenderContext): string {
  return `"use client"

${CANVAS_IMPORT(importFrom)}

/** A small round mark — next to a wordmark, or standing in for an avatar. */
export function LiquidBadge({ size = 96 }: { size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        overflow: "hidden",
        borderRadius: "50%",
        verticalAlign: "middle",
      }}
    >
      <LiquidCanvas
${props(8)}
        style={{ height: size, minHeight: 0 }}
      />
    </span>
  )
}

export function LiquidLockup() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, color: "${ink}" }}>
      <LiquidBadge size={56} />
      <span style={{ fontSize: 20, letterSpacing: "-0.02em" }}>Your name</span>
    </div>
  )
}
`
}

function backdrop({ props, importFrom, ink, blend }: RenderContext): string {
  const headline = blend
    ? `        <h1 style={{ mixBlendMode: "difference", color: "#fff", fontSize: "clamp(2rem, 7vw, 5rem)", margin: 0 }}>`
    : `        <h1 style={{ color: "${ink}", fontSize: "clamp(2rem, 7vw, 5rem)", margin: 0 }}>`
  return `"use client"

${CANVAS_IMPORT(importFrom)}

/**
 * The surface behind everything, with the page scrolling over it.
 *
 * Order matters and z-index is deliberately absent: the fixed canvas is painted
 * first, the content is a positioned sibling after it, and positioned siblings
 * paint in DOM order. A z-index on either — or a transform, a filter, or an
 * opacity below 1 on any wrapper — isolates the blend group and flattens
 * blended text to white.
 */
export function LiquidBackdrop({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <div style={{ position: "fixed", inset: 0 }}>
        <LiquidCanvas
${props(10)}
          style={{ height: "100%", minHeight: 0 }}
        />
      </div>

      <main style={{ position: "relative", minHeight: "200vh", padding: "18vh 6vw" }}>
${headline}
          Scroll me
        </h1>
        {children}
      </main>
    </>
  )
}
`
}

function bare({ props, importFrom }: RenderContext): string {
  return `"use client"

${CANVAS_IMPORT(importFrom)}

export function LiquidSurface() {
  return (
    <LiquidCanvas
${props(6)}
    />
  )
}
`
}
