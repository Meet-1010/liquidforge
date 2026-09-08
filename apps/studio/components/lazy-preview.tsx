"use client"

import { useEffect, useRef, useState } from "react"
import { LiquidCanvas, LiquidLoading, sharedPreviewRenderer } from "liquidforge"
import type { LiquidPreset, ObjectSource, Quality } from "liquidforge"

/**
 * A gallery card.
 *
 * Three states, and the middle one is the point.
 *
 * Until the card is near the viewport it is empty. Once it is, a **still of the
 * real object in the real material** is painted into a plain 2D canvas — every
 * one of the ninety cards drawn by a single shared WebGL context, because 2D
 * contexts are not rationed and WebGL ones very much are. Nothing on this page
 * is a colour swatch standing in for a render.
 *
 * Pointing at a card hands it a live context of its own: it starts rippling,
 * takes the cursor, and can be grabbed and turned. Moving away gives the
 * context back and leaves the still behind, so at most one or two are ever
 * live no matter how far you scroll.
 *
 * That split is also why ninety live previews would not have worked even with the
 * context problem solved — ninety simultaneous liquid surfaces is many times a
 * full screen of a very expensive fragment shader, and none of them would hold
 * their frame rate.
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
  const stillRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(false)
  const [captured, setCaptured] = useState(false)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof IntersectionObserver === "undefined") {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setNear(true)
      },
      { rootMargin: "300px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // The still is painted once and kept. Re-capturing on every scroll would
  // queue 45 renders behind one another for no visible gain.
  useEffect(() => {
    if (!near || captured) return
    const target = stillRef.current
    const element = containerRef.current
    if (!target || !element) return

    let cancelled = false
    const width = element.clientWidth || 320
    void sharedPreviewRenderer()
      .capture({ object, preset, width, height, target })
      .then((ok) => {
        if (!cancelled && ok) setCaptured(true)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, captured, height, preset.id, JSON.stringify(object)])

  const light = preset.background === "light"

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: "relative", height, background: light ? "#f2f0ec" : "#050506" }}
      onPointerEnter={() => setLive(true)}
      onPointerLeave={() => setLive(false)}
      // Keyboard users get the live version too; without this the card is
      // interactive only for people using a pointer.
      onFocus={() => setLive(true)}
      onBlur={() => setLive(false)}
      tabIndex={0}
    >
      <canvas
        ref={stillRef}
        aria-hidden
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          opacity: captured && !live ? 1 : captured ? 0 : 0,
          transition: "opacity 200ms ease",
        }}
      />

      {live && (
        <div style={{ position: "absolute", inset: 0 }}>
          <LiquidCanvas
            object={object}
            preset={preset}
            quality={quality}
            motion={{ draggable: true, autoRotate: 0.18, tilt: [0.22, 0] }}
            style={{ minHeight: 0, height: "100%" }}
            fallback={<span />}
          />
        </div>
      )}

      {/* Only once the card has actually asked for a still. A card far below
          the fold has not started, and animating "forging" at it is a lie. */}
      {near && !captured && !live && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
          }}
        >
          <LiquidLoading light={light} />
        </div>
      )}
    </div>
  )
}
