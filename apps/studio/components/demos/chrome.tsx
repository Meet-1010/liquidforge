"use client"

import Link from "next/link"
import type { ReactNode } from "react"

/**
 * Furniture shared by the demo sites.
 *
 * These are meant to read as somebody's actual website, so the chrome is
 * deliberately unremarkable: a nav, a footer, real-looking copy. The liquid
 * element has to earn its place against a plausible page, because that is the
 * only test that means anything — anything looks good floating alone on black.
 */

export function DemoBar({ title, uses }: { title: string; uses: string }) {
  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/70 px-4 py-2.5 backdrop-blur-md">
      <div className="flex items-baseline gap-3">
        <Link href="/showcase" className="font-mono text-[11px] text-white/50 hover:text-white">
          ← Showcase
        </Link>
        <span className="font-mono text-[11px] text-white/80">{title}</span>
      </div>
      <span className="font-mono text-[10px] text-white/35">{uses}</span>
    </div>
  )
}

export function DemoNav({
  brand,
  links,
  cta,
  ink = "#fff",
  mark,
}: {
  brand: string
  links: string[]
  cta?: string
  ink?: string
  mark?: ReactNode
}) {
  return (
    <nav
      className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10"
      style={{ color: ink }}
    >
      <div className="flex items-center gap-2.5">
        {mark}
        <span className="font-mono text-[14px] tracking-tight">{brand}</span>
      </div>
      <div className="hidden items-center gap-7 font-mono text-[12px] opacity-60 sm:flex">
        {links.map((link) => (
          <span key={link}>{link}</span>
        ))}
      </div>
      {cta && (
        <span
          className="rounded-full px-4 py-2 font-mono text-[11px]"
          style={{ background: ink, color: "#000" }}
        >
          {cta}
        </span>
      )}
    </nav>
  )
}

export function DemoFooter({ brand, ink = "#fff" }: { brand: string; ink?: string }) {
  return (
    <footer
      className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-8 font-mono text-[11px] sm:px-10"
      style={{ color: ink, borderColor: "rgba(127,127,127,0.2)" }}
    >
      <span className="opacity-50">© {brand}</span>
      <div className="flex gap-5 opacity-50">
        <span>Privacy</span>
        <span>Terms</span>
        <span>Contact</span>
      </div>
    </footer>
  )
}
