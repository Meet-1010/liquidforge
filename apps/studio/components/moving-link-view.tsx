"use client"

import Link from "next/link"
import { LiquidCanvas, type ObjectSource } from "liquidforge"

export function MovingLinkView({ title, object, preset }: { title: string; object: ObjectSource; preset: string }) {
  return (
    <main className="relative h-[100svh] overflow-hidden bg-ink">
      <LiquidCanvas object={object} preset={preset} style={{ position: "absolute", inset: 0, minHeight: 0 }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-8 text-center">
        <h1 className="display text-[clamp(1.8rem,5vw,3rem)] leading-none text-bone">{title}</h1>
        <p className="font-mono text-[11px] text-bone/45">Touch it — it&apos;s liquid.</p>
        <Link href="/beta/links" className="pointer-events-auto rounded-[var(--radius-pill)] border border-bone/30 px-4 py-2 font-mono text-[11px] text-bone/80 transition-colors hover:border-bone hover:text-bone">
          Make a moving link of your own
        </Link>
      </div>
    </main>
  )
}
