"use client"

import { useEffect, type CSSProperties } from "react"

/**
 * The loading state.
 *
 * A word on its own reads as a stall. What this shows instead is a ripple
 * crossing a still surface — the same gesture the object itself makes — so the
 * wait looks like the thing being waited for rather than like a spinner
 * borrowed from somewhere else.
 *
 * Keyframes are injected once, on first use, because the rest of the library
 * styles inline and a consumer should not have to import a stylesheet to get a
 * loading state that works.
 */

const STYLE_ID = "liquidforge-loading-keyframes"

const KEYFRAMES = `
@keyframes liquidforge-swell {
  0%   { transform: scaleX(0.2) translateX(-160%); opacity: 0; }
  35%  { opacity: 1; }
  100% { transform: scaleX(1) translateX(160%); opacity: 0; }
}
@keyframes liquidforge-breathe {
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 0.75; }
}
@media (prefers-reduced-motion: reduce) {
  [data-liquidforge-wave], [data-liquidforge-label] { animation: none !important; }
  [data-liquidforge-wave] { opacity: 0.5 !important; transform: none !important; }
}
`

function useKeyframes(): void {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return
    const style = document.createElement("style")
    style.id = STYLE_ID
    style.textContent = KEYFRAMES
    document.head.appendChild(style)
  }, [])
}

export interface LoadingProps {
  /** Tune the contrast for a light-background preset. */
  light?: boolean
  /** What is happening. Kept to one lowercase word in the house style. */
  label?: string
}

export function LiquidLoading({ light = false, label = "forging" }: LoadingProps) {
  useKeyframes()

  const ink = light ? "0,0,0" : "255,255,255"

  const wrap: CSSProperties = {
    display: "grid",
    gap: 10,
    justifyItems: "center",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  }

  const track: CSSProperties = {
    position: "relative",
    width: 96,
    height: 1,
    overflow: "hidden",
    background: `rgba(${ink},0.14)`,
  }

  const wave: CSSProperties = {
    position: "absolute",
    inset: 0,
    // A soft crest rather than a hard block: this is a swell passing under the
    // surface, not a progress bar filling up.
    background: `linear-gradient(90deg, transparent, rgba(${ink},0.85), transparent)`,
    animation: "liquidforge-swell 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite",
    transformOrigin: "center",
  }

  return (
    <div style={wrap} role="status" aria-live="polite">
      <div style={track}>
        <span style={wave} data-liquidforge-wave aria-hidden />
      </div>
      <span
        data-liquidforge-label
        style={{
          fontSize: 10,
          letterSpacing: "0.24em",
          textTransform: "uppercase",
          color: `rgba(${ink},0.55)`,
          animation: "liquidforge-breathe 2.4s ease-in-out infinite",
        }}
      >
        {label}
      </span>
    </div>
  )
}
