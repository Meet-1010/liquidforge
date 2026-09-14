import type { ObjectSource } from "../types"

/**
 * What sits on someone else's page, where, and how it moves.
 *
 * This is the whole contract between the editor and the runtime. The editor
 * produces one of these; the runtime consumes it; nothing else is shared. That
 * split is what makes the editor removable — delete the import and the
 * placement is still sitting in the JSON file, still being applied.
 *
 * Everything is stored as a fraction of the frame rather than in pixels, so a
 * placement made on a 27" monitor still means the same thing on a phone. Sizes
 * are fractions of the frame's *width* specifically: tying them to width keeps
 * an object the same relative size when the viewport gets taller, which is what
 * you want, because pages get taller and not wider.
 */

/** A point on the path, in frame fractions. */
export interface PlacementPoint {
  /** 0 is the frame's left edge, 1 its right. Values outside are allowed. */
  x: number
  /** 0 is the frame's top edge, 1 its bottom. */
  y: number
  /**
   * Size at this point, as a fraction of frame width. Omitted means "carry on
   * from the previous point", so a path drawn without touching size stays the
   * size it started.
   */
  size?: number
  /**
   * Rotation in the plane of the screen at this point, in turns (1 = full
   * circle). Omitted means carry on.
   */
  spin?: number
  /**
   * Turn around the vertical axis at this point, in turns: 0.25 brings the
   * object's right side round to face the reader. Scrolling between two points
   * with different turns rotates the object in 3D. Omitted means carry on.
   */
  turn?: number
  /**
   * Tip around the horizontal axis at this point, in turns: positive brings the
   * top toward the reader. Omitted means carry on.
   */
  tilt?: number
  /**
   * The scroll progress, 0–1, at which the object reaches this point.
   *
   * Omitted, points are spaced by distance along the route, which is what a
   * hand-drawn path wants. Set, this point becomes a fixed moment — "be here
   * when the reader is a third of the way down" — and the points either side of
   * it are spaced by distance within that window.
   */
  at?: number
  /**
   * Tie this point's moment to an element instead of a number.
   *
   * The object reaches this point on screen at the moment the element reaches
   * the same height on screen. So when the copy above it changes and the
   * element moves down the page, the moment moves with it, and the object still
   * arrives beside `#pricing` rather than beside whatever is now where pricing
   * used to be. Only meaningful in the `viewport` frame.
   */
  anchor?: PlacementAnchor
  /**
   * From this point on, the object becomes this. A point that sets an object or
   * a colourway is a checkpoint: scroll past it and the surface boils up, the
   * shape swaps at the peak, and it settles into the new one.
   */
  object?: ObjectSource
  /** From this point on, this colourway — bred into from the previous one across the checkpoint. */
  preset?: string
}

export interface PlacementAnchor {
  /** A CSS selector. An id is the robust choice; the editor writes one when it can. */
  selector: string
  /** Which height of the element meets the point: 0 its top, 1 its bottom. @default 0.5 */
  ay?: number
  /**
   * Also take the point's horizontal position from the element, so the object
   * lines up with it sideways as well — useful when a layout reflows between
   * one column and two.
   * @default false
   */
  followX?: boolean
  /** With `followX`, which part of the element's width: 0 left, 1 right. @default 0.5 */
  ax?: number
}

export interface PlacementPath {
  /**
   * The route, in order. `points[0]` is where the object sits at progress 0,
   * so a path always includes its own origin rather than implying it.
   */
  points: PlacementPoint[]
  /**
   * How hard the object eases toward its scroll position, per frame, 0–1.
   * 1 snaps exactly to the scroll offset. Lower values let it lag and glide,
   * which is what makes scroll-driven motion feel physical rather than welded
   * to the scrollbar.
   * @default 0.12
   */
  ease?: number
  /**
   * How much scroll either side of a checkpoint the transition takes, as a
   * fraction of the whole. Wider melts are slower and more deliberate.
   * @default 0.06
   */
  morph?: number
  /**
   * `true` draws through the points as a smooth curve, `false` as straight
   * segments. Drawn paths are dense enough that the two look nearly identical;
   * paths built from a handful of clicked points do not.
   * @default true
   */
  smooth?: boolean
}

