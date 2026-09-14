"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

const LINKS = [
  { href: "/how", label: "How" },
  { href: "/presets", label: "Presets" },
  { href: "/showcase", label: "Showcase" },
  { href: "/place", label: "Place" },
  { href: "/assets", label: "Assets" },
  { href: "/live", label: "Live" },
  { href: "/community", label: "Community" },
  { href: "/mcp", label: "MCP" },
  { href: "/beta", label: "Beta" },
]

/**
 * The site's top bar.
 *
 * Nine links and the Studio fit on one line only from a laptop up. Below that
 * they used to scroll sideways, which hid most of the site behind a gesture
 * nobody knew to make on a phone; now the Studio stays one tap away and the
 * rest open as a menu with rows a thumb can hit.
 */
export function SiteNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)

  // A navigation closes the menu, and so does Escape.
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setOpen(false)
      menuButton.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav className="sticky top-0 z-30 border-b border-rule bg-ink">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 lg:py-3.5">
        <Link href="/" className="group -my-2 flex items-baseline gap-1.5 py-2">
          <span className="font-mono text-[13px] tracking-tight text-bone">liquidforge</span>
          <span className="font-mono text-[13px] text-muted transition-colors group-hover:text-bone">◐</span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex xl:gap-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={`rounded-[var(--radius-pill)] px-3 py-1.5 font-mono text-[11px] transition-colors ${
                isActive(link.href) ? "bg-ink-3 text-bone" : "text-muted hover:bg-ink-2 hover:text-bone"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/studio"
            className="rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim lg:py-1.5"
          >
            Studio
          </Link>
          <button
            ref={menuButton}
            type="button"
            aria-expanded={open}
            aria-controls="site-menu"
            onClick={() => setOpen((value) => !value)}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-pill)] border border-rule text-bone/80 transition-colors hover:border-rule-bright hover:text-bone lg:hidden"
          >
            <span className="sr-only">{open ? "Close menu" : "Menu"}</span>
            <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {open ? <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /> : <path d="M2.5 5h11M2.5 11h11" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div id="site-menu" className="border-t border-rule bg-ink px-2 pb-3 lg:hidden">
          <ul className="grid grid-cols-2 gap-1 pt-2 sm:grid-cols-3">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-[var(--radius-md)] px-3 font-mono text-[13px] transition-colors ${
                    isActive(link.href) ? "bg-ink-3 text-bone" : "text-bone/75 hover:bg-ink-2 hover:text-bone"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  )
}
