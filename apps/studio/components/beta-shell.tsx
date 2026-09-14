"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { SiteNav } from "@/components/site-nav"
import { EXPERIMENTS, enterBeta, hasEnteredBeta } from "@/lib/beta"

/**
 * The frame every beta experiment sits in: the door, if it has not been opened
 * in this browser; otherwise a header saying what the experiment is and,
 * honestly, what is still rough about it.
 */
export function BetaShell({ slug, children, wide = false }: { slug: string; children: ReactNode; wide?: boolean }) {
  const experiment = EXPERIMENTS.find((entry) => entry.slug === slug)
  const [entered, setEntered] = useState<boolean | null>(null)
  useEffect(() => setEntered(hasEnteredBeta()), [])

  return (
    <>
      <SiteNav />
      <main className={`mx-auto px-4 py-10 sm:px-5 ${wide ? "max-w-6xl" : "max-w-5xl"}`}>
        <div className="mb-8 flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <Link href="/beta" className="-my-2 inline-block py-2 pr-1 text-bone/45 transition-colors hover:text-bone">
            ← Beta
          </Link>
          <span className="text-bone/20">/</span>
          <span className="rounded-[var(--radius-pill)] border border-bone/40 px-2 py-0.5 text-[10px] tracking-[0.18em] text-bone/70 uppercase">
            Beta
          </span>
        </div>
        {experiment && (
          <header className="mb-8 max-w-3xl">
            <h1 className="display text-[clamp(2rem,5.5vw,3.2rem)]">{experiment.title}</h1>
            <p className="mt-3 text-[14px] leading-relaxed text-bone-dim">{experiment.pitch}</p>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-bone/35">Still rough: {experiment.rough}</p>
          </header>
        )}
        {entered === null ? null : entered ? (
          children
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-6">
            <p className="max-w-xl text-[14px] leading-relaxed text-bone/75">
              This is part of the Liquidforge beta — experiments that work but aren&apos;t finished. Entering is just a
              switch in this browser; nothing to sign up for.
            </p>
            <button
              type="button"
              onClick={() => {
                enterBeta()
                setEntered(true)
              }}
              className="mt-4 rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim"
            >
              Enter the beta
            </button>
          </div>
        )}
      </main>
    </>
  )
}
