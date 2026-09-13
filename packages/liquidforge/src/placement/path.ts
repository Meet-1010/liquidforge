import type { ObjectSource } from "../types"
import type { PlacementPath, PlacementPoint } from "./types"

/**
 * Turning a drawn path into a position — and, since checkpoints, into an
 * object and a look — for a given scroll progress.
 *
 * The naive version — index into `points` by `progress * points.length` — is
 * wrong in a way you can see: a path drawn slowly has its points bunched up,
 * and the object crawls through the bunched part and races through the rest.
 * Scroll progress should map to *distance travelled*, not to point count.
 *
 * ## Timed points
 *
 * A point can also say *when* the object reaches it (`at`, a scroll progress),
 * or have that worked out from an element on the page. Those points become
 * fixed moments, and everything between two of them is spaced by distance, the
 * same as before. With no timings at all, every point's moment is derived from
 * its distance along the whole route — which is exactly the old behaviour, so
 * a path saved before checkpoints existed moves identically.
 */

/** Steps walked per segment when measuring length. Well under a pixel of error. */
const STEPS = 16

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

interface Segment {
  /** Dense samples from this point to the next, both ends included. */
  samples: ResolvedPoint[]
  /** Distance from the segment's start to each sample. */
  cumulative: number[]
  length: number
}

export interface SampledPath {
  /** Every dense sample along the route, in order — for drawing it. */
  samples: ResolvedPoint[]
  /** Total length in frame units. */
  length: number
  /** The scroll progress at which the object reaches each input point. */
  ats: number[]
  /** The input points with inherited values filled in. */
  points: ResolvedPoint[]
  segments: Segment[]
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

/**
 * The moment each point is reached.
 *
 * Known moments are the first and last points (0 and 1 unless they say
 * otherwise), any point with an `at`, and any point pinned to an element.
 * Everything between two known moments is spread by distance. Moments are
 * forced to never run backwards — two anchors can resolve out of order when the
 * page reflows, and an object that has to un-reach a point reads as a glitch.
 */
function resolveAts(
  input: PlacementPoint[],
  segments: Segment[],
  pinned: ReadonlyArray<number | undefined> | undefined,
): number[] {
  const n = input.length
  const known: Array<number | undefined> = input.map((point, i) => {
    const value = pinned?.[i] ?? point.at
    return value == null || !Number.isFinite(value) ? undefined : Math.max(0, Math.min(1, value))
  })
  if (known[0] === undefined) known[0] = 0
  if (known[n - 1] === undefined) known[n - 1] = 1

  // Monotonic: a later known moment can never be earlier than one before it.
  let floor = 0
  for (let i = 0; i < n; i++) {
    if (known[i] === undefined) continue
    known[i] = Math.max(floor, known[i]!)
    floor = known[i]!
  }

  const ats = new Array<number>(n)
  let start = 0
  while (start < n - 1) {
    let end = start + 1
    while (end < n && known[end] === undefined) end++
    const from = known[start]!
    const to = known[end]!
    let run = 0
    for (let s = start; s < end; s++) run += segments[s]?.length ?? 0
    ats[start] = from
    let travelled = 0
    for (let s = start; s < end; s++) {
      if (s > start) ats[s] = run > 0 ? from + (to - from) * (travelled / run) : from + ((to - from) * (s - start)) / (end - start)
      travelled += segments[s]?.length ?? 0
    }
    ats[end] = to
    start = end
  }
  if (n === 1) ats[0] = known[0]!
  return ats
}

export function samplePath(path: PlacementPath, pinned?: ReadonlyArray<number | undefined>): SampledPath {
  const points = inherit(path.points)
  const empty: SampledPath = { samples: [], length: 0, ats: [], points, segments: [] }
  if (points.length === 0) return empty
  if (points.length === 1) {
    return { samples: [points[0]], length: 0, ats: [path.points[0]?.at ?? 0], points, segments: [] }
  }

  const smooth = path.smooth !== false && points.length > 2
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]
  const segments: Segment[] = []

  for (let seg = 0; seg < points.length - 1; seg += 1) {
    const p0 = at(seg - 1)
    const p1 = at(seg)
    const p2 = at(seg + 1)
    const p3 = at(seg + 2)
    const samples: ResolvedPoint[] = []
    const cumulative: number[] = []
    let length = 0

    for (let step = 0; step <= STEPS; step += 1) {
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
      const previous = samples[samples.length - 1]
      if (previous) length += Math.hypot(point.x - previous.x, point.y - previous.y)
      samples.push(point)
      cumulative.push(length)
    }
    segments.push({ samples, cumulative, length })
  }

  const ats = resolveAts(path.points, segments, pinned)
  const all: ResolvedPoint[] = []
  segments.forEach((segment, i) => all.push(...(i === 0 ? segment.samples : segment.samples.slice(1))))
  const length = segments.reduce((sum, segment) => sum + segment.length, 0)

