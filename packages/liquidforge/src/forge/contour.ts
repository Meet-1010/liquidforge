import { Path, Shape, Vector2 } from "three"

export interface Point {
  x: number
  y: number
}

/**
 * Marching-squares contour tracing.
 *
 * The browser does not expose glyph outlines, so the only way to get real
 * extruded 3D text out of an arbitrary webfont (or an emoji, or a pasted logo)
 * is to rasterise it and trace the result. That same tracer then serves
 * image-to-silhouette extrusion for free.
 *
 * Pipeline: mask -> directed edge segments -> linked loops -> simplified
 * polygons -> nested `THREE.Shape`s with holes.
 */

/** Directed segment per marching-squares case, as [from, to] edge ids. */
type EdgeId = 0 | 1 | 2 | 3 // 0 top, 1 right, 2 bottom, 3 left

const CASES: Array<Array<[EdgeId, EdgeId]>> = [
  [], // 0000
  [[3, 2]], // 0001 bl
  [[2, 1]], // 0010 br
  [[3, 1]], // 0011 bl br
  [[1, 0]], // 0100 tr
  [
    [3, 0],
    [1, 2],
  ], // 0101 tr bl (saddle)
  [[2, 0]], // 0110 tr br
  [[3, 0]], // 0111 tr br bl
  [[0, 3]], // 1000 tl
  [[0, 2]], // 1001 tl bl
  [
    [0, 1],
    [2, 3],
  ], // 1010 tl br (saddle)
  [[0, 1]], // 1011 tl br bl
  [[1, 3]], // 1100 tl tr
  [[1, 2]], // 1101 tl tr bl
  [[2, 3]], // 1110 tl tr br
  [], // 1111
]

function edgePoint(edge: EdgeId, x: number, y: number): Point {
  switch (edge) {
    case 0:
      return { x: x + 0.5, y }
    case 1:
      return { x: x + 1, y: y + 0.5 }
    case 2:
      return { x: x + 0.5, y: y + 1 }
    default:
      return { x, y: y + 0.5 }
  }
}

const KEY_PRECISION = 100
const key = (p: Point) => `${Math.round(p.x * KEY_PRECISION)},${Math.round(p.y * KEY_PRECISION)}`

/**
 * Trace every closed contour in a binary mask.
 *
 * @param mask   Row-major occupancy, `width * height` entries, non-zero = solid.
 * @param width  Mask width in cells.
 * @param height Mask height in cells.
 */
export function traceContours(
  mask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Point[][] {
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x] ? 1 : 0

  // Collect directed segments, indexed by their start point so loops can be
  // chained by repeatedly following "what starts where the last one ended".
  const outgoing = new Map<string, Point[]>()
  let segmentCount = 0

  for (let y = -1; y < height; y++) {
    for (let x = -1; x < width; x++) {
      const index =
        (at(x, y) << 3) | (at(x + 1, y) << 2) | (at(x + 1, y + 1) << 1) | at(x, y + 1)
      const segments = CASES[index]
      if (segments.length === 0) continue
      for (const [from, to] of segments) {
        const a = edgePoint(from, x, y)
        const b = edgePoint(to, x, y)
        const k = key(a)
        const bucket = outgoing.get(k)
        if (bucket) bucket.push(b)
        else outgoing.set(k, [b])
        segmentCount++
      }
    }
  }

  const loops: Point[][] = []
  let guard = segmentCount + 8

  while (outgoing.size > 0 && guard-- > 0) {
    const startKey = outgoing.keys().next().value as string
    const loop: Point[] = []

    let currentKey = startKey
    let current: Point | undefined = parseKey(startKey)

    while (current) {
      const bucket = outgoing.get(currentKey)
      if (!bucket || bucket.length === 0) {
        outgoing.delete(currentKey)
        break
      }
      const next = bucket.pop()!
      if (bucket.length === 0) outgoing.delete(currentKey)

      loop.push(current)
      current = next
      currentKey = key(next)

      if (currentKey === startKey) break
      if (loop.length > segmentCount + 4) break // malformed input guard
    }

    if (loop.length >= 3) loops.push(loop)
  }

  return loops
}

function parseKey(k: string): Point {
  const [x, y] = k.split(",")
  return { x: Number(x) / KEY_PRECISION, y: Number(y) / KEY_PRECISION }
}

