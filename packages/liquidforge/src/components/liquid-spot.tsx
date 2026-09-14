"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { LiquidCanvas, type LiquidCanvasProps } from "./liquid-canvas"
import type { LiquidEngine } from "../engine/liquid-engine"
import { applyCheckpointState, prepareSequence } from "../engine/drive"
import { useReducedMotion } from "../hooks/use-reduced-motion"
import { checkpointAt, pointAt, samplePath, type SampledPath } from "../placement/path"
import { resolveAnchors } from "../placement/anchors"
import { getOverride, getScrub, subscribePlacements } from "../placement/live-store"
import { warnIfPaintedBehindBackground } from "../placement/layer-check"
import { breakpointFor, DEFAULT_PLACEMENT, resolveBreakpoint, type Placement, type PlacementPath } from "../placement/types"
import type { LiquidPreset, ObjectSource } from "../types"

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
 * travelling a path as the page scrolls — and, at checkpoints along that path,
 * melting into a different object and a different look.
 *
 * ```tsx
 * import placements from "./liquidforge.placements.json"
 *
 * <LiquidSpot id="hero" placement={placements.hero} />
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
  onEngine,
  onReady,
  fallback,
  ...canvasProps
}: LiquidSpotProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<LiquidEngine | null>(null)
  const reducedMotion = useReducedMotion()

  /*
   * While an editor is open it owns this object's placement, so that dragging
   * shows up here on the same frame. With no editor these both return
   * undefined for the life of the page and we fall through to the props.
   */
  const override = useSyncExternalStore(subscribePlacements, () => getOverride(id), () => undefined)
  const scrub = useSyncExternalStore(subscribePlacements, () => getScrub(id), () => undefined)
  const raw = override ?? fromProps

  // -- breakpoint ------------------------------------------------------------
  // Tracked as a bucket, not a width, so resizing within one bucket does not
  // re-render anything — the frame is re-measured inside the paint loop anyway.
  const [bucket, setBucket] = useState<string | null>(() =>
    typeof window === "undefined" ? null : breakpointFor(window.innerWidth),
  )
  useEffect(() => {
    const onResize = () => setBucket(breakpointFor(window.innerWidth))
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  const placement = useMemo(
    () =>
      resolveBreakpoint(
        raw,
        bucket === "phone" ? 1 : bucket === "tablet" ? 800 : typeof window === "undefined" ? 1440 : 100_000,
      ),
    [raw, bucket],
  )

  const frame = placement.frame ?? "viewport"
  const path = placement.path
  const layer = placement.layer ?? 0

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || layer >= 0) return
    warnIfPaintedBehindBackground(hostRef.current, id)
  }, [layer, id])

  // -- anchors ---------------------------------------------------------------
  const [anchors, setAnchors] = useState(() => resolveAnchors(undefined))
  useEffect(() => {
    if (!path?.points.some((point) => point.anchor) || frame !== "viewport") {
      setAnchors(resolveAnchors(undefined))
      return
    }
    let queued = 0
    let lastKey = ""
    const measure = () => {
      queued = 0
      const next = resolveAnchors(path)
      // Only re-sample when a moment actually moved, not on every observer tick.
      const key = next.pinned.map((v) => (v === undefined ? "-" : v.toFixed(4))).join(",") +
        "|" + next.xs.map((v) => (v === undefined ? "-" : v.toFixed(4))).join(",")
      if (key === lastKey) return
      lastKey = key
      setAnchors(next)
    }
    const request = () => {
      if (!queued) queued = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener("resize", request)
    // Images decoding, fonts swapping, content streaming in: all of it moves the
    // elements the moments are pinned to.
    const observer = new ResizeObserver(request)
    observer.observe(document.documentElement)
    return () => {
      cancelAnimationFrame(queued)
      window.removeEventListener("resize", request)
      observer.disconnect()
    }
  }, [path, frame])

  const effectivePath: PlacementPath | undefined = useMemo(() => {
    if (!path) return undefined
    if (!anchors.xs.some((x) => x !== undefined)) return path
    return { ...path, points: path.points.map((point, i) => (anchors.xs[i] === undefined ? point : { ...point, x: anchors.xs[i]! })) }
  }, [path, anchors])

  const sampled: SampledPath | null = useMemo(
    () => (effectivePath && effectivePath.points.length > 0 ? samplePath(effectivePath, anchors.pinned) : null),
    [effectivePath, anchors],
  )

  // -- checkpoints -----------------------------------------------------------
  const baseObject: ObjectSource | undefined = placement.object ?? canvasProps.object
  const basePreset: string | undefined =
    placement.preset ?? (typeof canvasProps.preset === "string" ? canvasProps.preset : undefined)
  const hasCheckpoints = Boolean(path?.points.some((point) => point.object || point.preset))

  /*
   * Checkpoints never re-render anything.
   *
   * The canvas is given the placement's own object and look once. Every other
   * object on the route is forged in the background and handed to the engine as
   * a prepared form, and the paint loop moves between forms with `setLook` — a
   * morph, a bred colourway and, for the few frames where both are visible, a
   * crossfade of the two pictures. The object used to be swapped by re-rendering
   * the canvas with a new `object` prop at the peak of a melt, which rebuilt the
   * mesh, reframed the camera and recompiled the shader in a single frame: the
   * snap this replaces.
   */
  const baseKey = JSON.stringify(baseObject ?? null)
  const lastLook = useRef("")
  const [formsEpoch, setFormsEpoch] = useState(0)

  // An edit to the placement — a new base look, a redrawn route — makes the next
  // frame write its look again rather than trusting the last one.
  const pathKey = JSON.stringify(path?.points ?? null)
  useEffect(() => {
    lastLook.current = ""
  }, [basePreset, pathKey])

  const handleEngine = useCallback(
    (engine: LiquidEngine | null) => {
      engineRef.current = engine
      onEngine?.(engine)
    },
    [onEngine],
  )

  const handleReady = useCallback(
    (info: { animations: string[] }) => {
      // The primary shape was just rebuilt; forms aimed at the old one, and the
      // look written over it, are both stale.
      lastLook.current = ""
      setFormsEpoch((value) => value + 1)
      onReady?.(info)
    },
    [onReady],
  )

  // Forge every checkpoint's object and register it as a form, then build every
  // material and morph target the route will ask for.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !hasCheckpoints || !path || formsEpoch === 0) return
    let cancelled = false
    void prepareSequence(
      engine,
      { object: baseObject, preset: basePreset },
      path.points.filter((point) => point.object || point.preset),
      { isCancelled: () => cancelled || engineRef.current !== engine },
    ).then(() => {
      if (!cancelled) lastLook.current = ""
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formsEpoch, pathKey, hasCheckpoints, basePreset, baseKey])

  /*
   * Scroll position, the eased position chasing it, and the last thing written
   * to the engine — all in refs. Between checkpoints this component does not
   * render; every frame is a transform written to the node and a handful of
   * uniforms written to the material.
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
      if (sampled && effectivePath) {
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

        if (hasCheckpoints) {
          const state = checkpointAt(effectivePath, sampled, eased.current, { object: baseObject, preset: basePreset }, path?.morph)
          const engine = engineRef.current

          if (engine) {
            lastLook.current = applyCheckpointState(engine, state, { object: baseObject }, { reducedMotion, lastKey: lastLook.current })
          }
        }
      }

      const size = (spot.size ?? 0.34) * width
      const x = spot.x * width - size / 2
      const y = spot.y * height - size / 2
      const spin = spot.spin ?? 0
      // Turn and tilt are 3D, so they belong to the engine; spin stays a turn
      // of the canvas in the page's plane.
      engineRef.current?.setOrientation(((spot.tilt ?? 0) * Math.PI * 2), ((spot.turn ?? 0) * Math.PI * 2))

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, effectivePath, placement, sampled, reducedMotion, scrub, hasCheckpoints, basePreset, baseKey])

  // Scroll → target progress.
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
             beyond its id. At a checkpoint, the checkpoint's object wins. */
          object={baseObject ?? canvasProps.object}
          preset={basePreset ?? canvasProps.preset}
          transparent={transparent}
          onEngine={handleEngine}
          onReady={handleReady}
          fallback={fallback ?? <span />}
          style={{ width: "100%", height: "100%", minHeight: 0 }}
        />
      </div>
    </div>
  )
}
