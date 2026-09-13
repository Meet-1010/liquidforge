/**
 * The whitespace router, on pages built out of rectangles.
 *
 * What it promises, each checked directly: the object stays out of the text;
 * it commits to one margin rather than zig-zagging across the reading column;
 * it steps around a heading that crosses the whole width at the moment that
 * heading is on screen; it never sits under a fixed nav; and it shrinks rather
 * than overlaps when the gap is small.
 *
 *   node test/route.test.mjs      (after npm run build)
 */
import { routeThroughWhitespace } from "../dist/placement.js"

let pass = 0, fail = 0
const ok = (name, cond, detail = "") => { cond ? pass++ : fail++; console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`) }

const viewport = { w: 1280, h: 800 }
const documentHeight = 4000

// A centred reading column, 30%–70% of the width, one line box every 32px.
const column = []
for (let y = 120; y < documentHeight - 80; y += 32) column.push({ x: 384, y, w: 512, h: 22 })

{
  const { points } = routeThroughWhitespace({ content: column, viewport, documentHeight, size: 0.2 })
  const radius = (p) => (p.size * viewport.w) / 2
  const clear = points.every((p) => {
    const cx = p.x * viewport.w
    return cx + radius(p) <= 384 + 1 || cx - radius(p) >= 896 - 1
  })
  ok("stays out of a centred text column", clear, points.map((p) => p.x.toFixed(2)).join(" "))
  const sides = new Set(points.map((p) => (p.x < 0.5 ? "left" : "right")))
  ok("commits to one margin instead of zig-zagging across the text", sides.size === 1, [...sides].join(","))
  ok("reaches every moment in order", points.every((p, i) => i === 0 || p.at > points[i - 1].at) && points[0].at === 0 && points.at(-1).at === 1)
}

// The column plus a heading that spans the full width halfway down the page.
{
  const headingTop = 2000
  const heading = { x: 0, y: headingTop, w: 1280, h: 120 }
  const { points } = routeThroughWhitespace({ content: [...column, heading], viewport, documentHeight, size: 0.2, bands: 25 })
  const range = documentHeight - viewport.h
  const overlapping = points.filter((p) => {
    const scroll = p.at * range
    const cy = p.y * viewport.h
    const r = (p.size * viewport.w) / 2
    const top = headingTop - scroll
    const bottom = headingTop + 120 - scroll
    return cy + r > top && cy - r < bottom
  })
  ok("steps around a full-width heading while it is on screen", overlapping.length === 0, `${overlapping.length} of ${points.length} overlap`)
}

// Nothing on the page at all.
{
  const { points, fit } = routeThroughWhitespace({ content: [], viewport, documentHeight, size: 0.3 })
  ok("an empty page gets the full size everywhere", points.every((p) => Math.abs(p.size - 0.3) < 0.001) && fit.every((f) => f === 1))
  const travel = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
  ok("and has no reason to move", travel < 0.001, `travel ${travel.toFixed(4)}`)
}

// A fixed nav bar across the top of the viewport.
{
  const nav = { x: 0, y: 0, w: 1280, h: 90 }
  const { points } = routeThroughWhitespace({ content: [], fixed: [nav], viewport, documentHeight, size: 0.2 })
  const under = points.filter((p) => p.y * viewport.h - (p.size * viewport.w) / 2 < 90)
  ok("never sits under a fixed nav", under.length === 0, `${under.length} under`)
}

// A narrow gap: text everywhere except a 160px strip down the right edge.
{
  const wall = []
  for (let y = 0; y < documentHeight; y += 30) wall.push({ x: 0, y, w: 1100, h: 24 })
  const { points, fit } = routeThroughWhitespace({ content: wall, viewport, documentHeight, size: 0.3, margin: 8 })
  ok("shrinks to fit a gap rather than overlap it", points.every((p) => p.size < 0.3 && p.x * viewport.w - (p.size * viewport.w) / 2 >= 1100 + 8 - 2),
     `sizes ${[...new Set(points.map((p) => p.size.toFixed(3)))].join(",")}`)
  ok("and reports that it had to", fit.every((f) => f < 1))
}

// A page that does not scroll gets one still point.
{
  const { points } = routeThroughWhitespace({ content: column.slice(0, 5), viewport, documentHeight: 800, size: 0.2 })
  ok("a page that does not scroll gets one point", points.length === 1 && points[0].at === 0)
}

// A page with a wide empty margin: without roam the object parks, and the
// repeated points collapse instead of stacking a dozen handles on one pixel.
{
  const { points } = routeThroughWhitespace({ content: column, viewport, documentHeight, size: 0.18 })
  ok("a parked route collapses to its start and end", points.length === 2 && points[0].at === 0 && points[1].at === 1, `${points.length} points`)
}
{
  const { points } = routeThroughWhitespace({ content: column, viewport, documentHeight, size: 0.18, roam: 0.7 })
  const ys = points.map((p) => p.y)
  const span = Math.max(...ys) - Math.min(...ys)
  ok("with roam, it travels through the room it has", span > 0.2 && points.length > 3, `vertical travel ${span.toFixed(2)} over ${points.length} points`)
  const radius = (p) => (p.size * viewport.w) / 2
  ok("and still stays out of the text while it does", points.every((p) => p.x * viewport.w + radius(p) <= 385 || p.x * viewport.w - radius(p) >= 895))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