/** Ramer-Douglas-Peucker. `tolerance` is in mask cells. */
export function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3 || tolerance <= 0) return points

  const sqTolerance = tolerance * tolerance
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack: Array<[number, number]> = [[0, points.length - 1]]

  while (stack.length > 0) {
    const [first, last] = stack.pop()!
    let maxSqDist = 0
    let index = -1

    for (let i = first + 1; i < last; i++) {
      const sqDist = sqSegmentDistance(points[i], points[first], points[last])
      if (sqDist > maxSqDist) {
        maxSqDist = sqDist
        index = i
      }
    }

    if (index !== -1 && maxSqDist > sqTolerance) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }

  const result: Point[] = []
  for (let i = 0; i < points.length; i++) if (keep[i]) result.push(points[i])
  return result.length >= 3 ? result : points
}

function sqSegmentDistance(p: Point, a: Point, b: Point): number {
  let x = a.x
  let y = a.y
  let dx = b.x - x
  let dy = b.y - y

  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy)
    if (t > 1) {
      x = b.x
      y = b.y
    } else if (t > 0) {
      x += dx * t
      y += dy * t
    }
  }

  dx = p.x - x
  dy = p.y - y
  return dx * dx + dy * dy
}

export function signedArea(points: Point[]): number {
  let area = 0
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += (points[j].x + points[i].x) * (points[j].y - points[i].y)
  }
  return area / 2
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

export interface ContoursToShapesOptions {
  /** Simplification tolerance in mask cells. @default 1.2 */
  smoothing?: number
  /** Drop contours smaller than this fraction of the largest one. @default 0.002 */
  minAreaRatio?: number
  /** Scale factor applied to mask coordinates. */
  scale?: number
  /** Translation applied after scaling. */
  offset?: Point
  /** Flip Y (canvas grows down, three.js grows up). @default true */
  flipY?: boolean
}

/**
 * Turn raw contours into `THREE.Shape`s, resolving which loops are holes.
 *
 * Even-odd nesting: a loop contained by an odd number of other loops is a hole
 * in its smallest container. That handles letters like `O`, `B` and `%`.
 */
export function contoursToShapes(
  contours: Point[][],
  options: ContoursToShapesOptions = {},
): Shape[] {
  const { smoothing = 1.2, minAreaRatio = 0.002, scale = 1, offset = { x: 0, y: 0 }, flipY = true } =
    options

  const simplified = contours
    .map((c) => simplify(c, smoothing))
    .filter((c) => c.length >= 3)
    .map((c) => ({ points: c, area: Math.abs(signedArea(c)) }))
    .filter((c) => c.area > 0)

  if (simplified.length === 0) return []

  const largest = Math.max(...simplified.map((c) => c.area))
  const kept = simplified
    .filter((c) => c.area / largest >= minAreaRatio)
    .sort((a, b) => b.area - a.area)

  const transform = (p: Point): Point => ({
    x: p.x * scale + offset.x,
    y: (flipY ? -p.y : p.y) * scale + offset.y,
  })

  // depth[i] = how many other loops contain loop i.
  const depths = kept.map((candidate, i) => {
    const probe = candidate.points[0]
    let depth = 0
    for (let j = 0; j < kept.length; j++) {
      if (i === j) continue
      if (kept[j].area <= candidate.area) continue
      if (pointInPolygon(probe, kept[j].points)) depth++
    }
    return depth
  })

  const shapes: Shape[] = []
  const shapeIndexByLoop = new Map<number, number>()

  kept.forEach((loop, i) => {
    if (depths[i] % 2 !== 0) return
    const shape = new Shape(loop.points.map((p) => toVector2(transform(p))))
    shapeIndexByLoop.set(i, shapes.length)
    shapes.push(shape)
  })

  kept.forEach((loop, i) => {
    if (depths[i] % 2 === 0) return
    // Attach the hole to the smallest even-depth loop that contains it.
    let bestIndex = -1
    let bestArea = Number.POSITIVE_INFINITY
    for (let j = 0; j < kept.length; j++) {
      if (i === j || depths[j] % 2 !== 0) continue
      if (kept[j].area <= loop.area) continue
      if (kept[j].area < bestArea && pointInPolygon(loop.points[0], kept[j].points)) {
        bestArea = kept[j].area
        bestIndex = j
      }
    }
    const shapeIndex = bestIndex >= 0 ? shapeIndexByLoop.get(bestIndex) : undefined
    if (shapeIndex === undefined) return
    shapes[shapeIndex].holes.push(new Path(loop.points.map((p) => toVector2(transform(p)))))
  })

  return shapes
}

function toVector2(p: Point): Vector2 {
  return new Vector2(p.x, p.y)
}

/** Bounding box of a set of contours, in mask cells. */
export function contourBounds(contours: Point[][]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const contour of contours) {
    for (const p of contour) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}
