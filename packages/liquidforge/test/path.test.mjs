/**
 * The path maths, checked against the thing it exists to prevent.
 *
 * The bug this file is really about: mapping scroll progress onto the *points*
 * of a path rather than onto distance along it. A path drawn by hand has its
 * points bunched wherever the hand slowed down, so point-indexing makes the
 * object crawl through the bunched part and bolt through the rest. The first
 * test is that failure, written down.
 *
 *   node test/path.test.mjs      (after npm run build)
 */
import { samplePath, pointAt } from "../dist/placement.js"

let pass = 0, fail = 0
const ok = (name, cond, detail = "") => { cond ? pass++ : fail++; console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`) }
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol

// 1. Deliberately bunched points on a straight horizontal line.
//    Five points crammed into the first 10%, one at the end.
const bunched = {
  points: [
    { x: 0.00, y: 0.5, size: 0.2 },
    { x: 0.02, y: 0.5 },
    { x: 0.04, y: 0.5 },
    { x: 0.06, y: 0.5 },
    { x: 0.08, y: 0.5 },
    { x: 1.00, y: 0.5 },
  ],
  smooth: false,
}
const s1 = samplePath(bunched)
const mid = pointAt(s1, 0.5)
ok("half the scroll = half the distance, not half the points",
   near(mid.x, 0.5, 0.02), `x=${mid.x.toFixed(4)} (naive point-indexing would give ~0.08)`)

ok("progress 0 lands on the first point", near(pointAt(s1, 0).x, 0, 0.001))
ok("progress 1 lands on the last point",  near(pointAt(s1, 1).x, 1, 0.001))
ok("total length of a unit line is 1", near(s1.length, 1, 0.001), `length=${s1.length.toFixed(4)}`)

// 2. Even spacing: equal progress steps should cover equal distance.
const steps = [0, .25, .5, .75, 1].map(p => pointAt(s1, p).x)
const gaps = steps.slice(1).map((x, i) => x - steps[i])
const spread = Math.max(...gaps) - Math.min(...gaps)
ok("equal scroll steps cover equal ground", spread < 0.02, `gap spread=${spread.toFixed(4)} over ${gaps.map(g=>g.toFixed(3)).join(", ")}`)

// 3. Size inheritance: a point with no size carries the previous one.
const sized = { points: [{ x:0, y:0, size:0.1 }, { x:0.5, y:0 }, { x:1, y:0, size:0.5 }], smooth: false }
const s3 = samplePath(sized)
ok("size at the start is the declared one", near(pointAt(s3, 0).size, 0.1, 0.001), `${pointAt(s3,0).size.toFixed(3)}`)
ok("size at the end is the declared one",   near(pointAt(s3, 1).size, 0.5, 0.001), `${pointAt(s3,1).size.toFixed(3)}`)
ok("size interpolates in between",          pointAt(s3, 0.75).size > 0.1 && pointAt(s3, 0.75).size < 0.5, `${pointAt(s3,0.75).size.toFixed(3)}`)

// 4. Degenerate inputs must not divide by zero or throw.
ok("a single point is a valid path", pointAt(samplePath({ points: [{x:.3,y:.7,size:.2}] }), 0.5)?.x === 0.3)
ok("every point stacked does not explode", (() => {
  const p = pointAt(samplePath({ points: [{x:.5,y:.5},{x:.5,y:.5},{x:.5,y:.5}] }), 0.5)
  return p && Number.isFinite(p.x) && Number.isFinite(p.y)
})())
ok("an empty path returns null rather than NaN", pointAt(samplePath({ points: [] }), 0.5) === null)
ok("progress outside 0..1 is clamped", near(pointAt(s1, 5).x, 1, 0.001) && near(pointAt(s1, -3).x, 0, 0.001))

// 5. Smooth vs straight. Catmull-Rom passes *through* its control points, so
//    the two agree at the corner itself; the bulge shows up between points.
const corner = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]
const sSharp = samplePath({ points: corner, smooth: false })
const sRound = samplePath({ points: corner, smooth: true })
// It still goes through the corner — just not at progress 0.5, because
// smoothing lengthens the curve and arc length redistributes the middle.
const closest = sRound.samples.reduce((best, p) =>
  Math.hypot(p.x - 1, p.y - 0) < Math.hypot(best.x - 1, best.y - 0) ? p : best)
ok("the smoothed curve still passes through the control point",
   Math.hypot(closest.x - 1, closest.y - 0) < 0.01,
   `nearest sample=(${closest.x.toFixed(3)}, ${closest.y.toFixed(3)})`)

const q1 = pointAt(sSharp, 0.25), q2 = pointAt(sRound, 0.25)
ok("smoothing bows the line between the points",
   Math.hypot(q2.x - q1.x, q2.y - q1.y) > 0.01,
   `straight=(${q1.x.toFixed(3)},${q1.y.toFixed(3)}) smooth=(${q2.x.toFixed(3)},${q2.y.toFixed(3)})`)

ok("a smoothed path is at least as long as the straight one",
   sRound.length >= sSharp.length - 1e-6,
   `straight=${sSharp.length.toFixed(4)} smooth=${sRound.length.toFixed(4)}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
