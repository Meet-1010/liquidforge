"use client"

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { LiquidCanvas, type LiquidCanvasProps } from "./liquid-canvas"
import { useReducedMotion } from "../hooks/use-reduced-motion"
import { pointAt, samplePath, type SampledPath } from "../placement/path"
import { getOverride, getScrub, subscribePlacements } from "../placement/live-store"
import { warnIfPaintedBehindBackground } from "../placement/layer-check"
import { DEFAULT_PLACEMENT, type Placement } from "../placement/types"

export interface LiquidSpotProps extends LiquidCanvasProps {
  /**
   * Names this object in the placement file. Two spots on a page need two ids,
   * and the id is what the editor writes back under.
   */
  id: string
  /** Where it goes. Read straight out of your placements JSON. */
  placement?: Placement
  className?: string
}

/**
 * A liquid object placed somewhere on your page.
 *
 * Unlike `LiquidHero`, this one owns no layout: it floats over whatever you
 * already built, at a position and size that came from the editor, optionally
 * travelling a path as the page scrolls.
 *
 * ```tsx
 * import placements from "./liquidforge.placements.json"
 *
 * <LiquidSpot id="hero" placement={placements.hero}
 *   object={{ type: "shape", shape: "torusknot" }} preset="mercury-3" />
 * ```
 *
 * The `placement` prop is the entire interface to the editor. Nothing here
 * imports the editor, knows whether one exists, or behaves differently when one
 * is open — which is what lets you delete it and keep this working.
 */
export function LiquidSpot({
  id,
  placement: fromProps = DEFAULT_PLACEMENT,
  className,
  // A spot exists to sit on top of a page you already have, so compositing over
  // it is the only sane default — unlike `LiquidHero`, which owns its own band
  // of the layout and can reasonably paint a ground.
  transparent = true,
  ...canvasProps
}: LiquidSpotProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()

  /*
   * While an editor is open it owns this object's placement, so that dragging
   * shows up here on the same frame. With no editor these both return
   * undefined for the life of the page and we fall through to the props.
   */
  const override = useSyncExternalStore(
    subscribePlacements,
    () => getOverride(id),
    () => undefined,
  )
  const scrub = useSyncExternalStore(
    subscribePlacements,
    () => getScrub(id),
    () => undefined,
  )
  const placement = override ?? fromProps

  const frame = placement.frame ?? "viewport"
  const path = placement.path
  const layer = placement.layer ?? 0

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || layer >= 0) return
    warnIfPaintedBehindBackground(hostRef.current, id)
  }, [layer, id])
  const sampled: SampledPath | null = useMemo(
    () => (path && path.points.length > 0 ? samplePath(path) : null),
    [path],
  )

  /*
   * Scroll position, the eased position chasing it, and whether anything has
   * been painted yet — all in refs. This component renders once and then never
   * again; every frame after that is a transform written directly to the node.
   */
  const target = useRef(0)
  const eased = useRef<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const box = boxRef.current
    if (!box) return

    const ease = reducedMotion ? 1 : (path?.ease ?? 0.12)

    const paint = () => {
      const host = frame === "viewport" ? null : hostRef.current
      const width = frame === "viewport" ? window.innerWidth : (host?.offsetWidth ?? 0)
      const height = frame === "viewport" ? window.innerHeight : (host?.offsetHeight ?? 0)
      if (width === 0 || height === 0) return

      let spot = placement.origin
      if (sampled) {
        if (scrub != null) {
          // The editor is holding the playhead. Follow it exactly — easing here
          // would make the scrubber feel broken rather than smooth.
          eased.current = scrub
        } else {
          if (eased.current == null) eased.current = target.current
          // Exponential ease toward the scroll position. With ease = 1 this
          // reduces to "sit exactly on it", which is what reduced motion asks for.
          eased.current += (target.current - eased.current) * ease
        }
        spot = pointAt(sampled, eased.current) ?? placement.origin
      }

      const size = (spot.size ?? 0.34) * width
      const x = spot.x * width - size / 2
      const y = spot.y * height - size / 2
      const spin = spot.spin ?? 0

      box.style.width = `${size}px`
      box.style.height = `${size}px`
      box.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)${
        spin ? ` rotate(${(spin * 360).toFixed(2)}deg)` : ""
      }`
    }

    let frameId = 0
    const loop = () => {
      frameId = requestAnimationFrame(loop)
      paint()
    }

    /*
     * A path needs a frame loop, because the easing is a per-frame decay toward
     * a moving target. A static placement does not: it only has to be repainted
     * when the frame it is measured against changes size.
     */
    if (sampled) {
      frameId = requestAnimationFrame(loop)
    } else {
      paint()
    }

    const onResize = () => paint()
    window.addEventListener("resize", onResize)
    const observer = new ResizeObserver(onResize)
    if (frame === "section" && hostRef.current) observer.observe(hostRef.current)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener("resize", onResize)
      observer.disconnect()
    }
  }, [frame, path, placement, sampled, reducedMotion, scrub])

  // Scroll → target progress. Inlined rather than using the hook so the whole
  // runtime path stays in one file you can read top to bottom.
  useEffect(() => {
    if (typeof window === "undefined" || !sampled) return

    const measure = () => {
      if (frame === "viewport") {
        const doc = document.documentElement
        const range = doc.scrollHeight - window.innerHeight
        target.current = range > 0 ? Math.max(0, Math.min(1, window.scrollY / range)) : 0
        return
      }
      const host = hostRef.current
      if (!host) return
      const box = host.getBoundingClientRect()
      const span = box.height + window.innerHeight
      target.current = span > 0 ? Math.max(0, Math.min(1, (window.innerHeight - box.top) / span)) : 0
    }

    measure()
    window.addEventListener("scroll", measure, { passive: true })
    window.addEventListener("resize", measure)
    const observer = new ResizeObserver(measure)
    observer.observe(document.documentElement)
    return () => {
      window.removeEventListener("scroll", measure)
      window.removeEventListener("resize", measure)
      observer.disconnect()
    }
  }, [frame, sampled])

  return (
    <div
      ref={hostRef}
      data-liquidforge-spot={id}
      className={className}
      style={{
        position: frame === "viewport" ? "fixed" : "absolute",
        inset: 0,
        zIndex: layer,
        pointerEvents: "none",
        overflow: "hidden",
      }}
      aria-hidden
    >
      <div
        ref={boxRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          willChange: "transform",
          pointerEvents: placement.interactive ? "auto" : "none",
        }}
      >
        <LiquidCanvas
          {...canvasProps}
          /* The file wins over the props: whatever the editor last saved is
             what renders, so a spot that has been placed needs no props here
             beyond its id. */
          object={placement.object ?? canvasProps.object}
          preset={placement.preset ?? canvasProps.preset}
          transparent={transparent}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  )
}
