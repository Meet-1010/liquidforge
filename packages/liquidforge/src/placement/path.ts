import type { PlacementPath, PlacementPoint } from "./types"

/**
 * Turning a drawn path into a position for a given scroll progress.
 *
 * The naive version — index into `points` by `progress * points.length` — is
 * wrong in a way you can see: a path drawn slowly has its points bunched up,
 * and the object crawls through the bunched part and races through the rest.
 * Scroll progress should map to *distance travelled*, not to point count.
 *
 * So the path is resampled once into an even ladder of positions, and lookup is
 * a straight index into that ladder. Building it costs one pass; every frame
 * after that is an array read and a lerp.
 */

/** How many rungs the ladder gets. 256 is smooth past any screen's pixel grid. */
const SAMPLES = 256

/** Catmull-Rom through p1→p2, with p0 and p3 as the neighbouring tangents. */
function spline(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

export interface ResolvedPoint {
  x: number
  y: number
  size: number
  spin: number
}

export interface SampledPath {
  /** Evenly spaced by distance, not by input point. */
  samples: ResolvedPoint[]
  /** Total length in frame units, for anyone who wants to scale speed by it. */
  length: number
}

/**
 * Fill in the values a point inherited rather than declared.
 *
 * `size` and `spin` are optional on the wire so a path drawn without touching
 * them stays compact — a hundred-point path carries one size, not a hundred
 * copies of it. Here they are carried forward from the last point that set one.
 */
function inherit(points: PlacementPoint[]): ResolvedPoint[] {
  let size = points[0]?.size ?? 0.34
  let spin = points[0]?.spin ?? 0
  return points.map((point) => {
    if (point.size != null) size = point.size
    if (point.spin != null) spin = point.spin
    return { x: point.x, y: point.y, size, spin }
  })
}

export function samplePath(path: PlacementPath): SampledPath {
  const points = inherit(path.points)
  if (points.length === 0) return { samples: [], length: 0 }
  if (points.length === 1) {
    return { samples: Array.from({ length: SAMPLES }, () => points[0]), length: 0 }
  }

  const smooth = path.smooth !== false && points.length > 2

  /*
   * Walk the curve at a resolution finer than the ladder we are about to build,
   * accumulating distance as we go. Sixteen steps per segment is plenty: the
   * error in arc length from chording a Catmull-Rom at that density is well
   * under a pixel at any size a hero is drawn.
   */
  const STEPS = 16
  const dense: ResolvedPoint[] = []
  const cumulative: number[] = []
  let total = 0

  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]

  for (let seg = 0; seg < points.length - 1; seg += 1) {
    const p0 = at(seg - 1)
    const p1 = at(seg)
    const p2 = at(seg + 1)
    const p3 = at(seg + 2)

    for (let step = 0; step < STEPS; step += 1) {
      const t = step / STEPS
      const point: ResolvedPoint = smooth
        ? {
            x: spline(p0.x, p1.x, p2.x, p3.x, t),
            y: spline(p0.y, p1.y, p2.y, p3.y, t),
            size: spline(p0.size, p1.size, p2.size, p3.size, t),
            spin: spline(p0.spin, p1.spin, p2.spin, p3.spin, t),
          }
        : {
            x: p1.x + (p2.x - p1.x) * t,
            y: p1.y + (p2.y - p1.y) * t,
            size: p1.size + (p2.size - p1.size) * t,
            spin: p1.spin + (p2.spin - p1.spin) * t,
          }

      const previous = dense[dense.length - 1]
      if (previous) total += Math.hypot(point.x - previous.x, point.y - previous.y)
      dense.push(point)
      cumulative.push(total)
    }
  }

  const last = points[points.length - 1]
  const previous = dense[dense.length - 1]
  if (previous) total += Math.hypot(last.x - previous.x, last.y - previous.y)
  dense.push(last)
  cumulative.push(total)

  // A path of zero length (every point stacked) would divide by zero below.
  if (total === 0) {
    return { samples: Array.from({ length: SAMPLES }, () => dense[0]), length: 0 }
  }

  /*
   * Now walk the ladder. `cursor` only ever moves forward, so the whole
   * resample is O(SAMPLES + dense) rather than a binary search per rung.
   */
  const samples: ResolvedPoint[] = []
  let cursor = 0
  for (let i = 0; i < SAMPLES; i += 1) {
    const wanted = (i / (SAMPLES - 1)) * total
    while (cursor < cumulative.length - 2 && cumulative[cursor + 1] < wanted) cursor += 1

    const spanStart = cumulative[cursor]
    const spanEnd = cumulative[cursor + 1] ?? spanStart
    const span = spanEnd - spanStart
    const t = span > 0 ? (wanted - spanStart) / span : 0

    const a = dense[cursor]
    const b = dense[cursor + 1] ?? a
    samples.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      size: a.size + (b.size - a.size) * t,
      spin: a.spin + (b.spin - a.spin) * t,
    })
  }

  return { samples, length: total }
}

/** Where the object is at `progress` (0–1) along an already-sampled path. */
export function pointAt(sampled: SampledPath, progress: number): ResolvedPoint | null {
  const { samples } = sampled
  if (samples.length === 0) return null

  const clamped = Math.max(0, Math.min(1, progress))
  const exact = clamped * (samples.length - 1)
  const index = Math.floor(exact)
  const t = exact - index

  const a = samples[index]
  const b = samples[Math.min(samples.length - 1, index + 1)]
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    size: a.size + (b.size - a.size) * t,
    spin: a.spin + (b.spin - a.spin) * t,
  }
}

/** An SVG `d` for drawing the path — used by the editor, and by nothing else. */
export function pathToSvg(path: PlacementPath, width: number, height: number): string {
  const { samples } = samplePath(path)
  if (samples.length === 0) return ""
  return samples
    .map((point, i) => `${i === 0 ? "M" : "L"}${(point.x * width).toFixed(1)} ${(point.y * height).toFixed(1)}`)
    .join(" ")
}
