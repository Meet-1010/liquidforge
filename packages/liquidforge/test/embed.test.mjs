import assert from "node:assert/strict"
import { configFromPreset, elementAttributes, elementScriptUrl, generateEmbed } from "../dist/codegen.js"
import { objectFromAttributes } from "../dist/element.js"

let passed = 0
const test = (name, fn) => {
  fn()
  passed++
  console.log(`  ok  ${name}`)
}

test("an untouched colourway writes only the object and the preset", () => {
  const attributes = elementAttributes(configFromPreset("mercury-1", { type: "text", value: "HI", depth: 0.45, bevel: 0.03 }))
  assert.deepEqual(attributes, [["text", "HI"], ["preset", "mercury-1"]])
})

test("tuned numbers travel as JSON of only what changed", () => {
  const config = configFromPreset("magma-2", { type: "shape", shape: "torus" })
  config.shading = { ...config.shading, emissive: 2.2 }
  const shading = elementAttributes(config).find(([name]) => name === "shading")
  assert.deepEqual(JSON.parse(shading[1]), { emissive: 2.2 })
})

test("attribute values are escaped in markup", () => {
  const html = generateEmbed(configFromPreset("mercury-1", { type: "text", value: 'a"b<c' }))
  assert.ok(html.includes('text="a&quot;b&lt;c"'))
})

test("inline SVG markup falls back to the object attribute", () => {
  const attributes = elementAttributes(configFromPreset("mercury-1", { type: "svg", markup: "<svg/>" }))
  assert.equal(attributes[0][0], "object")
  assert.deepEqual(JSON.parse(attributes[0][1]), { type: "svg", markup: "<svg/>" })
})

test("the CDN link pins major.minor so fixes arrive and breaking changes do not", () => {
  assert.equal(elementScriptUrl("1.4.2"), "https://cdn.jsdelivr.net/npm/liquidforge@1.4/dist/element.global.js")
  assert.equal(elementScriptUrl("0.0.0-dev"), "https://cdn.jsdelivr.net/npm/liquidforge@latest/dist/element.global.js")
})

test("the element reads back what the embed wrote", () => {
  for (const object of [
    { type: "text", value: "MELT" },
    { type: "shape", shape: "capsule" },
    { type: "model", src: "https://example.com/a.glb" },
    { type: "svg", markup: "<svg/>" },
  ]) {
    const attributes = new Map(elementAttributes(configFromPreset("aurora-1", object)))
    const read = objectFromAttributes((name) => (attributes.has(name) ? String(attributes.get(name)) : null))
    for (const [key, value] of Object.entries(object)) assert.equal(read[key], value, `${object.type}.${key}`)
  }
})

test("Framer gets a code component with property controls", () => {
  const code = generateEmbed(configFromPreset("aurora-2", { type: "text", value: "HI" }), { target: "framer" })
  assert.ok(code.includes("export default function Liquid"))
  assert.ok(code.includes("addPropertyControls"))
  assert.ok(code.includes('React.createElement("liquid-forge"'))
})

console.log(`\n${passed} embed checks passed`)
