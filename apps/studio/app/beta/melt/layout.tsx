"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import { backgroundColor, resolvePreset } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { MeltCanvas } from "@/components/melt-canvas"
import { MELT_PAGES, meltPageFor } from "@/lib/melt-site"

/**
 * The layout is what makes it a page transition: it stays mounted while the
 * routes inside it change, so the canvas in it is never torn down. Each click
 * is a real navigation — the address changes, back and forward work — and the
 * object melts into the next page's instead of being rebuilt.
 */
export default function MeltLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const page = meltPageFor(pathname)
  const [duration, setDuration] = useState(1.4)
  const looks = useMemo(() => MELT_PAGES.map(({ object, preset }) => ({ object, preset })), [])
  const look = useMemo(() => ({ object: page.object, preset: page.preset }), [page])
  // Painted from the canvas's own clock, every frame, so the page and the
  // canvas are always the same colour mid-melt rather than two fades that
  // merely start together.
  const surface = useRef<HTMLDivElement>(null)
  const [initialGround] = useState(() => backgroundColor(resolvePreset(page.preset)) ?? "#050506")
  const onGround = useCallback(({ background, dark }: { background: string; dark: boolean }) => {
    const element = surface.current
    if (!element) return
    element.style.background = background
    element.style.color = dark ? "#eceae5" : "#16161a"
  }, [])

  return (
    <BetaShell slug="melt" wide>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-rule shadow-2xl">
        <div className="flex items-center gap-3 border-b border-rule bg-ink-2 px-4 py-2.5">
          <span aria-hidden className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-bone/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-bone/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-bone/15" />
          </span>
          <span className="min-w-0 flex-1 truncate rounded-[var(--radius-pill)] bg-ink px-3 py-1 font-mono text-[11px] text-bone/50">
            northfold.studio{page.href.replace("/beta/melt", "") || "/"}
          </span>
        </div>

        <div ref={surface} className="relative" style={{ background: initialGround, color: "#eceae5" }}>
          <nav className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
            <span className="font-mono text-[12px] tracking-[0.2em] uppercase">Northfold</span>
            <div className="flex flex-wrap gap-1">
              {MELT_PAGES.map((entry) => (
                <Link
                  key={entry.href}
                  href={entry.href}
                  scroll={false}
                  className={`rounded-[var(--radius-pill)] px-3 py-1.5 font-mono text-[11px] transition-opacity ${
                    entry.href === page.href ? "opacity-100 underline underline-offset-4" : "opacity-55 hover:opacity-100"
                  }`}
                >
                  {entry.label}
                </Link>
              ))}
            </div>
          </nav>

          <div className="grid min-h-[30rem] items-center md:grid-cols-[1fr_1.1fr]">
            <div className="relative z-10 px-5 pb-8 sm:px-8 md:pb-16">{children}</div>
            <div className="relative h-[20rem] md:h-full md:min-h-[30rem]">
              <MeltCanvas looks={looks} look={look} duration={duration} onGround={onGround} style={{ position: "absolute", inset: 0, minHeight: 0 }} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="block w-60">
          <span className="mb-1 flex justify-between font-mono text-[10px] text-bone/50">
            Each melt takes <span className="tabular-nums">{duration.toFixed(1)}s</span>
          </span>
          <input type="range" min={0.6} max={3} step={0.1} value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
        </label>
        <p className="max-w-xl font-mono text-[10px] leading-relaxed text-bone/35">
          Click the links inside the site. Each is a real navigation — watch the address, try the back button — and the one canvas
          on the page survives it. Click again mid-melt and it carries on to the next page.
        </p>
      </div>
    </BetaShell>
  )
}
