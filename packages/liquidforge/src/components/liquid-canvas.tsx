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
import { LiquidLoading } from "./loading"
import { forgeGeometry, DEFAULT_OBJECT } from "../forge"
import { backgroundColor } from "../material/environment"
import { resolvePreset } from "../presets"
import { useInView } from "../hooks/use-in-view"
import { useReducedMotion } from "../hooks/use-reduced-motion"
import type {
  ControlOptions,
  DiagnosticOptions,
  LiquidPreset,
  MaterialFamily,
  MotionOptions,
  ObjectSource,
  Quality,
  ShadingOptions,
  SurfaceOptions,
} from "../types"

/**
 * True when the source names something that does not exist yet.
 *
 * Picking "Model" in a panel sets `{ type: "model", src: "" }`, which is not a
 * failure — it is the state between choosing a kind and choosing a file.
 * Treating it as one is how the Studio's model tab ended up unusable.
 */
function isIncomplete(source: ObjectSource): boolean {
  switch (source.type) {
    case "model":
    case "image":
      return !source.src
    case "svg":
      return !source.src && !source.markup
    case "text":
      return source.value.trim().length === 0
    default:
      return false
  }
}

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
  /**
   * Viewport navigation — scroll or pinch to zoom, double click to reset.
   * Off by default: a hero that eats the page's scroll reads as broken.
   */
  controls?: ControlOptions
  /** Switches that break the effect on purpose. See `DiagnosticOptions`. */
  diagnostic?: DiagnosticOptions
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
  /** Fires when the object is on screen. `animations` is empty for static ones. */
  onReady?: (result: { animations: string[] }) => void
  /**
   * Hands out the engine as it comes and goes.
   *
   * For the few things that are verbs rather than props — recording a loop,
   * resetting the view, asking what animation clips a model turned out to have.
   * Called with `null` when the engine is torn down.
   */
  onEngine?: (engine: LiquidEngine | null) => void
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
  controls,
  diagnostic,
  transparent = false,
  background,
  pauseOffscreen = true,
  fallback,
  errorFallback,
  onReady,
  onEngine,
  onError,
  className,
  style,
}: LiquidCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<LiquidEngine | null>(null)

  const [epoch, setEpoch] = useState(0)
  const [generation, setGeneration] = useState(0)
  const [ready, setReady] = useState(false)
  const [incomplete, setIncomplete] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  /** Megabytes in, so a slow download looks like a slow download. */
  const [progress, setProgress] = useState<string | null>(null)
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
        controls,
        diagnostic,
        transparent,
        background,
        reducedMotion,
        onContextLost: (reason) => {
          // One rebuild. A browser at its context limit will keep taking them
          // away, and retrying forever would spin.
          if (generation < 1) setGeneration((value) => value + 1)
          else handleError(new Error(`liquidforge: ${reason}`))
        },
      })
    } catch (cause) {
      handleError(cause instanceof Error ? cause : new Error(String(cause)))
      return
    }

    engineRef.current = engine
    onEngine?.(engine)
    setEpoch((value) => value + 1)

    return () => {
      engineRef.current = null
      onEngine?.(null)
      engine.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quality, generation])

  // -- the object ------------------------------------------------------------
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    let cancelled = false
    setError(null)

    if (isIncomplete(object)) {
      engine.clearGeometry()
      setReady(false)
      setIncomplete(true)
      return
    }

    setReady(false)
    setIncomplete(false)
    setProgress(null)

    forgeGeometry(object, ({ loaded, total }) => {
      if (cancelled) return
      const mb = (bytes: number) => (bytes / 1_048_576).toFixed(1)
      setProgress(total > 0 ? `${mb(loaded)} / ${mb(total)} MB` : `${mb(loaded)} MB`)
    })
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

        setProgress(null)
        setReady(true)
        onReady?.({ animations: engine.animations })
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
    engineRef.current?.setControls(controls ?? {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(controls ?? {}), epoch])

  useEffect(() => {
    engineRef.current?.setDiagnostic(diagnostic ?? {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(diagnostic ?? {}), epoch])

  useEffect(() => {
    if (controls?.resetToken === undefined) return
    engineRef.current?.resetView()
  }, [controls?.resetToken, epoch])

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

  const pageBackground =
    transparent || background === "transparent"
      ? "transparent"
      : (background ?? backgroundColor(resolved) ?? "#050506")

  const containerStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    height: "100%",
    minHeight: 320,
    overflow: "hidden",
    background: pageBackground,
    // Dragging is on unless it is turned off, so the browser must not claim
    // the gesture for a scroll first.
    touchAction: motion?.draggable === false ? undefined : "none",
    ...style,
  }

  const resolvedErrorFallback =
    typeof errorFallback === "function"
      ? errorFallback(error ?? new Error("WebGL unavailable"))
      : errorFallback

  // WebGL missing outright is the one case with nothing to mount a surface
  // into, because there will never be an engine.
  if (!webglOk) {
    return (
      <div ref={containerRef} className={className} style={containerStyle} data-liquidforge="error">
        {resolvedErrorFallback ?? <DefaultError webgl={false} />}
      </div>
    )
  }

  /*
   * One tree, always. Loading and error states are overlays rather than
   * branches, because the engine creates and owns its `<canvas>` and appends it
   * to the surface div below. Swapping that div out for an error message — the
   * obvious way to write this — detaches the canvas, and since the engine is
   * only rebuilt when `quality` changes, nothing ever puts it back. The surface
   * stayed blank for the rest of the session, and the way in was picking
   * "Model" in the Studio: that sets an empty `src`, which errored instantly.
   */
  return (
    <div
      ref={containerRef}
      className={className}
      style={containerStyle}
      data-liquidforge="canvas"
      data-state={error ? "error" : incomplete ? "waiting" : ready ? "ready" : "loading"}
    >
      <div ref={surfaceRef} style={{ position: "absolute", inset: 0 }} />

      {error && (
        <div style={overlayStyle} data-liquidforge="error">
          {resolvedErrorFallback ?? <DefaultError message={error.message} webgl />}
        </div>
      )}

      {!error && incomplete && (
        <div style={overlayStyle} data-liquidforge="waiting">
          <DefaultWaiting source={object} light={resolved.background === "light"} />
        </div>
      )}

      {!error && !incomplete && !ready && (
        <div style={overlayStyle} data-liquidforge="loading">
          {fallback ?? (
            <LiquidLoading
              light={resolved.background === "light"}
              label={progress ?? "forging"}
            />
          )}
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

const PROMPTS: Record<string, string> = {
  model: "choose a .glb",
  image: "choose an image",
  svg: "paste or upload an svg",
  text: "type something",
}

/** The state between picking a kind of object and choosing the thing itself. */
function DefaultWaiting({ source, light }: { source: ObjectSource; light: boolean }) {
  return (
    <span
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 10,
        letterSpacing: "0.24em",
        textTransform: "uppercase",
        color: light ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)",
      }}
    >
      {PROMPTS[source.type] ?? "nothing to render"}
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
