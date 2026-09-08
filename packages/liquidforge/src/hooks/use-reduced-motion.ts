"use client"

import { useEffect, useState } from "react"

/**
 * Tracks `prefers-reduced-motion: reduce`.
 *
 * A surface that ripples, drifts and swirls under the cursor is exactly the
 * kind of thing that triggers vestibular discomfort, and this component is
 * meant to be dropped into other people's landing pages. Honouring the OS
 * setting is on by default and the brief calls it non-negotiable; the object
 * still renders, it just holds still.
 */
export function useReducedMotion(enabled = true): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.matchMedia) return
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [enabled])

  return enabled && reduced
}
