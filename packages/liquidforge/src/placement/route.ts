import type { PlacementPoint } from "./types"

/**
 * A scroll path that routes itself through the page's empty space.
 *
 * Every scroll-path tool has you drag control points by hand. This one looks
 * at the page first. For a dozen moments down the scroll it asks the same
 * question — at this scroll position, where on the screen is there no text, no
 * image, no button? — and then picks one spot per moment so that the object is
 * as clear of the content as it can be while moving as little as it can.
 *
 * Pure: it takes boxes and returns points. Measuring the page is someone else's
 * job (`collectContent`), which is what makes this testable without a browser
 * and usable by an agent that has only a list of rectangles.
 *
 * ## How
 *
 * 1. For each moment, rasterise the content that is on screen at that scroll
 *    offset into a coarse grid, plus anything fixed to the viewport (a nav).
 * 2. A chamfer distance transform turns that into clearance: how far each cell
 *    is from the nearest content or screen edge.
 * 3. The best few dozen cells per moment become candidates.
 * 4. Viterbi across the moments chooses one candidate each, trading clearance
 *    (up to the object's own radius — more room than that is not better)
 *    against the distance moved, so the route commits to one margin instead of
 *    zig-zagging across the reading column for a few extra pixels of space.
 * 5. Where the room is tight the object shrinks rather than overlapping.
 */

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface RouteInput {
  /** Content in document coordinates: `y` measured from the top of the page. */
  content: Box[]
  /** Content fixed to the viewport, in viewport coordinates — navs, banners. */
  fixed?: Box[]
  viewport: { w: number; h: number }
  documentHeight: number
  /** The object's size you would like, as a fraction of viewport width. @default 0.3 */
  size?: number
  /** Moments sampled down the scroll. @default 12 */
  bands?: number
  /** Grid cells across the screen. @default 32 */
  grid?: number
  /** Breathing room kept around content, in CSS pixels. @default 16 */
  margin?: number
  /** How strongly the route prefers not to move, relative to clearance. @default 1.4 */
  stillness?: number
}

export interface RouteResult {
  points: PlacementPoint[]
  /** Per moment, how much of the wanted radius was actually available (0–1). */
  fit: number[]
}

export function routeThroughWhitespace(input: RouteInput): RouteResult {
  const {
    content,
    fixed = [],
    viewport,
    documentHeight,
    size = 0.3,
    bands = 12,
    grid = 32,
    margin = 16,
    stillness = 1.4,
  } = input

  const vw = Math.max(1, viewport.w)
  const vh = Math.max(1, viewport.h)
  const cols = Math.max(4, Math.round(grid))
  const rows = Math.max(3, Math.round((grid * vh) / vw))
  const cellW = vw / cols
  const cellH = vh / rows
  const range = Math.max(0, documentHeight - vh)
  const moments = range > 0 ? Math.max(2, Math.round(bands)) : 1
  const wantedRadius = (size * vw) / 2

  type Candidate = { col: number; row: number; x: number; y: number; clearance: number }
  const perMoment: Candidate[][] = []

  const occupancy = new Uint8Array(cols * rows)
  const distance = new Float32Array(cols * rows)

  const stamp = (box: Box, offsetY: number) => {
    const top = box.y - offsetY - margin
    const bottom = box.y + box.h - offsetY + margin
    if (bottom < 0 || top > vh) return
    const left = box.x - margin
    const right = box.x + box.w + margin
    const c0 = Math.max(0, Math.floor(left / cellW))
    const c1 = Math.min(cols - 1, Math.floor(right / cellW))
    const r0 = Math.max(0, Math.floor(top / cellH))
    const r1 = Math.min(rows - 1, Math.floor(bottom / cellH))
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) occupancy[r * cols + c] = 1
  }

  for (let m = 0; m < moments; m++) {
    const progress = moments === 1 ? 0 : m / (moments - 1)
    const scroll = progress * range
    occupancy.fill(0)
    for (const box of content) stamp(box, scroll)
    for (const box of fixed) stamp(box, 0)

    // Chamfer distance transform, in pixels. The screen edge counts as content,
    // so the object is never routed half off the side of the viewport.
    const diag = Math.hypot(cellW, cellH)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        if (occupancy[i]) {
          distance[i] = 0
          continue
        }
        const edge = Math.min((c + 0.5) * cellW, (cols - c - 0.5) * cellW, (r + 0.5) * cellH, (rows - r - 0.5) * cellH)
        distance[i] = edge
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        if (c > 0) distance[i] = Math.min(distance[i], distance[i - 1] + cellW)
        if (r > 0) distance[i] = Math.min(distance[i], distance[i - cols] + cellH)
        if (r > 0 && c > 0) distance[i] = Math.min(distance[i], distance[i - cols - 1] + diag)
        if (r > 0 && c < cols - 1) distance[i] = Math.min(distance[i], distance[i - cols + 1] + diag)
      }
    }
    for (let r = rows - 1; r >= 0; r--) {
      for (let c = cols - 1; c >= 0; c--) {
        const i = r * cols + c
        if (c < cols - 1) distance[i] = Math.min(distance[i], distance[i + 1] + cellW)
        if (r < rows - 1) distance[i] = Math.min(distance[i], distance[i + cols] + cellH)
        if (r < rows - 1 && c < cols - 1) distance[i] = Math.min(distance[i], distance[i + cols + 1] + diag)
        if (r < rows - 1 && c > 0) distance[i] = Math.min(distance[i], distance[i + cols - 1] + diag)
      }
    }

    const all: Candidate[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        if (occupancy[i]) continue
        // The transform measures between cell centres, and an occupied cell's
        // centre can sit up to half a cell past the content's real edge — so
        // the raw value overstates the room by as much as that. Taking the
        // half-cell off errs toward a slightly smaller object, which is the
        // right side to be wrong on for something promising never to overlap.
        const clearance = Math.max(0, distance[i] - Math.max(cellW, cellH) / 2)
        all.push({ col: c, row: r, x: (c + 0.5) * cellW, y: (r + 0.5) * cellH, clearance })
      }
    }
    all.sort((a, b) => b.clearance - a.clearance)
    // Nothing free at all at this moment — a full-bleed image, say. Fall back to
    // the centre, where the object will shrink to almost nothing and pass by.
    perMoment.push(all.length > 0 ? all.slice(0, 40) : [{ col: 0, row: 0, x: vw / 2, y: vh / 2, clearance: 0 }])
  }

  // Viterbi: the cheapest sequence, one candidate per moment.
  const reward = (candidate: Candidate) => Math.min(candidate.clearance, wantedRadius) / Math.max(1, wantedRadius)
  const cost: number[][] = perMoment.map((list) => new Array(list.length).fill(Infinity))
  const back: number[][] = perMoment.map((list) => new Array(list.length).fill(-1))
  perMoment[0].forEach((candidate, i) => {
    cost[0][i] = -reward(candidate)
  })
  for (let m = 1; m < moments; m++) {
    perMoment[m].forEach((candidate, i) => {
      let best = Infinity
      let from = 0
      perMoment[m - 1].forEach((previous, j) => {
        const moved = Math.hypot(candidate.x - previous.x, candidate.y - previous.y) / vw
        const value = cost[m - 1][j] + moved * stillness
        if (value < best) {
          best = value
          from = j
        }
      })
      cost[m][i] = best - reward(candidate)
      back[m][i] = from
    })
  }

  let index = 0
  let lowest = Infinity
  cost[moments - 1].forEach((value, i) => {
    if (value < lowest) {
      lowest = value
      index = i
    }
  })
  const chosen: Candidate[] = new Array(moments)
  for (let m = moments - 1; m >= 0; m--) {
    chosen[m] = perMoment[m][index]
    index = back[m][index] >= 0 ? back[m][index] : 0
  }

  const fit: number[] = []
  const points: PlacementPoint[] = chosen.map((candidate, m) => {
    const available = candidate.clearance / Math.max(1, wantedRadius)
    fit.push(Math.max(0, Math.min(1, available)))
    // Shrink into tight gaps rather than overlap; never below a speck.
    const radius = Math.max(vw * 0.02, Math.min(wantedRadius, candidate.clearance * 0.95))
    return {
      x: round(candidate.x / vw),
      y: round(candidate.y / vh),
      size: round((radius * 2) / vw),
      at: round(moments === 1 ? 0 : m / (moments - 1)),
    }
  })

  return { points, fit }
}

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4
}