export interface Placement {
  /**
   * What the fractions are measured against.
   *
   * `viewport` pins the object to the screen and drives it from how far down
   * the document you have scrolled — the object floats over the page and
   * travels its path as you read. `section` measures against the nearest
   * positioned ancestor and drives progress from that element's own journey
   * through the viewport, which is what you want for something that belongs to
   * one band of the page.
   * @default "viewport"
   */
  frame?: "viewport" | "section"
  /**
   * The object itself. When present it wins over whatever the component was
   * given as props.
   *
   * This is here so the editor can change *what* the thing is, not only where
   * it sits. Without it, choosing a different shape means leaving the page,
   * editing source, and coming back — which defeats the point of editing in
   * place. With it, `<LiquidSpot id="hero" />` needs no other props at all:
   * the file says everything.
   */
  object?: ObjectSource
  /** Colourway id, e.g. `"mercury-3"`. Also wins over props when present. */
  preset?: string
  /** Where it sits, and how big, when there is no path. */
  origin: PlacementPoint
  /** Optional scroll-driven route. Without one the object simply sits still. */
  path?: PlacementPath
  /**
   * Paint order against the page's own content.
   *
   * Zero puts the object above the page's background and above plain in-flow
   * text, which is visible everywhere and is therefore the default: an object
   * you cannot see is a worse starting point than one that is too prominent.
   * To sit *behind* your text, give your content `position: relative; z-index:
   * 1` and leave this at zero.
   *
   * Negative values do work, but only on a page whose `html` and `body` have no
   * opaque background — a negative z-index paints behind those. `LiquidSpot`
   * warns in development when that is about to make an object invisible.
   * @default 0
   */
  layer?: number
  /**
   * A different placement for narrower screens.
   *
   * Fractions of the viewport put the object *proportionally* in the same place
   * on a phone, which is often exactly wrong: a size that sits beside a column
   * on a monitor covers the whole column on a phone. Each override replaces the
   * route for that width — and can swap the object or colourway too, if a
   * smaller one reads better there. Widths are `BREAKPOINTS`.
   */
  breakpoints?: Partial<Record<BreakpointName, PlacementOverride>>
  /**
   * Whether the object swallows pointer events. Off by default: something
   * floating over a page should not eat clicks meant for the page.
   * @default false
   */
  interactive?: boolean
}

export type BreakpointName = "tablet" | "phone"

/** The widest viewport, in CSS pixels, each breakpoint applies to. */
export const BREAKPOINTS: Record<BreakpointName, number> = { tablet: 1024, phone: 640 }

/** What a breakpoint may replace. Anything it leaves out is inherited. */
export type PlacementOverride = Partial<Pick<Placement, "origin" | "path" | "object" | "preset" | "frame">>

/** Which breakpoint a viewport width falls into, or null for the full placement. */
export function breakpointFor(width: number): BreakpointName | null {
  if (width <= BREAKPOINTS.phone) return "phone"
  if (width <= BREAKPOINTS.tablet) return "tablet"
  return null
}

/**
 * The placement to use at a given width.
 *
 * A phone falls back to the tablet override when it has none of its own, and
 * then to the full placement, because a layout that works on a tablet is
 * usually closer to right on a phone than the desktop one is.
 */
export function resolveBreakpoint(placement: Placement, width: number): Placement {
  const name = breakpointFor(width)
  if (!name || !placement.breakpoints) return placement
  const override =
    placement.breakpoints[name] ?? (name === "phone" ? placement.breakpoints.tablet : undefined)
  if (!override) return placement
  // Only what the override actually sets. Spreading it whole would copy an
  // absent `origin` in as `undefined` and erase the one being inherited.
  const set = Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined))
  return { ...placement, ...set, breakpoints: placement.breakpoints }
}

/** What the sidecar file holds: one placement per `id` on the page. */
export type PlacementFile = Record<string, Placement>

/**
 * Where the editor saves, unless told otherwise.
 *
 * Not `/__liquidforge/...`, which is the conventional shape for a dev-only
 * endpoint and is also unroutable in Next: the App Router treats any folder
 * beginning with an underscore as private and never maps it to a URL, so the
 * route exists, compiles, and 404s. `/api/` avoids that and is unlikely to
 * collide with anything real.
 */
export const PLACEMENTS_ENDPOINT = "/api/liquidforge/placements"

/** A placement that does nothing, for a component mounted before it is placed. */
export const DEFAULT_PLACEMENT: Placement = {
  frame: "viewport",
  origin: { x: 0.5, y: 0.5, size: 0.34 },
  layer: 0,
  interactive: false,
}