  return { samples: all, length, ats, points, segments }
}

/** Where on a segment the object is, `fraction` of the way along it by distance. */
function alongSegment(segment: Segment, fraction: number): ResolvedPoint {
  const { samples, cumulative, length } = segment
  if (length <= 0) return samples[samples.length - 1]
  const wanted = Math.max(0, Math.min(1, fraction)) * length
  let lo = 0
  let hi = cumulative.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cumulative[mid] < wanted) lo = mid
    else hi = mid
  }
  const span = cumulative[hi] - cumulative[lo]
  const t = span > 0 ? (wanted - cumulative[lo]) / span : 0
  const a = samples[lo]
  const b = samples[hi]
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    size: a.size + (b.size - a.size) * t,
    spin: a.spin + (b.spin - a.spin) * t,
  }
}

/** Which segment `progress` falls in, and how far through it. */
function locate(sampled: SampledPath, progress: number): { segment: number; fraction: number } {
  const { ats } = sampled
  const p = Math.max(0, Math.min(1, progress))
  if (p <= ats[0]) return { segment: 0, fraction: 0 }
  const last = ats.length - 1
  if (p >= ats[last]) return { segment: last - 1, fraction: 1 }
  let k = 0
  while (k < last - 1 && ats[k + 1] < p) k++
  const width = ats[k + 1] - ats[k]
  return { segment: k, fraction: width > 0 ? (p - ats[k]) / width : 1 }
}

/** Where the object is at `progress` (0–1) along an already-sampled path. */
export function pointAt(sampled: SampledPath, progress: number): ResolvedPoint | null {
  if (sampled.points.length === 0) return null
  if (sampled.segments.length === 0) return sampled.points[0]
  const { segment, fraction } = locate(sampled, progress)
  return alongSegment(sampled.segments[segment], fraction)
}

/* ------------------------------------------------------------------ */

/** What the object is and how it looks, at one moment of the scroll. */
export interface CheckpointState {
  /** The object on screen. */
  object: ObjectSource | undefined
  /** Index of the checkpoint whose object is on screen; -1 for the placement's own. */
  objectFrom: number
  /** The look being blended from, and toward. Equal outside a transition. */
  presetFrom: string | undefined
  presetTo: string | undefined
  /** 0 at `presetFrom`, 1 at `presetTo`. */
  blend: number
  /** 0–1, how hard the surface is boiling. Peaks exactly on a checkpoint. */
  mutation: number
}

/**
 * The checkpoint side of a path: which object, which look, how molten.
 *
 * A point that sets `object` or `preset` is a checkpoint: from that moment on,
 * that is what the object is. Around each one there is a window of scroll —
 * `window` either side — in which the look is bred from the old colourway into
 * the new one, and, if the object itself changes, the surface boils up to a
 * peak on the checkpoint where the swap happens, then settles. Outside every
 * window nothing is transitioning and `blend` and `mutation` are both zero.
 */
export function checkpointAt(
  path: PlacementPath,
  sampled: SampledPath,
  progress: number,
  base: { object?: ObjectSource; preset?: string },
  window = 0.06,
): CheckpointState {
  const p = Math.max(0, Math.min(1, progress))
  const points = path.points
  let object = base.object
  let objectFrom = -1
  let preset = base.preset
  let presetFrom = base.preset
  let presetTo = base.preset
  let blend = 0
  let mutation = 0
  const w = Math.max(0.005, window)

  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    const changesObject = point.object !== undefined
    const changesPreset = point.preset !== undefined && point.preset !== preset
    if (!changesObject && !changesPreset) continue
    const at = sampled.ats[i] ?? 0
    const distance = Math.abs(p - at)

    if (distance < w) {
      const closeness = 1 - distance / w
      // A shape change melts fully; a colourway change only simmers, which is
      // enough to read as the material turning over rather than being recoloured.
      mutation = Math.max(mutation, changesObject ? closeness : closeness * 0.35)
      if (changesPreset) {
        presetFrom = preset
        presetTo = point.preset
        const t = (p - (at - w)) / (2 * w)
        blend = t * t * (3 - 2 * t)
      }
    }

    if (p >= at) {
      if (changesObject) {
        object = point.object
        objectFrom = i
      }
      if (point.preset !== undefined) preset = point.preset
      if (distance >= w) {
        presetFrom = preset
        presetTo = preset
        blend = 0
      }
    }
  }

  return { object, objectFrom, presetFrom, presetTo, blend, mutation }
}

/** An SVG `d` for drawing the path — used by the editor, and by nothing else. */
export function pathToSvg(path: PlacementPath, width: number, height: number): string {
  const { samples } = samplePath(path)
  if (samples.length === 0) return ""
  return samples
    .map((point, i) => `${i === 0 ? "M" : "L"}${(point.x * width).toFixed(1)} ${(point.y * height).toFixed(1)}`)
    .join(" ")
}
