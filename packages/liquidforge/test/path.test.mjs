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
import { samplePath, pointAt, checkpointAt } from "../dist/placement.js"

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

// 6. Timed points. An `at` pins the moment a point is reached; between two
//    pinned moments, points are still spaced by distance.
const timed = { points: [{ x: 0, y: 0 }, { x: 1, y: 0, at: 0.8 }, { x: 1, y: 1 }], smooth: false }
const sT = samplePath(timed)
ok("a point with `at` is reached exactly then", near(pointAt(sT, 0.8).x, 1, 0.001) && near(pointAt(sT, 0.8).y, 0, 0.001),
   `(${pointAt(sT, 0.8).x.toFixed(3)}, ${pointAt(sT, 0.8).y.toFixed(3)})`)
ok("before it, the object moves by distance within the window", near(pointAt(sT, 0.4).x, 0.5, 0.01), `x=${pointAt(sT, 0.4).x.toFixed(3)}`)
ok("after it, the rest of the route fills the rest of the scroll", near(pointAt(sT, 0.9).y, 0.5, 0.01), `y=${pointAt(sT, 0.9).y.toFixed(3)}`)

// 7. A pinned moment (what an anchor resolves to) overrides the point's own.
const sP = samplePath(timed, [undefined, 0.25, undefined])
ok("a pinned moment overrides `at`", near(pointAt(sP, 0.25).x, 1, 0.001), `x=${pointAt(sP, 0.25).x.toFixed(3)}`)

// 8. Two anchors that resolve out of order must not make the object run back.
const sM = samplePath({ points: [{ x: 0, y: 0 }, { x: 0.5, y: 0, at: 0.6 }, { x: 1, y: 0, at: 0.3 }, { x: 1, y: 1 }], smooth: false })
ok("moments never run backwards", sM.ats.every((a, i) => i === 0 || a >= sM.ats[i - 1]), sM.ats.map((a) => a.toFixed(2)).join(" "))

// 9. No timings at all behaves exactly like the old arc-length path.
const plain = samplePath({ points: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 1, y: 0 }], smooth: false })
ok("untimed points are timed by distance", near(plain.ats[1], 0.1, 0.001), `ats=${plain.ats.map((a) => a.toFixed(3)).join(" ")}`)

// 10. Checkpoints: the object, the look, and the melt.
const cpPath = {
  points: [
    { x: 0, y: 0.5 },
    { x: 0.5, y: 0.5, at: 0.5, object: { type: "shape", shape: "capsule" }, preset: "magma-1" },
    { x: 1, y: 0.5 },
  ],
  smooth: false,
}
const cpS = samplePath(cpPath)
const base = { object: { type: "shape", shape: "torusknot" }, preset: "mercury-3" }
const early = checkpointAt(cpPath, cpS, 0.2, base)
ok("before a checkpoint, the placement's own object and look", early.object.shape === "torusknot" && early.presetTo === "mercury-3" && early.mutation === 0)
const peak = checkpointAt(cpPath, cpS, 0.5, base)
ok("on the checkpoint the simmer peaks, and gently", peak.mutation > 0.3 && peak.mutation < 0.6 && checkpointAt(cpPath, cpS, 0.47, base).mutation < peak.mutation, `mutation=${peak.mutation.toFixed(3)}`)
ok("mid-window the transition runs from the old side to the new", peak.from.object.shape === "torusknot" && peak.to.object.shape === "capsule" && near(peak.t, 0.5, 0.001), `t=${peak.t}`)
const tAt = (progress) => checkpointAt(cpPath, cpS, progress, base).t
ok("the transition eases in and out, never jumps", tAt(0.44) === 0 && tAt(0.441) < 0.01 && tAt(0.559) > 0.99 && [0.45, 0.47, 0.49, 0.51, 0.53, 0.55].every((x, i, xs) => i === 0 || tAt(x) > tAt(xs[i - 1])))
ok("outside every window nothing is transitioning", checkpointAt(cpPath, cpS, 0.3, base).to === null && checkpointAt(cpPath, cpS, 0.7, base).to === null && checkpointAt(cpPath, cpS, 0.7, base).from.object.shape === "capsule")
const scrubback = [0.9, 0.55, 0.5, 0.45, 0.2].map((x) => checkpointAt(cpPath, cpS, x, base))
ok("scrolling back up undoes it through the same states", scrubback[0].from.object.shape === "capsule" && near(scrubback[1].t, tAt(0.55), 1e-9) && scrubback[4].from.object.shape === "torusknot")
const close = { points: [{ x: 0, y: 0 }, { x: 0.3, y: 0, at: 0.5, preset: "aurora-1" }, { x: 0.6, y: 0, at: 0.52, preset: "magma-1" }, { x: 1, y: 0 }], smooth: false }
const closeS = samplePath(close)
const first = checkpointAt(close, closeS, 0.505, base, 0.06)
const second = checkpointAt(close, closeS, 0.515, base, 0.06)
ok("close checkpoints narrow their windows instead of overlapping",
   first.from.preset === "mercury-3" && first.to?.preset === "aurora-1" && second.from.preset === "aurora-1" && second.to?.preset === "magma-1",
   `${first.from.preset}→${first.to?.preset} then ${second.from.preset}→${second.to?.preset}`)
const justBefore = checkpointAt(cpPath, cpS, 0.49, base)
const justAfter = checkpointAt(cpPath, cpS, 0.51, base)
ok("the object swaps exactly as the checkpoint is crossed", justBefore.object.shape === "torusknot" && justAfter.object.shape === "capsule")
ok("the look is bred across the window, not cut", justBefore.blend > 0.3 && justBefore.blend < 0.5 && justAfter.blend > 0.5 && justAfter.blend < 0.7 && justAfter.presetFrom === "mercury-3" && justAfter.presetTo === "magma-1",
   `blend ${justBefore.blend.toFixed(2)} → ${justAfter.blend.toFixed(2)}`)
const late = checkpointAt(cpPath, cpS, 0.9, base)
ok("after the window, settled on the new object and look", late.object.shape === "capsule" && late.presetFrom === "magma-1" && late.presetTo === "magma-1" && late.blend === 0 && late.mutation === 0)

// Turning in 3D along the scroll: turn and tilt carry forward like size, and
// interpolate between the points that set them.
const turning = {
  points: [
    { x: 0, y: 0.5, turn: 0, tilt: 0.1 },
    { x: 0.5, y: 0.5 },
    { x: 1, y: 0.5, turn: 0.5 },
  ],
  smooth: false,
}
const turningS = samplePath(turning)
ok("a point without a turn carries the last one forward", turningS.points[1].turn === 0 && turningS.points[1].tilt === 0.1)
ok("turn interpolates along the route", near(pointAt(turningS, 0.75).turn, 0.25, 0.02), `${pointAt(turningS, 0.75).turn.toFixed(3)}`)
ok("tilt holds where no later point changes it", near(pointAt(turningS, 0.9).tilt, 0.1, 0.001))
ok("a path with no rotations resolves them to zero", samplePath(bunched).points.every((point) => point.turn === 0 && point.tilt === 0))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
