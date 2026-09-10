"use client"

import { LiquidSpot } from "liquidforge"
import { LiquidEditor } from "liquidforge/editor"
import { SiteNav } from "@/components/site-nav"
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
 * The two imports below are the whole integration. Delete the `LiquidEditor`
 * line and the object stays exactly where you left it, because where you left
 * it is in the JSON, not in the editor.
 */
export default function PlacePage() {
  return (
    <>
      {/* The nav sits at z-30 and the object at 0, so the object passes behind
          it rather than over it — which is also the arrangement any real site
          would want. */}
      <SiteNav />

      <LiquidSpot
        id="drift"
        placement={(placements as PlacementFile).drift}
        object={{ type: "shape", shape: "torusknot", detail: 180 }}
        preset="mercury-3"
      />

      {/*
        The pattern to copy: the object sits at layer 0, above the page's
        background, and the content is lifted above it with a z-index of its
        own. That works whatever your background is, which "put the object at
        z-index -1" does not.
      */}
      <main className="relative z-10 mx-auto max-w-2xl px-6 py-24">
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

        <Aside>
          Press <Key>⌘</Key> <Key>⇧</Key> <Key>E</Key>, or the <Key>lf</Key> button in the corner. Drag the
          object where you want it. Switch to <em>Draw path</em> and drag out a route — that is where it
          travels as this page scrolls. <em>Size</em> sets how big it is at whichever point you have selected,
          so it can swell as it passes behind the text and shrink again on the way out.
        </Aside>

        <h2 className="mt-14 text-2xl font-semibold tracking-tight text-bone">What happens when you save</h2>
        <p className="mt-4 leading-relaxed text-bone/70">
          The editor sends the placement to a route that writes{" "}
          <code className="font-mono text-[13px] text-bone/90">liquidforge.placements.json</code> into this
          repository. That file is the only thing that persists, and it is checked in alongside your source.
          Reload and the object is where you put it, because the page reads the same file it just wrote.
        </p>

        <h2 className="mt-14 text-2xl font-semibold tracking-tight text-bone">Why it can be deleted</h2>
        <p className="mt-4 leading-relaxed text-bone/70">
          The editor holds no state of its own. It reads the placement, mutates a draft, and writes it back.
          So removing it is one deleted line — the object keeps its position, keeps its path, keeps its
          sizes, because none of that ever lived in the editor. Put the line back a month later and it opens
          on exactly what is on screen, since that is the only thing it has ever read.
        </p>
        <p className="mt-4 leading-relaxed text-bone/70">
          It is also the reason there is no <em>save your work</em> anxiety here, and no separate document to
          keep in sync. There is one file. It is in your repository. Your teammates review it in a pull
          request like anything else.
        </p>

        <h2 className="mt-14 text-2xl font-semibold tracking-tight text-bone">Scroll on</h2>
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

      {/*
        Development only, and genuinely so: the bundler folds the constant, the
        branch dies, and the editor module is tree-shaken out with it. Verified
        rather than assumed — a production build of this app contains none of
        the editor's strings anywhere in .next, static chunks included.
      */}
      {process.env.NODE_ENV !== "production" && (
        <LiquidEditor placements={placements as PlacementFile} />
      )}
    </>
  )
}

function Aside({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-8 rounded border border-rule bg-bone/[0.03] px-5 py-4 text-[15px] leading-relaxed text-bone/75">
      {children}
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-rule bg-bone/10 px-1.5 py-0.5 font-mono text-[12px] text-bone">
      {children}
    </kbd>
  )
}

const FILLER = [
  "A placement is about two hundred bytes of JSON: a handful of points, each a pair of fractions and sometimes a size. That smallness is not incidental — it is what makes the file reviewable, what makes it merge cleanly, and what makes it reasonable to keep one per page rather than one per project.",
  "Positions are stored as fractions of the frame rather than pixels, so a placement made on a wide monitor still means the same thing on a phone. Sizes are fractions of width specifically, because pages get taller and not wider; tying size to height would make every object shrink on a laptop.",
  "The lag control is the one parameter that is purely about feel. At one, the object is welded to the scrollbar and moves in perfect lockstep, which reads as mechanical. Lower it and the object chases its scroll position instead of occupying it, arriving a moment late and overshooting slightly — which is what makes it feel like an object rather than a value.",
  "None of this needs a scroll library. The position is a transform written straight to the node inside an animation frame, and the component above it never re-renders once it has mounted.",
]
