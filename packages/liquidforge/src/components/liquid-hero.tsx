"use client"

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import { LiquidCanvas, type LiquidCanvasProps } from "./liquid-canvas"
import { warnIfBlendIsolated } from "./blend-check"

export interface LiquidHeroProps extends LiquidCanvasProps {
  /**
   * `overlay` centres your content on top of the surface.
   * `split` puts content on one side and the surface on the other.
   * @default "overlay"
   */
  layout?: "overlay" | "split"
  /** Which side the surface sits on in `split` layout. @default "right" */
  canvasSide?: "left" | "right"
  /** Section height. @default "100vh" for overlay, "min(90vh, 720px)" for split */
  height?: string | number
  /**
   * Blend the content into the surface with `mix-blend-mode: difference`, so
   * the headline inverts to the complement of whatever is behind it.
   *
   * Only meaningful in `overlay` layout. See the note on painting order below.
   * @default false
   */
  blend?: boolean
  children?: ReactNode
  className?: string
  contentClassName?: string
  canvasClassName?: string
  /** Style for the canvas element. `style` styles the outer section. */
  canvasStyle?: CSSProperties
}

/**
 * A complete hero section: the liquid surface plus your content.
 *
 * ```tsx
 * <LiquidHero object={{ type: "text", value: "SHIP IT" }} preset="mercury-3" blend>
 *   <h1>Ship a hero people screenshot.</h1>
 * </LiquidHero>
 * ```
 *
 * ## Painting order, and why there is no `z-index` here
 *
 * The content has to paint above the canvas, and the obvious way to arrange
 * that — `z-index: 1` on the content — is the one thing that breaks `blend`. A
 * `z-index` creates a stacking context, which isolates the blend group, and the
 * headline then composites against its own parent's transparent backdrop
 * instead of against the liquid. It renders flat white, silently (§5.7).
 *
 * So the order is handled structurally instead: both the canvas and the content
 * are positioned with `z-index: auto`, and positioned siblings paint in DOM
 * order. Canvas first, content second, nothing isolated. Keep it that way in
 * your own wrappers — `transform`, `filter`, `opacity` below 1 and
 * `will-change` all do the same damage, and `warnIfBlendIsolated` will name the
 * offending element in development if one creeps in.
 */
export function LiquidHero({
  layout = "overlay",
  canvasSide = "right",
  height,
  blend = false,
  children,
  className,
  contentClassName,
  canvasClassName,
  canvasStyle,
  style,
  ...canvasProps
}: LiquidHeroProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (blend) warnIfBlendIsolated(contentRef.current)
  }, [blend])

  const resolvedHeight = height ?? (layout === "overlay" ? "100vh" : "min(90vh, 720px)")

  if (layout === "split") {
    return (
      <section
        className={className}
        data-liquidforge="hero"
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          alignItems: "stretch",
          minHeight: resolvedHeight,
          ...style,
        }}
      >
        <div
          ref={contentRef}
          className={contentClassName}
          style={{
            order: canvasSide === "right" ? 0 : 1,
            display: "grid",
            alignContent: "center",
            padding: "clamp(24px, 5vw, 72px)",
          }}
        >
          {children}
        </div>
        <LiquidCanvas
          {...canvasProps}
          className={canvasClassName}
          style={{ order: canvasSide === "right" ? 1 : 0, minHeight: 320, ...canvasStyle }}
        />
      </section>
    )
  }

  return (
    <section
      className={className}
      data-liquidforge="hero"
      style={{ position: "relative", minHeight: resolvedHeight, ...style }}
    >
      <LiquidCanvas
        {...canvasProps}
        className={canvasClassName}
        style={{ position: "absolute", inset: 0, height: "100%", ...canvasStyle }}
      />
      {children != null && (
        <div
          ref={contentRef}
          className={contentClassName}
          style={{
            // `position: relative` with no z-index: enough to paint above the
            // absolutely positioned canvas, not enough to isolate a blend group.
            position: "relative",
            minHeight: "inherit",
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            padding: "clamp(24px, 5vw, 72px)",
            // The gutter stays click-through so the cursor reaches the liquid
            // across most of the hero; the content itself takes pointer events
            // so links and buttons behave normally.
            pointerEvents: "none",
            ...(blend ? { mixBlendMode: "difference" as const, color: "#ffffff" } : null),
          }}
        >
          <div style={{ pointerEvents: "auto" }}>{children}</div>
        </div>
      )}
    </section>
  )
}
