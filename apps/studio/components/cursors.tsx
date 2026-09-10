"use client"

import { useEffect, useRef, useState } from "react"
import type { Cursor } from "@/lib/presence/hub"

/**
 * Other people's cursors.
 *
 * An arrow with the name on a pill trailing its tip — the shape everyone has
 * settled on for this, and the one in the reference. The pill takes the
 * person's colour and the arrow matches, so a room of eight reads at a glance.
 *
 * Positions arrive on a 60ms tick, which is a sixth of the rate a screen
 * refreshes. Drawn straight they would visibly step, so each cursor eases
 * toward its last known position on its own animation frame — the same trick
 * the pointer smoothing in the engine uses, for the same reason.
 */
export function Cursors({ cursors, host }: { cursors: Cursor[]; host: React.RefObject<HTMLElement | null> }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {cursors.map((cursor) => (
        <RemoteCursor key={cursor.id} cursor={cursor} host={host} />
      ))}
    </div>
  )
}

function RemoteCursor({
  cursor,
  host,
}: {
  cursor: Cursor
  host: React.RefObject<HTMLElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const shown = useRef<{ x: number; y: number } | null>(null)
  const wanted = useRef(cursor)
  wanted.current = cursor

  useEffect(() => {
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const element = ref.current
      const box = host.current
      if (!element || !box) return

      const rect = box.getBoundingClientRect()
      const targetX = wanted.current.x * rect.width
      const targetY = wanted.current.y * rect.height

      if (!shown.current) shown.current = { x: targetX, y: targetY }
      // 0.22 is fast enough to feel attached to the person and slow enough to
      // hide the gap between ticks.
      shown.current.x += (targetX - shown.current.x) * 0.22
      shown.current.y += (targetY - shown.current.y) * 0.22

      element.style.transform = `translate3d(${shown.current.x}px, ${shown.current.y}px, 0)`
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [host])

  return (
    <div ref={ref} className="absolute top-0 left-0 will-change-transform">
      <div className="flex items-start gap-1">
        <svg width="20" height="22" viewBox="0 0 20 22" fill="none" className="shrink-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.45)]">
          {/* The arrow, drawn from its tip so the point sits exactly on the
              reported position rather than the bounding box's corner. */}
          <path
            d="M1 1L1 16.5L5.2 12.6L8.1 19.4L11.4 18L8.5 11.3L14.2 11L1 1Z"
            fill={cursor.colour}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        </svg>
        <span
          className="mt-3 max-w-[12rem] truncate rounded-full px-2.5 py-1 font-mono text-[11px] leading-none shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
          style={{ background: cursor.colour, color: readableOn(cursor.colour) }}
        >
          {cursor.name}
        </span>
      </div>
    </div>
  )
}

/** Black or white, whichever survives on that pill. */
function readableOn(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) return "#000"
  const n = Number.parseInt(match[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#0a0a0a" : "#ffffff"
}

/** A live count, for the corner of a shared surface. */
export function PresenceBadge({ count }: { count: number }) {
  const [pulse, setPulse] = useState(false)
  useEffect(() => {
    setPulse(true)
    const timer = setTimeout(() => setPulse(false), 600)
    return () => clearTimeout(timer)
  }, [count])

  return (
    <div className="pointer-events-none flex items-center gap-2 rounded-full border border-rule bg-ink/70 px-3 py-1.5 backdrop-blur-sm">
      <span
        className={`h-1.5 w-1.5 rounded-full bg-emerald-400 transition-transform ${
          pulse ? "scale-150" : "scale-100"
        }`}
      />
      <span className="font-mono text-[10px] text-bone/60">
        {count === 0 ? "you're the only one here" : `${count + 1} here`}
      </span>
    </div>
  )
}
