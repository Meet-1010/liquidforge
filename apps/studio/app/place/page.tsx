"use client"

import { SiteNav } from "@/components/site-nav"
import { PlaceDemo } from "@/components/place-demo"
import placements from "@/liquidforge.placements.json"
import type { PlacementFile } from "liquidforge/placement"

/**
 * A page that exists to be edited.
 *
 * Every other demo in this Studio shows a finished thing. This one is a plain
 * article — the sort of page anyone actually has — with one liquid object
 * floating over it, so you can open the editor and put that object where you
 * want it against real text at a real measure. Which is the entire argument for
 * an in-place editor: you cannot judge a placement against a mock of the page,
 * only against the page.
 *
 * The editor runs here in production too, not only in development. It has to:
 * this is the page that teaches it, and a teaching page with the lesson
 * compiled out is a link that goes nowhere. `PlaceDemo` swaps the save for one
 * that writes to your browser and then shows you the file it would have
 * written.
 */
export default function PlacePage() {
  return (
    <>
      {/* The nav sits at z-30 and the object at 0, so the object passes behind
          it rather than over it — which is also the arrangement any real site
          would want. */}
      <SiteNav />

      <main className="relative z-10 mx-auto max-w-2xl px-6 pt-24 pb-16">
        <p className="font-mono text-[11px] tracking-[0.14em] text-bone/40 uppercase">
          Demonstration · in-place editing
        </p>
        <h1 className="mt-4 text-4xl leading-[1.08] font-semibold tracking-tight text-bone md:text-5xl">
          This page is ordinary on purpose.
        </h1>
        <p className="mt-6 text-lg leading-relaxed text-bone/70">
          There is an object drifting behind this column. It is not part of the layout, it is not in a hero,
          and nothing here was built around it. That is the point: it was placed on top of a page that
          already existed, which is how anyone would actually use this.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-bone/70">
          The editor is live on this page. Nothing to install, and nothing you do here can break anything —
          it saves to your own browser.
        </p>

        <Steps />

        <h2 className="mt-16 text-2xl font-semibold tracking-tight text-bone">Why it can be deleted</h2>
        <p className="mt-4 leading-relaxed text-bone/70">
          The editor holds no state of its own. It reads a placement, mutates a draft, and writes it back. So
          removing it from your project is one deleted line — the object keeps its position, keeps its path,
          keeps its sizes, because none of that ever lived in the editor. Put the line back a month later and
          it opens on exactly what is on screen, since that is the only thing it has ever read.
        </p>
        <p className="mt-4 leading-relaxed text-bone/70">
          You can watch that happen here. Save something, then reload the page. The editor starts closed and
          the object is still where you put it, because it was never the editor holding it there.
        </p>

        <h2 className="mt-16 text-2xl font-semibold tracking-tight text-bone">Scroll on</h2>
        <p className="mt-4 leading-relaxed text-bone/70">
          Keep going and watch the object take its route. The motion is driven by how far down this page you
          are, mapped to distance along the path rather than to the number of points in it — so it moves
          evenly even where the drawn line bunches up.
        </p>

        {FILLER.map((paragraph, index) => (
          <p key={index} className="mt-4 leading-relaxed text-bone/55">
            {paragraph}
          </p>
        ))}

        <p className="mt-16 font-mono text-[11px] tracking-[0.14em] text-bone/35 uppercase">
          End of the page · the object has finished its path
        </p>
      </main>

      <PlaceDemo initial={placements as PlacementFile} />
    </>
  )
}

/**
 * The four things to try, in the order they make sense.
 *
 * Numbered because this genuinely is a sequence — you cannot size a point on a
 * path you have not drawn yet — rather than because numbers look tidy.
 */
function Steps() {
  return (
    <ol className="mt-10 space-y-px overflow-hidden rounded border border-rule">
      {STEPS.map((step, index) => (
        <li key={step.title} className="grid grid-cols-[2.5rem_1fr] gap-3 bg-bone/[0.03] px-4 py-3.5">
          <span className="pt-0.5 font-mono text-[11px] text-bone/30 tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-bone">{step.title}</h3>
            <p className="mt-1 text-[14px] leading-relaxed text-bone/60">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

const STEPS = [
  {
    title: "Open it",
    body: "Press ⌘⇧E, or click the lf button in the bottom corner. The page stays exactly as it is — the editor is an overlay, not a different screen, because the whole point is judging the object against the real thing.",
  },
  {
    title: "Put it somewhere",
    body: "In Place, drag the object. Pick a shape and one of the ninety-nine colourways from the Element row while you are there — what it is and where it goes are the same decision, so they sit in the same bar.",
  },
  {
    title: "Draw where it goes as you scroll",
    body: "Switch to Path and drag out a route. That line is what the object follows as this page scrolls. Drag any handle to adjust it, alt-click a handle to delete one, and pull Scrub to preview the whole journey without scrolling the page under yourself.",
  },
  {
    title: "Size it along the way",
    body: "In Size, click a handle and set how big the object is at that point. It can swell as it passes behind the text and shrink again on the way out. Then press Save and look at the file at the bottom of this page — that JSON is everything.",
  },
]

const FILLER = [
  "A placement is about two hundred bytes of JSON: a handful of points, each a pair of fractions and sometimes a size. That smallness is not incidental — it is what makes the file reviewable, what makes it merge cleanly, and what makes it reasonable to keep one per page rather than one per project.",
  "Positions are stored as fractions of the frame rather than pixels, so a placement made on a wide monitor still means the same thing on a phone. Sizes are fractions of width specifically, because pages get taller and not wider; tying size to height would make every object shrink on a laptop.",
  "The lag control is the one parameter that is purely about feel. At one, the object is welded to the scrollbar and moves in perfect lockstep, which reads as mechanical. Lower it and the object chases its scroll position instead of occupying it, arriving a moment late and overshooting slightly — which is what makes it feel like an object rather than a value.",
  "None of this needs a scroll library. The position is a transform written straight to the node inside an animation frame, and the component above it never re-renders once it has mounted.",
]
