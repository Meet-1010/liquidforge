"use client"

import { useEffect, useRef, useState } from "react"
import { LiquidCanvas } from "liquidforge"
import type { LiquidPreset, ObjectSource, Quality } from "liquidforge"
import { webglContexts } from "@/lib/context-pool"

/**
 * A gallery card's live surface.
 *
 * Every card is a real 3D object you can grab and turn, not a picture of one —
 * which is the whole reason to render a gallery this way rather than shipping
 * screenshots. Cards near the viewport mount, the rest unmount, and
 * `webglContexts` holds the ceiling so a long scroll cannot outrun the
 * browser's context limit.
 */
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
      // Tight, because a slot given to a card that is not on screen is a
      // slot taken from one that is.
      { rootMargin: "60px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const release = webglContexts.request(() => setLive(true))
    return () => {
      release()
      setLive(false)
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
          // Drag to turn it, and a slow idle spin so it reads as an object
          // rather than as a picture before anyone touches it.
          motion={{ draggable: true, autoRotate: 0.18, tilt: [0.22, 0] }}
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
