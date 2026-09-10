/**
 * Where a liquid object sits on someone else's page, and how it moves.
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
   * Rotation at this point, in turns (1 = full circle). Omitted means carry on.
   */
  spin?: number
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
   * Whether the object swallows pointer events. Off by default: something
   * floating over a page should not eat clicks meant for the page.
   * @default false
   */
  interactive?: boolean
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
