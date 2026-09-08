"use client"

import { useEffect, useRef, useState } from "react"
import { LiquidCanvas } from "liquidforge"
import type { LiquidPreset, ObjectSource, Quality } from "liquidforge"

/**
 * A gallery card's live surface.
 *
 * Two limits stack here. Each canvas holds a WebGL context and browsers cap
 * those at roughly 16 before they start silently dropping the oldest — a
 * gallery of 45 cards would blank whatever you scrolled past. And each context
 * is running a per-pixel advection loop, so 16 of them at once would crawl even
 * if the browser allowed it.
 *
 * So: mount only what is near the viewport, unmount the rest, and hold a hard
 * ceiling on how many can be live at any moment. Cards that cannot get a slot
 * show their palette instead, which is honest and costs nothing.
 */
const MAX_LIVE_CONTEXTS = 10
let liveContexts = 0
const waiting = new Set<() => void>()

function acquireSlot(): boolean {
  if (liveContexts >= MAX_LIVE_CONTEXTS) return false
  liveContexts++
  return true
}

function releaseSlot() {
  liveContexts = Math.max(0, liveContexts - 1)
  // Wake one waiter; it will re-check and take the slot if it is still visible.
  const next = waiting.values().next().value
  if (next) {
    waiting.delete(next)
    next()
  }
}

export function LazyPreview({
  preset,
  object,
  height = 220,
  quality = "low",
  className,
}: {
  preset: LiquidPreset
  object: ObjectSource
  height?: number
  quality?: Quality
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0]?.isIntersecting ?? false),
      { rootMargin: "160px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return

    let held = false
    const attempt = () => {
      if (acquireSlot()) {
        held = true
        setLive(true)
      } else {
        waiting.add(attempt)
      }
    }
    attempt()

    return () => {
      waiting.delete(attempt)
      setLive(false)
      if (held) releaseSlot()
    }
  }, [visible])

  const light = preset.background === "light"

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height, background: light ? "#f2f0ec" : "#050506" }}
    >
      {live ? (
        <LiquidCanvas
          object={object}
          preset={preset}
          quality={quality}
          style={{ minHeight: 0, height: "100%" }}
        />
      ) : (
        <PaletteStrip palette={preset.palette} />
      )}
    </div>
  )
}

/** What a card shows before it gets a WebGL slot. */
function PaletteStrip({ palette }: { palette: string[] }) {
  return (
    <div style={{ display: "flex", height: "100%", width: "100%" }} aria-hidden>
      {palette.map((colour, index) => (
        <div key={`${colour}-${index}`} style={{ flex: 1, background: colour, opacity: 0.55 }} />
      ))}
    </div>
  )
}
