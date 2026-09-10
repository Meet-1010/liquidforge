"use client"

import { useEffect, useRef, useState } from "react"
import type { Cursor } from "@/lib/presence/hub"

/**
 * Other people's cursors.
 *
 * An arrow with the name on a pill tucked under its tail. The arrow is drawn
 * as four bezier curves rather than the usual straight-edged polygon: the
 * leading edge sweeps, the back edge bows, and the tail tapers to a rounded
 * point. That shape costs nothing extra to draw and it is the difference
 * between a cursor that looks like a system default and one that looks like it
 * belongs to this surface.
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
      <div className="flex items-start">
        <svg
          width="24"
          height="28"
          viewBox="0 0 24 28"
          fill="none"
          className="shrink-0 drop-shadow-[0_2px_5px_rgba(0,0,0,0.45)]"
        >
          {/*
            An ordinary seven-point arrow — straight edges, the shape everyone
            recognises — with every corner rounded off. The rounding is not in
            the path data: it is a round-joined stroke of the same colour as the
            fill, which fillets each corner by half the stroke width. Two
            reasons over hand-authored arcs: the radius is one number you can
            change, and the geometry stays legible as seven points instead of
            fourteen curve handles.

            The tip sits at (2.4, 1.6) so the reported position lands on the
            point rather than on the bounding box's corner.

            The dark layer underneath is the same path stroked wider — a halo,
            not an outline. The presence palette is seven mid-to-light saturated
            tones, so dark is the one halo that separates all of them from every
            background the Studio uses.
          */}
          {[
            { paint: "rgba(0,0,0,0.55)", width: 4.4 },
            { paint: cursor.colour, width: 2.6 },
          ].map((layer) => (
            <path
              key={layer.paint}
              d="M2.4 1.6
                 L2.4 19.6
                 L7.0 15.6
                 L10.1 22.9
                 L13.3 21.5
                 L10.2 14.4
                 L16.2 14.0 Z"
              fill={layer.paint}
              stroke={layer.paint}
              strokeWidth={layer.width}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </svg>
        <span
          className="-ml-1 mt-[18px] max-w-[12rem] truncate rounded-full px-2.5 py-[5px] font-mono text-[11px] leading-none shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
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
