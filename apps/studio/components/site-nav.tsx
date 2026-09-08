"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/presets", label: "Presets" },
  { href: "/community", label: "Community" },
  { href: "/studio", label: "Studio" },
]

export function SiteNav() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-rule bg-ink px-4 py-3.5 sm:gap-4 sm:px-5">
      <Link href="/" className="group flex items-baseline gap-1.5">
        <span className="font-mono text-[13px] tracking-tight text-bone">liquidforge</span>
        <span className="font-mono text-[13px] text-muted transition-colors group-hover:text-bone">
          ◐
        </span>
      </Link>

      <div className="flex min-w-0 items-center gap-1 sm:gap-4">
        {LINKS.map((link) => {
          const active = pathname === link.href
          if (link.href === "/studio") {
            return (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 rounded-[var(--radius-pill)] bg-bone px-3 py-1.5 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim sm:px-4"
              >
                {link.label}
              </Link>
            )
          }
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 rounded-[var(--radius-pill)] px-2 py-1.5 font-mono text-[11px] transition-colors sm:px-3 ${
                active ? "bg-ink-3 text-bone" : "text-muted hover:bg-ink-2 hover:text-bone"
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
