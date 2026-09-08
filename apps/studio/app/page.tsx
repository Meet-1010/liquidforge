"use client"

import Link from "next/link"
import { useState } from "react"
import { LiquidCanvas, LiquidHero, PRESETS } from "liquidforge"
import type { ObjectSource } from "liquidforge"
import { SiteNav } from "@/components/site-nav"
import { CopyButton } from "@/components/ui"

const INSTALL = "npm install liquidforge three"

const USAGE = `import { LiquidHero } from "liquidforge"

<LiquidHero object={{ type: "text", value: "SHIP IT" }} preset="mercury-3" />`

const OBJECTS: Array<{ label: string; note: string; object: ObjectSource; preset: string }> = [
  { label: "text", note: "any font the page can render", object: { type: "text", value: "Aa", depth: 0.5 }, preset: "mercury-2" },
  { label: "shape", note: "six primitives, no assets", object: { type: "shape", shape: "torusknot", detail: 128 }, preset: "aurora-3" },
  { label: "svg", note: "your logo, extruded", object: { type: "shape", shape: "icosahedron" }, preset: "prism-9" },
  { label: "image", note: "traced to a silhouette", object: { type: "shape", shape: "capsule", detail: 128 }, preset: "magma-3" },
]

export default function Home() {
  const [hero, setHero] = useState("mercury-1")

  return (
    <>
      {/* The nav is a sibling of the hero rather than a child of it: a fixed or
          transformed header above the blend content would create a stacking
          context and flatten the effect. */}
      {/* An abstract object, not the wordmark forged twice. The headline is
          already type; putting more type behind it leaves the blend fighting
          itself, and a knot gives the horizon line far more to wrap around. */}
      <LiquidHero
        object={{ type: "shape", shape: "torusknot", detail: 200 }}
        preset={PRESETS[hero]}
        motion={{ autoRotate: 0.1, tilt: [0.3, 0] }}
        height="100svh"
        blend
      >
        <h1 className="display m-0 text-[clamp(3rem,13vw,10rem)]">liquidforge</h1>
        <p className="mt-4 font-mono text-[12px] tracking-[0.24em] uppercase">
          Liquid hero sections, one component
        </p>
      </LiquidHero>

      <div className="pointer-events-none relative -mt-20 flex justify-center pb-8">
        <div className="pointer-events-auto flex gap-1.5 rounded-[var(--radius-pill)] border border-rule bg-ink/70 p-1.5 backdrop-blur-sm">
          {["mercury-1", "aurora-1", "prism-2", "magma-3", "pearl-4"].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setHero(id)}
              aria-label={PRESETS[id].label}
              title={PRESETS[id].label}
              className={`flex h-7 w-12 overflow-hidden rounded-[var(--radius-pill)] border transition-colors ${
                hero === id ? "border-bone" : "border-transparent hover:border-rule-bright"
              }`}
            >
              {PRESETS[id].palette.map((colour, i) => (
                <span key={i} style={{ flex: 1, background: colour }} />
              ))}
            </button>
          ))}
        </div>
      </div>

      <SiteNav />

      <main className="mx-auto max-w-5xl px-4 sm:px-5">
        {/* -- the problem ------------------------------------------------ */}
        <section className="border-b border-rule py-16">
          <p className="label mb-4">01 — Why</p>
          <h2 className="display max-w-3xl text-[clamp(1.8rem,4.5vw,3rem)]">
            Liquid chrome heroes are everywhere and almost nobody ships one.
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="font-mono text-[12px] text-bone">They&apos;re repos you fork.</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
                Every one of them says <em>now replace model.glb with your own</em>. That step is
                where it dies, because most people do not have a .glb and getting one means
                Blender, a marketplace, or a licence they did not read. Liquidforge forges the
                object in your browser from a word, a logo, a PNG or a primitive.
              </p>
            </div>
            <div>
              <h3 className="font-mono text-[12px] text-bone">The shader is buried.</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
                Getting a displaced surface to actually read as liquid needs one specific thing —
                rebuilding the normals from the displaced surface — that almost no tutorial
                mentions. People copy the code, see a flat gradient blob, and give up. Here the
                material system is the product, not an implementation detail.
              </p>
            </div>
          </div>
        </section>

        {/* -- install ---------------------------------------------------- */}
        <section className="border-b border-rule py-16">
          <p className="label mb-4">02 — Install</p>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-rule bg-ink-2 px-4 py-3">
              <code className="font-mono text-[12px] text-bone/80">{INSTALL}</code>
              <CopyButton text={INSTALL} variant="ghost" />
            </div>
            <div className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-rule bg-ink-2 px-4 py-3">
              <pre className="overflow-x-auto font-mono text-[12px] leading-relaxed text-bone/80">
                {USAGE}
              </pre>
              <CopyButton text={USAGE} variant="ghost" />
            </div>
            <p className="font-mono text-[11px] text-muted">
              Two peer dependencies: react and three. No react-three-fiber, no postprocessing
              stack, no HDRI downloads — the environment is computed in the shader.
            </p>
          </div>
        </section>

        {/* -- objects ---------------------------------------------------- */}
        <section className="border-b border-rule py-16">
          <p className="label mb-4">03 — Objects</p>
          <h2 className="display max-w-2xl text-[clamp(1.8rem,4.5vw,3rem)]">
            Anything can be the liquid.
          </h2>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-bone-dim">
            Text, an SVG, a raster logo, a parametric shape, or a .glb you already have. All five
            arrive at the same place — one mesh, tessellated and welded, ready to be displaced.
            Don&apos;t have a model?{" "}
            <Link href="/assets" className="text-bone underline underline-offset-4">
              Search 46,900 open ones
            </Link>{" "}
            and send it straight to the Studio.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {OBJECTS.map((entry) => (
              <div
                key={entry.label}
                className="overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink-2"
              >
                <div className="m-1.5 overflow-hidden rounded-[var(--radius-md)]">
                  <LiquidCanvas
                    object={entry.object}
                    preset={PRESETS[entry.preset]}
                    quality="low"
                    style={{ height: 170, minHeight: 0 }}
                  />
                </div>
                <div className="px-3 pt-1 pb-3">
                  <p className="font-mono text-[11px] text-bone/75">{entry.label}</p>
                  <p className="font-mono text-[10px] text-muted">{entry.note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* -- collections ------------------------------------------------ */}
        <section className="border-b border-rule py-16">
          <p className="label mb-4">04 — Material</p>
          <h2 className="display max-w-2xl text-[clamp(1.8rem,4.5vw,3rem)]">
            Ten families. Ninety colourways.
          </h2>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-bone-dim">
            Chrome, oil slick, glass, molten, matte pearl, lacquer, velvet, holographic foil,
            translucent stone and plasma filaments. Each family is a different technique rather
            than a different palette, and each is a palette plus about twenty numbers — data you
            can edit, not code you have to fork.
          </p>
          <Link
            href="/presets"
            className="mt-6 inline-flex rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim"
          >
            See all 90
          </Link>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 py-10 font-mono text-[11px] text-muted">
          <span>MIT · Meet Chauhan</span>
          <div className="flex gap-4">
            <Link href="/studio" className="hover:text-bone">
              Studio
            </Link>
            <Link href="/presets" className="hover:text-bone">
              Presets
            </Link>
            <a
              href="https://github.com/Meet-1010/liquidforge"
              className="hover:text-bone"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </footer>
      </main>
    </>
  )
}
