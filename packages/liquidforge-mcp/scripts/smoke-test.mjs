/**
 * Smoke test: start the server over stdio and call every tool once.
 *
 * Not a substitute for a unit test, but it catches the failures that matter
 * most for an MCP server — a tool that throws on its own defaults, a schema the
 * SDK rejects at registration, a broken import in the built output — none of
 * which typechecking finds.
 */

import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, "..", "dist", "index.js")

const child = spawn(process.execPath, [entry], { stdio: ["pipe", "pipe", "pipe"] })

let buffer = ""
const pending = new Map()

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString()
  let index
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (!line) continue
    try {
      const message = JSON.parse(line)
      const resolve = pending.get(message.id)
      if (resolve) {
        pending.delete(message.id)
        resolve(message)
      }
    } catch {
      // Not JSON — the server writes diagnostics to stderr, so ignore it.
    }
  }
})

child.stderr.on("data", (chunk) => process.stderr.write(`  [server] ${chunk}`))

let nextId = 1
function request(method, params) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, resolve)
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
    setTimeout(() => reject(new Error(`timed out: ${method}`)), 10_000)
  })
}

function notify(method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`)
}

let failures = 0
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

try {
  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0" },
  })
  notify("notifications/initialized")

  const listed = await request("tools/list", {})
  const names = (listed.result?.tools ?? []).map((tool) => tool.name)
  check("tools/list returns all nine", names.length === 9, names.join(", "))

  const started = await request("tools/call", {
    name: "liquidforge_get_started",
    arguments: {},
  })
  check(
    "get_started mentions the peer dependencies",
    started.result?.content?.[0]?.text?.includes("three"),
  )

  const docs = await request("tools/call", {
    name: "liquidforge_get_docs",
    arguments: { topic: "blend" },
  })
  check(
    "get_docs blend warns about stacking contexts",
    docs.result?.content?.[0]?.text?.includes("stacking context"),
  )

  const collections = await request("tools/call", {
    name: "liquidforge_list_collections",
    arguments: { response_format: "json" },
  })
  const parsed = JSON.parse(collections.result.content[0].text)
  const total = parsed.collections.reduce((sum, entry) => sum + entry.colourways.length, 0)
  check("list_collections returns 90 colourways", total === 90, String(total))

  const inspected = await request("tools/call", {
    name: "liquidforge_inspect_preset",
    arguments: { preset: "mercury-3", response_format: "json" },
  })
  check(
    "inspect_preset returns the surface numbers",
    JSON.parse(inspected.result.content[0].text).preset.surface.advection !== undefined,
  )

  const badPreset = await request("tools/call", {
    name: "liquidforge_inspect_preset",
    arguments: { preset: "nope-1" },
  })
  check("inspect_preset rejects an unknown id", badPreset.result?.isError === true)

  const light = await request("tools/call", {
    name: "liquidforge_recommend_preset",
    arguments: {
      site_description: "a calm skincare brand, soft and gentle",
      background: "light",
      response_format: "json",
    },
  })
  const lightResult = JSON.parse(light.result.content[0].text)
  check(
    "recommend picks a light-page family for a light page",
    ["pearl", "jade"].includes(lightResult.family),
    lightResult.family,
  )

  // Each new family should be reachable from a description, not just by id.
  for (const [description, expected] of [
    ["a luxury automotive brand, restrained and premium", "obsidian"],
    ["a couture fashion house, intimate and expensive", "velvet"],
    ["a streetwear sneaker drop, holographic and loud", "halo"],
    ["an AI observability platform for realtime telemetry", "plasma"],
  ]) {
    const picked = await request("tools/call", {
      name: "liquidforge_recommend_preset",
      arguments: { site_description: description, background: "dark", response_format: "json" },
    })
    const family = JSON.parse(picked.result.content[0].text).family
    check(`recommend picks ${expected} for "${description.slice(0, 28)}…"`, family === expected, family)
  }

  const loud = await request("tools/call", {
    name: "liquidforge_recommend_preset",
    arguments: {
      site_description: "an esports tournament, loud and aggressive",
      background: "dark",
      response_format: "json",
    },
  })
  check(
    "recommend picks Magma for an esports site",
    JSON.parse(loud.result.content[0].text).family === "magma",
    JSON.parse(loud.result.content[0].text).family,
  )

  const generated = await request("tools/call", {
    name: "liquidforge_generate_component",
    arguments: {
      preset: "aurora-2",
      object: { type: "text", value: "SHIP IT" },
      blend: true,
      response_format: "json",
    },
  })
  const code = JSON.parse(generated.result.content[0].text).component
  check("generate_component emits a LiquidHero", code.includes("<LiquidHero"))
  check("generate_component names the preset", code.includes('preset="aurora-2"'))
  check("generate_component passes blend through", code.includes("blend"))
  // three.js is a static list and Objaverse reads the index off disk, so both
  // of these run with no network — which is the point of testing with them.
  const models = await request("tools/call", {
    name: "liquidforge_search_models",
    arguments: { query: "dragon", providers: ["threejs"], response_format: "json" },
  })
  const found = JSON.parse(models.result.content[0].text).results
  check("search_models finds the three.js dragon", found.some((m) => m.name === "Dragon"))

  const objaverse = await request("tools/call", {
    name: "liquidforge_search_models",
    arguments: { query: "chair", providers: ["objaverse"], limit: 5, response_format: "json" },
  })
  const objaverseResults = JSON.parse(objaverse.result.content[0].text)
  check(
    "search_models reads the Objaverse index off disk",
    objaverseResults.results.length > 0 && objaverseResults.failed.length === 0,
    JSON.stringify(objaverseResults.failed),
  )

  const importUrl = await request("tools/call", {
    name: "liquidforge_get_model_import",
    arguments: { provider: "threejs", id: "DragonAttenuation.glb", response_format: "json" },
  })
  const resolved = JSON.parse(importUrl.result.content[0].text)
  check(
    "get_model_import resolves a .glb URL",
    resolved.url.endsWith("DragonAttenuation.glb"),
    resolved.url,
  )
  check('get_model_import emits type: "model"', resolved.component.includes('type: "model"'))

  const sketchfab = await request("tools/call", {
    name: "liquidforge_get_model_import",
    arguments: { provider: "sketchfab", id: "abc123" },
  })
  check("get_model_import refuses Sketchfab rather than guessing", sketchfab.result?.isError === true)

  // Agents copy ids out of the search results table, which prints them as
  // `code`. The backticks should not be the reason a real id is refused.
  const pasted = await request("tools/call", {
    name: "liquidforge_get_model_import",
    arguments: { provider: "khronos", id: "`DamagedHelmet`", response_format: "json" },
  })
  check("get_model_import tolerates an id pasted with backticks", pasted.result?.isError !== true)

  const placement = await request("tools/call", {
    name: "liquidforge_generate_placement",
    arguments: {
      preset: "velvet-2",
      object: { type: "shape", shape: "torusknot" },
      id: "drift",
      response_format: "json",
    },
  })
  const setup = JSON.parse(placement.result.content[0].text).setup
  check("generate_placement uses LiquidSpot under the given id", setup.includes('<LiquidSpot') && setup.includes('id="drift"'))
  check("generate_placement puts the object and colourway in the file", setup.includes('"torusknot"') && setup.includes('"velvet-2"'))
  check("generate_placement summons the editor and the save route", setup.includes("<LiquidEditor") && setup.includes("createPlacementsRoute"))
  check("generate_placement says what to delete afterwards", /When you are finished/.test(setup))

  const vite = await request("tools/call", {
    name: "liquidforge_generate_placement",
    arguments: { preset: "mercury-3", object: { type: "text", value: "HI" }, framework: "vite", response_format: "json" },
  })
  check("generate_placement emits the Vite plugin for Vite", JSON.parse(vite.result.content[0].text).setup.includes("liquidforgePlacements()"))

  const unknown = await request("tools/call", {
    name: "liquidforge_generate_placement",
    arguments: { preset: "nope-99", object: { type: "shape", shape: "sphere" } },
  })
  check("generate_placement rejects an unknown preset", unknown.result?.isError === true)

  const placementDocs = await request("tools/call", {
    name: "liquidforge_get_docs",
    arguments: { topic: "placement" },
  })
  check("get_docs placement warns about the underscore folder", /underscore/i.test(placementDocs.result.content[0].text))

  const startedAgain = await request("tools/call", { name: "liquidforge_get_started", arguments: {} })
  check("get_started tells TypeScript users about @types/three", startedAgain.result.content[0].text.includes("@types/three"))
} catch (error) {
  failures++
  console.log(`  FAIL  ${error.message}`)
} finally {
  child.kill()
}

console.log(failures === 0 ? "\nall good\n" : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
