/**
 * Breeding and blending, checked for the properties that make them usable.
 *
 * A child must be reproducible from its seed (a gallery link has to show the
 * same child twice), every gene must stay inside its range (a child is a real
 * colourway, not a broken one), and a blend must actually arrive at its
 * endpoints — a scroll checkpoint that lands 2% short of the next colourway
 * leaves the page permanently between two looks.
 *
 *   node test/breed.test.mjs      (after npm run build)
 */
import { blendPresets, breed, litter, mixHex } from "../dist/breed.js"
import { PRESETS } from "../dist/presets.js"

let pass = 0, fail = 0
const ok = (name, cond, detail = "") => { cond ? pass++ : fail++; console.log(`${cond ? "  ok" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`) }

const A = { preset: PRESETS["mercury-3"], object: { type: "shape", shape: "torusknot" } }
const B = { preset: PRESETS["magma-1"], object: { type: "text", value: "HOT" } }

ok("blend at 0 is the first parent", blendPresets(A.preset, B.preset, 0) === A.preset)
ok("blend at 1 is the second parent", blendPresets(B.preset, A.preset, 1) === A.preset)
const mid = blendPresets(A.preset, B.preset, 0.5)
ok("a midpoint interpolates the numbers", Math.abs(mid.surface.dimple - (A.preset.surface.dimple + B.preset.surface.dimple) / 2) < 1e-9)
ok("the family switches at halfway, not before", blendPresets(A.preset, B.preset, 0.49).family === "mercury" && blendPresets(A.preset, B.preset, 0.5).family === "magma")

// OKLab: blue and yellow must not meet in grey the way they do in sRGB.
const m = mixHex("#0000ff", "#ffff00", 0.5)
const n = Number.parseInt(m.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
const spread = Math.max(r, g, b) - Math.min(r, g, b)
ok("colours mix in OKLab, not through grey", spread > 40, `${m} (channel spread ${spread})`)
ok("mixHex round-trips an endpoint", mixHex("#ff5a36", "#2f6bd8", 0).toLowerCase() === "#ff5a36", mixHex("#ff5a36", "#2f6bd8", 0))

const c1 = breed(A, B, 12345)
const c2 = breed(A, B, 12345)
ok("the same seed breeds the same child", JSON.stringify(c1) === JSON.stringify(c2))
ok("a different seed breeds a different child", JSON.stringify(breed(A, B, 12346)) !== JSON.stringify(c1))

const kids = litter(A, B, 60, 777)
const inRange = kids.every((k) => {
  const s = k.preset.surface, h = k.preset.shading
  return s.dimple >= 0.02 && s.dimple <= 0.4 && s.noise >= 0 && s.noise <= 0.16 && h.roughness >= 0 && h.roughness <= 1
    && h.metalness >= 0 && h.metalness <= 1 && Number.isInteger(s.rippleTightness)
    && k.preset.palette.every((hex) => /^#[0-9a-f]{6}$/i.test(hex))
})
ok("every gene of 60 children stays in range", inRange)
const families = new Set(kids.map((k) => k.preset.family))
const silhouettes = new Set(kids.map((k) => k.object.type))
ok("a litter takes the family from both parents", families.has("mercury") && families.has("magma"), [...families].join(", "))
ok("a litter takes the silhouette from both parents", silhouettes.has("shape") && silhouettes.has("text"), [...silhouettes].join(", "))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