/**
 * Measure the page's content as boxes, for `routeThroughWhitespace`.
 *
 * Text is measured by line, not by element: a paragraph's element box is a
 * solid block including the ragged right edge of every line, and routing around
 * blocks throws away the space a short last line leaves. Ranges give each
 * line's own box. Media and form controls are measured whole.
 *
 * Anything under `exclude` is skipped — the object itself, the editor — and so
 * is anything invisible. Elements that are fixed or sticky are reported in
 * viewport coordinates, because they sit in the same place on screen at every
 * moment of the scroll.
 */
export function collectContent(exclude: Element[] = []): { content: Box[]; fixed: Box[] } {
  if (typeof document === "undefined") return { content: [], fixed: [] }
  const content: Box[] = []
  const fixedBoxes: Box[] = []
  const scrollY = window.scrollY
  const fixedCache = new Map<Element, boolean>()
  const LIMIT = 5000

  const isExcluded = (node: Node) => exclude.some((root) => root.contains(node))
  const isFixed = (element: Element | null): boolean => {
    let node = element
    const seen: Element[] = []
    while (node && node !== document.body) {
      const cached = fixedCache.get(node)
      if (cached !== undefined) {
        for (const s of seen) fixedCache.set(s, cached)
        return cached
      }
      seen.push(node)
      const position = getComputedStyle(node).position
      if (position === "fixed" || position === "sticky") {
        for (const s of seen) fixedCache.set(s, true)
        return true
      }
      node = node.parentElement
    }
    for (const s of seen) fixedCache.set(s, false)
    return false
  }
  const push = (rect: DOMRect, owner: Element | null) => {
    if (rect.width < 2 || rect.height < 2) return
    if (isFixed(owner)) fixedBoxes.push({ x: rect.left, y: rect.top, w: rect.width, h: rect.height })
    else content.push({ x: rect.left, y: rect.top + scrollY, w: rect.width, h: rect.height })
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let node: Node | null
  while ((node = walker.nextNode()) && content.length + fixedBoxes.length < LIMIT) {
    if (!node.textContent || !node.textContent.trim()) continue
    if (isExcluded(node)) continue
    const parent = node.parentElement
    if (!parent) continue
    const style = getComputedStyle(parent)
    if (style.visibility === "hidden" || style.opacity === "0") continue
    range.selectNodeContents(node)
    for (const rect of Array.from(range.getClientRects())) push(rect, parent)
  }

  const media = document.querySelectorAll("img, video, picture, svg, iframe, canvas, button, input, textarea, select")
  for (const element of Array.from(media)) {
    if (content.length + fixedBoxes.length >= LIMIT) break
    if (isExcluded(element)) continue
    // An svg inside a button is already covered by the button.
    if (element.tagName.toLowerCase() === "svg" && element.closest("button, a")) continue
    push(element.getBoundingClientRect(), element)
  }

  return { content, fixed: fixedBoxes }
}
