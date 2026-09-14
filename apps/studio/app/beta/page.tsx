"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { SiteNav } from "@/components/site-nav"
import { EXPERIMENTS, SECTIONS, enterBeta, hasEnteredBeta, leaveBeta, type BetaSection } from "@/lib/beta"

/**
 * The door to the beta, and the room behind it.
 *
 * The finished product is the Studio, the gallery and the library. This is
 * where the ideas that are not finished yet can be tried anyway — each one a
 * real, working experiment, each one honest on its own page about what is
 * still rough.
 */
export default function BetaPage() {
  const [entered, setEntered] = useState<boolean | null>(null)
  useEffect(() => setEntered(hasEnteredBeta()), [])

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-5">
        <header className="mb-10 max-w-3xl">
          <p className="label mb-3">Beta</p>
          <h1 className="display text-[clamp(2.4rem,7vw,4rem)]">The unfinished ideas, working.</h1>
          <p className="mt-4 text-[14px] leading-relaxed text-bone-dim">
            Turn your face into liquid chrome. Draw something and watch it become metal. Put your logo on a stream,
            your song on a loop, your name on every profile. These are experiments: real, free, and rough at the edges —
            each one says where.
          </p>
          {entered === false && (
            <button
              type="button"
              onClick={() => {
                enterBeta()
                setEntered(true)
              }}
              className="mt-6 rounded-[var(--radius-pill)] bg-bone px-5 py-2.5 font-mono text-[12px] text-ink transition-colors hover:bg-bone-dim"
            >
              Enter the beta
            </button>
          )}
          {entered && (
            <p className="mt-5 font-mono text-[11px] text-bone/40">
              You&apos;re in.{" "}
              <button
                type="button"
                onClick={() => {
                  leaveBeta()
                  setEntered(false)
                }}
                className="underline underline-offset-2 hover:text-bone"
              >
                Leave the beta
              </button>
            </p>
          )}
        </header>

        {entered &&
          (Object.keys(SECTIONS) as BetaSection[]).map((section) => {
            const items = EXPERIMENTS.filter((entry) => entry.section === section)
            if (items.length === 0) return null
            return (
              <section key={section} className="mb-12">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3">
                  <h2 className="font-mono text-[13px] text-bone">{SECTIONS[section].title}</h2>
                  <p className="font-mono text-[11px] text-muted">{SECTIONS[section].blurb}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((entry) => (
                    <Link
                      key={entry.slug}
                      href={`/beta/${entry.slug}`}
                      className="group flex flex-col rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4 transition-colors hover:border-rule-bright"
                    >
                      <h3 className="font-mono text-[13px] text-bone">{entry.title}</h3>
                      <p className="mt-2 flex-1 text-[13px] leading-relaxed text-bone/60">{entry.pitch}</p>
                      <span className="mt-4 font-mono text-[10px] text-bone/35 transition-colors group-hover:text-bone">Try it →</span>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
      </main>
    </>
  )
}
