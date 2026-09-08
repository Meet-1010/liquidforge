"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { LiquidEngine } from "../engine/liquid-engine"
import { forgeGeometry, DEFAULT_OBJECT } from "../forge"
import { backgroundColor } from "../material/environment"
import { resolvePreset } from "../presets"
import { useInView } from "../hooks/use-in-view"
import { useReducedMotion } from "../hooks/use-reduced-motion"
import type {
  LiquidPreset,
  MaterialFamily,
  MotionOptions,
  ObjectSource,
  Quality,
  ShadingOptions,
  SurfaceOptions,
} from "../types"

function supportsWebGL(): boolean {
  if (typeof document === "undefined") return true
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"))
  } catch {
    return false
  }
}

export interface LiquidCanvasProps {
  /** What to render. Omit for a sphere. */
  object?: ObjectSource
  /** A colourway id (`"mercury-3"`) or a whole preset object. @default "mercury-1" */
  preset?: string | LiquidPreset
  /** Override the preset's shading family. */
  family?: MaterialFamily
  /** Override the preset's colours. 2–8 entries. */
  palette?: string[]
  /** Nudge individual surface numbers without restating the colourway. */
  surface?: Partial<SurfaceOptions>
  /** Nudge individual shading numbers without restating the colourway. */
  shading?: Partial<ShadingOptions>
  /** Pixel ratio, tessellation and trail length. @default "auto" */
  quality?: Quality
  motion?: MotionOptions
  /** Composite over the page instead of painting a background. @default false */
  transparent?: boolean
  /** Override the preset's background colour. */
  background?: string
  /** Stop rendering when scrolled out of view. @default true */
  pauseOffscreen?: boolean
  /** Shown while the object is being forged. */
  fallback?: ReactNode
  /** Shown if WebGL is unavailable or the object fails to build. */
  errorFallback?: ReactNode | ((error: Error) => ReactNode)
  onReady?: () => void
  onError?: (error: Error) => void
  className?: string
  style?: CSSProperties
}

/**
 * The liquid surface on its own. Fills its container.
 *
 * ```tsx
 * <LiquidCanvas object={{ type: "text", value: "SHIP IT" }} preset="mercury-3" />
 * ```
 *
 * Reach for `<LiquidHero />` instead when you want the section and the content
 * slot as well.
 */
export function LiquidCanvas({
  object = DEFAULT_OBJECT,
  preset = "mercury-1",
  family,
  palette,
  surface,
  shading,
  quality = "auto",
  motion,
  transparent = false,
  background,
  pauseOffscreen = true,
  fallback,
  errorFallback,
  onReady,
  onError,
  className,
  style,
}: LiquidCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<LiquidEngine | null>(null)

  const [epoch, setEpoch] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [webglOk, setWebglOk] = useState(true)

  const inView = useInView(containerRef, pauseOffscreen)
  const reducedMotion = useReducedMotion(motion?.respectReducedMotion ?? true)

  // Props written inline in JSX get a fresh identity every render, so these
  // compare by value instead. Cheap: a preset is a dozen numbers.
  const overrideKey = JSON.stringify({ family, palette, surface, shading })
  const resolved = useMemo(
    () => resolvePreset(preset, { family, palette, surface, shading }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typeof preset === "string" ? preset : JSON.stringify(preset), overrideKey],
  )

  const objectKey = JSON.stringify(object)

  useEffect(() => setWebglOk(supportsWebGL()), [])

  const handleError = useCallback(
    (nextError: Error) => {
      setError(nextError)
      onError?.(nextError)
    },
    [onError],
  )

  // -- the engine ------------------------------------------------------------
  // Owned by `quality`, because the tier decides the trail length and the
  // tessellation budget, both of which are baked into the material and the
  // prepared geometry rather than set as uniforms.
  useEffect(() => {
    const container = surfaceRef.current
    if (!container || !supportsWebGL()) return

    let engine: LiquidEngine
    try {
      engine = new LiquidEngine({
        container,
        preset: resolved,
        quality,
        motion,
        transparent,
        background,
        reducedMotion,
      })
    } catch (cause) {
      handleError(cause instanceof Error ? cause : new Error(String(cause)))
      return
    }

    engineRef.current = engine
    setEpoch((value) => value + 1)

    return () => {
      engineRef.current = null
      engine.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality])

  // -- the object ------------------------------------------------------------
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    let cancelled = false
    setReady(false)
    setError(null)

    forgeGeometry(object)
      .then((geometry) => {
        if (cancelled || engineRef.current !== engine) {
          geometry.dispose()
          return
        }
        // A sphere's bounding sphere *is* the sphere, so the probe can use the
        // exact analytic intersection instead of walking triangles.
        const forceSphereProbe =
          object.type === "shape" && (object.shape === "sphere" || object.shape === "icosahedron")

        engine.setGeometry(geometry, { forceSphereProbe })
        geometry.dispose()

        const container = containerRef.current
        if (container) {
          const rect = container.getBoundingClientRect()
          engine.resize(rect.width, rect.height)
        }

        setReady(true)
        onReady?.()
      })
      .catch((cause) => {
        if (cancelled) return
        handleError(cause instanceof Error ? cause : new Error(String(cause)))
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectKey, epoch])

  // -- live settings ---------------------------------------------------------
  useEffect(() => {
    engineRef.current?.setPreset(resolved)
  }, [resolved, epoch])

  useEffect(() => {
    engineRef.current?.setMotion(motion ?? {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(motion ?? {}), epoch])

  useEffect(() => {
    engineRef.current?.setTransparent(transparent, background)
  }, [transparent, background, epoch])

  useEffect(() => {
    engineRef.current?.setReducedMotion(reducedMotion)
  }, [reducedMotion, epoch])

  // -- viewport --------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const update = () => {
      const rect = container.getBoundingClientRect()
      engineRef.current?.resize(rect.width, rect.height)
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [epoch])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !ready) return
    if (inView && !reducedMotion) engine.start()
    else engine.stop()
  }, [inView, ready, reducedMotion, epoch])

  const pageBackground = transparent ? "transparent" : (background ?? backgroundColor(resolved) ?? "#050506")

  const containerStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 320,
    overflow: "hidden",
    background: pageBackground,
    touchAction: motion?.draggable ? "none" : undefined,
    ...style,
  }

  if (!webglOk || error) {
    const resolvedFallback =
      typeof errorFallback === "function"
        ? errorFallback(error ?? new Error("WebGL unavailable"))
        : errorFallback
    return (
      <div ref={containerRef} className={className} style={containerStyle} data-liquidforge="error">
        {resolvedFallback ?? <DefaultError message={error?.message} webgl={webglOk} />}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      data-liquidforge="canvas"
    >
      <div ref={surfaceRef} style={{ position: "absolute", inset: 0 }} />
      {!ready && (
        <div style={overlayStyle} data-liquidforge="loading">
          {fallback ?? <DefaultLoading light={resolved.background === "light"} />}
        </div>
      )}
    </div>
  )
}

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  pointerEvents: "none",
}

function DefaultLoading({ light }: { light: boolean }) {
  return (
    <span
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: light ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.35)",
      }}
    >
      forging
    </span>
  )
}

function DefaultError({ message, webgl }: { message?: string; webgl: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        height: "100%",
        padding: 24,
        textAlign: "center",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 12,
        lineHeight: 1.6,
        color: "rgba(255,255,255,0.55)",
      }}
    >
      <p style={{ margin: 0, maxWidth: 380 }}>
        {webgl
          ? (message ?? "Could not build this object.")
          : "This browser does not support WebGL, so the liquid surface can't render."}
      </p>
    </div>
  )
}
