"use client"

import { useEffect, useState, type RefObject } from "react"

/**
 * True while `ref` intersects the viewport.
 *
 * A per-pixel advection loop that keeps running after the visitor has scrolled
 * past the hero burns battery for nothing, so the render loop is gated on this.
 */
export function useInView(ref: RefObject<HTMLElement | null>, enabled = true): boolean {
  const [inView, setInView] = useState(true)

  useEffect(() => {
    const element = ref.current
    if (!enabled || !element || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => setInView(entries[0]?.isIntersecting ?? true),
      { rootMargin: "120px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref, enabled])

  return inView
}
