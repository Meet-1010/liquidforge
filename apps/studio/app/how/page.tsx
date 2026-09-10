"use client"

import { useState } from "react"
import Link from "next/link"
import { LiquidCanvas, PRESETS } from "liquidforge"
import type { DiagnosticOptions, ObjectSource } from "liquidforge"
import { SiteNav } from "@/components/site-nav"

/**
 * The four things, shown breaking.
 *
 * All of this is written down in comments nobody reads and in a README section
 * people skim. Made into a switch it takes five seconds and it is genuinely
 * surprising — particularly the first one, where the geometry is visibly moving
 * and the surface is visibly flat at the same time.
 */

interface Lesson {
  key: keyof DiagnosticOptions
  title: string
  onLabel: string
  offLabel: string
  body: string
  offBody: string
  object: ObjectSource
  preset: string
  /**
   * Overrides that make the failure legible without instructions.
   *
   * At preset amplitudes the idle drift is small enough that some of these need
   * a cursor before the difference shows, and a demo you have to be told how to
   * read is a worse demo.
   */
  surface?: Record<string, number>
}

const LESSONS: Lesson[] = [
  {
    key: "rebuildNormals",
    title: "Rebuild the normals",
    onLabel: "Normals rebuilt",
    offLabel: "Normals left alone",
    body: "The height field displaces the vertices, and the shading normal is rebuilt from the result — a tangent frame from the mesh's own normal, sampled at two offsets, tilted by the gradient.",
    offBody:
      "Turn it off and the vertices still move exactly as much. The lighting simply never finds out, so the relief is invisible. This is the one that costs people an afternoon in the fragment shader, which is the wrong file.",
    object: { type: "shape", shape: "sphere", detail: 200 },
    preset: "mercury-1",
    // A large idle drift, so the relief is obvious before anyone touches it —
    // and its absence is just as obvious.
    surface: { noise: 0.14 },
  },
  {
    key: "weldSeams",
    title: "Displace along a welded direction",
    onLabel: "Welded",
    offLabel: "Each vertex its own way",
    body: "At a hard edge one position carries two different normals. Displacement follows a direction averaged across everything at that position, so both halves of the seam move together.",
    offBody:
      "Let each vertex follow its own normal and the seam pulls apart. On a letter it opens a crack down every edge where the face meets the side wall.",
    object: { type: "text", value: "Ag", depth: 0.55 },
    preset: "mercury-3",
    // Enough displacement that an unwelded seam visibly comes apart.
    surface: { noise: 0.1 },
  },
  {
    key: "rayCast",
    title: "Find the cursor by ray cast",
    onLabel: "Ray cast",
    offLabel: "Flat projection",
    body: "The pointer is unprojected into the scene and intersected with the object, in its own space, so the dent lands under the cursor wherever the object has been turned.",
    offBody:
      "The flat version maps the pointer straight onto the disc. Dead centre it is right. Measured 154px out it gave 0.781 where the true answer is 0.67 — about 22px of error, and worse toward the rim. Drag toward the edge and watch the dent lag behind.",
    object: { type: "shape", shape: "sphere", detail: 200 },
    preset: "aurora-2",
  },
  {
    key: "trail",
    title: "Keep a trail, not a stir",
    onLabel: "Trail of points",
    offLabel: "One decaying source",
    body: "Every point the cursor passes through emits its own expanding ring on its own clock, so the wake outlives the gesture that made it.",
    offBody:
      "With a single source at the cursor, every ripple stops the instant you do. Move across it, then hold still, and compare.",
    object: { type: "shape", shape: "sphere", detail: 200 },
    preset: "prism-2",
  },
]

export default function HowPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-5">
        <header className="mb-10">
          <p className="label mb-3">01 — How it works</p>
          <h1 className="display text-[clamp(2.2rem,6vw,3.6rem)]">
            Four switches, four ways this goes wrong.
          </h1>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-bone-dim">
            Each of these is a thing the library does that most versions of this effect do not,
            and each one fails silently — no error, no warning, just a surface that looks subtly
            or completely wrong. Turn them off and see what they were buying.
          </p>
        </header>

        <div className="grid gap-12">
          {LESSONS.map((lesson, index) => (
            <LessonBlock key={lesson.key} lesson={lesson} index={index} />
          ))}
        </div>

        <section className="mt-16 border-t border-rule pt-8">
          <p className="max-w-2xl text-[13px] leading-relaxed text-bone-dim">
            All four are in{" "}
            <code className="rounded bg-ink-3 px-1.5 py-0.5 font-mono text-[12px] text-bone/80">
              packages/liquidforge/src
            </code>{" "}
            — the first two in the vertex shader, the third in the pointer probe, the fourth in
            the trail buffer. The component takes a{" "}
            <code className="rounded bg-ink-3 px-1.5 py-0.5 font-mono text-[12px] text-bone/80">
              diagnostic
            </code>{" "}
            prop if you want to break them in your own page.
          </p>
          <Link
            href="/studio"
            className="mt-6 inline-flex rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim"
          >
            Go and make one
          </Link>
        </section>
      </main>
    </>
  )
}

function LessonBlock({ lesson, index }: { lesson: Lesson; index: number }) {
  const [on, setOn] = useState(true)

  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_1.1fr] lg:items-center">
      <div className="order-2 lg:order-1">
        {/* The number is real here: these are four steps in one pipeline, in
            the order the surface goes through them. */}
        <p className="font-mono text-[11px] text-muted">
          {String(index + 1).padStart(2, "0")}
        </p>
        <h2 className="display mt-1 text-[clamp(1.4rem,3.2vw,2rem)]">{lesson.title}</h2>
        <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">
          {on ? lesson.body : lesson.offBody}
        </p>

        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => setOn((value) => !value)}
          className="mt-5 flex items-center gap-3 rounded-[var(--radius-pill)] border border-rule px-3 py-2 transition-colors hover:border-rule-bright"
        >
          <span
            className={`relative h-4 w-7 shrink-0 rounded-[var(--radius-pill)] transition-colors ${
              on ? "bg-bone" : "bg-rule-bright"
            }`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-[var(--radius-pill)] bg-ink transition-transform ${
                on ? "translate-x-3.5" : "translate-x-0.5"
              }`}
            />
          </span>
          <span className="font-mono text-[11px] text-bone/70">
            {on ? lesson.onLabel : lesson.offLabel}
          </span>
        </button>
      </div>

      <div className="order-1 overflow-hidden rounded-[var(--radius-lg)] border border-rule lg:order-2">
        <LiquidCanvas
          object={lesson.object}
          preset={PRESETS[lesson.preset]}
          quality="balanced"
          surface={lesson.surface}
          diagnostic={{ [lesson.key]: on } as DiagnosticOptions}
          style={{ height: 300, minHeight: 0 }}
        />
      </div>
    </section>
  )
}
