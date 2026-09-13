import { execSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, relative, resolve } from "node:path"

/**
 * Liquidforge CLI.
 *
 * Zero dependencies on purpose: `npx liquidforge init` should start working
 * immediately rather than resolving a tree first.
 */

const PEER_DEPS = ["three"]

const COLORS = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  cyan: "\u001b[38;5;80m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
}

const supportsColor = process.stdout.isTTY && process.env.NO_COLOR === undefined
const paint = (color: keyof typeof COLORS, text: string) =>
  supportsColor ? `${COLORS[color]}${text}${COLORS.reset}` : text

const log = (message = "") => console.log(message)
const ok = (message: string) => log(`${paint("green", "+")} ${message}`)
const warn = (message: string) => log(`${paint("yellow", "!")} ${message}`)
const fail = (message: string) => log(`${paint("red", "x")} ${message}`)

/**
 * What each `add` target pulls in, named by where it starts.
 *
 * This used to be a hand-kept list of directories, and it went stale the way
 * hand-kept lists do: every module added after it was written — the ground
 * colours, the catalogue, the recommender, the placement runtime — was left
 * behind, so `add hero` produced source with nine imports pointing at files it
 * had not copied. It compiled nowhere. Nobody noticed, because the only thing
 * that ever exercised it was a person, after installing.
 *
 * So a bundle now names its entry points and the copy follows the imports from
 * there. Whatever those files actually need comes along, and a module added
 * next year is included the day something imports it.
 */
const BUNDLES: Record<string, { entries: string[]; description: string; usage: string }> = {
  hero: {
    description: "Everything: hero, spot, canvas, engine, material, object forge",
    entries: ["index.ts"],
    usage: `import { LiquidHero } from "{path}"\n\n  <LiquidHero object={{ type: "text", value: "SHIP IT" }} preset="mercury-3" />`,
  },
  editor: {
    description: "The in-place editor, its placement runtime and the dev save route",
    entries: ["index.ts", "editor/index.ts", "placement/index.ts", "dev/index.ts"],
    usage: `import { LiquidSpot } from "{path}"\n  import { LiquidEditor } from "{path}/editor"\n\n  <LiquidSpot id="hero" placement={placements.hero} />`,
  },
  material: {
    description: "Just the shader and the render loop",
    entries: ["material/liquid-material.ts", "engine/liquid-engine.ts"],
    usage: `import { LiquidEngine } from "{path}/engine/liquid-engine"`,
  },
  forge: {
    description: "Just the in-browser object generators",
    entries: ["forge/index.ts"],
    usage: `import { forgeGeometry } from "{path}/forge"`,
  },
}

/** The relative module specifiers one source file imports. */
function importsOf(text: string): string[] {
  const found = new Set<string>()
  // Static `from`, side-effect `import "./x"`, and dynamic `import("./x")`.
  const pattern = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g
  for (const match of text.matchAll(pattern)) found.add(match[1])
  return [...found]
}

/**
 * A specifier resolved against the source tree, or null.
 *
 * Null is also how comments and code-inside-strings are filtered out: the
 * library compiles, so every real relative import in it resolves to a file. A
 * specifier that resolves to nothing is, by definition, not a real import —
 * which quietly handles the `import placements from "./liquidforge.placements.json"`
 * that appears inside doc comments and generated-code template strings.
 */
function resolveModule(fromFile: string, specifier: string, root: string): string | null {
  const base = resolve(dirname(fromFile), specifier)
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]
  for (const candidate of candidates) {
    if (!candidate.startsWith(root)) continue
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** Every file reachable from the entries by following relative imports. */
function closure(root: string, entries: string[]): string[] {
  const seen = new Set<string>()
  const queue = entries.map((entry) => join(root, entry)).filter((file) => existsSync(file))
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (!/\.(ts|tsx|js|mjs)$/.test(file)) continue
    for (const specifier of importsOf(readFileSync(file, "utf8"))) {
      const next = resolveModule(file, specifier, root)
      if (next && !seen.has(next)) queue.push(next)
    }
  }
  return [...seen].sort()
}

function packageRoot(): string {
  // dist/cli.cjs -> package root
  return resolve(__dirname, "..")
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return null
  }
}

function detectProject(cwd: string) {
  const pkg = readJson(join(cwd, "package.json"))
  if (!pkg) return null

  const deps = {
    ...((pkg.dependencies as Record<string, string>) ?? {}),
    ...((pkg.devDependencies as Record<string, string>) ?? {}),
  }

  const framework = deps.next ? "next" : deps.vite || deps["@vitejs/plugin-react"] ? "vite" : "react"

  let packageManager: "npm" | "pnpm" | "yarn" | "bun" = "npm"
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) packageManager = "pnpm"
  else if (existsSync(join(cwd, "yarn.lock"))) packageManager = "yarn"
  else if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) {
    packageManager = "bun"
  }

  const candidates = ["src/components", "components", "app/components", "src"]
  const componentsDir = candidates.find((c) => existsSync(join(cwd, c))) ?? "components"

  return {
    pkg,
    deps,
    framework,
    packageManager,
    componentsDir,
    missing: PEER_DEPS.filter((d) => !deps[d]),
    /*
     * three ships no types, and the library's declarations import from it, so a
     * TypeScript project without @types/three sees errors reported from inside
     * liquidforge — which reads as the library being broken. Worth installing
     * for them rather than leaving them to find.
     */
    missingTypes: existsSync(join(cwd, "tsconfig.json")) && !deps["@types/three"],
  }
}

function installDevCommand(pm: string, packages: string[]) {
  const list = packages.join(" ")
  if (pm === "pnpm") return `pnpm add -D ${list}`
  if (pm === "yarn") return `yarn add -D ${list}`
  if (pm === "bun") return `bun add -d ${list}`
  return `npm install -D ${list}`
}

function installCommand(pm: string, packages: string[]) {
  const list = packages.join(" ")
  if (pm === "pnpm") return `pnpm add ${list}`
  if (pm === "yarn") return `yarn add ${list}`
  if (pm === "bun") return `bun add ${list}`
  return `npm install ${list}`
}

function toImportPath(cwd: string, destination: string) {
  const rel = relative(cwd, destination).split("\\").join("/")
  if (rel.startsWith("src/")) return `@/${rel.slice(4)}`
  return `@/${rel}`
}

function commandAdd(args: string[], cwd: string) {
  const target = args[0] ?? "hero"
  const bundle = BUNDLES[target]

  if (!bundle) {
    fail(`Unknown component "${target}".`)
    log(`\nAvailable:`)
    for (const [name, meta] of Object.entries(BUNDLES)) {
      log(`  ${paint("bold", name.padEnd(10))} ${paint("dim", meta.description)}`)
    }
    process.exitCode = 1
    return
  }

  const project = detectProject(cwd)
  const dirFlag = args.findIndex((a) => a === "--dir" || a === "-d")
  const outDir =
    dirFlag >= 0 && args[dirFlag + 1]
      ? args[dirFlag + 1]
      : join(project?.componentsDir ?? "components", "liquidforge")

  const src = join(packageRoot(), "src")
  if (!existsSync(src)) {
    fail("Could not find Liquidforge source to copy. Reinstall the package and try again.")
    process.exitCode = 1
    return
  }

  const destination = resolve(cwd, outDir)
  if (existsSync(destination) && readdirSync(destination).length > 0 && !args.includes("--force")) {
    fail(`${outDir} already exists and is not empty. Re-run with --force to overwrite.`)
    process.exitCode = 1
    return
  }

  const written: string[] = []
  for (const source of closure(src, bundle.entries)) {
    const target = join(destination, relative(src, source))
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
    written.push(target)
  }

  log()
  ok(`Copied ${written.length} files into ${paint("bold", outDir)}`)
  log(paint("dim", "  This is the real Liquidforge source — edit it freely, it's yours now."))
  log(
    paint(
      "dim",
      "  The shader lives in material/glsl. Start with fragment.ts if you want a new family.",
    ),
  )

  if (project && project.missing.length > 0) {
    log()
    warn(`Missing peer dependencies: ${project.missing.join(", ")}`)
    log(`  ${paint("cyan", installCommand(project.packageManager, project.missing))}`)
  }
  if (project?.missingTypes) {
    if (project.missing.length === 0) log()
    warn("TypeScript project without @types/three — three ships no types of its own:")
    log(`  ${paint("cyan", installDevCommand(project.packageManager, ["@types/three"]))}`)
  }

  log()
  log(paint("bold", "Use it:"))
  log(paint("dim", `  ${bundle.usage.split("{path}").join(toImportPath(cwd, destination))}`))
  log()
}

const EXAMPLE_COMPONENT = `"use client"

import { LiquidHero } from "liquidforge"

export function LiquidSection() {
  return (
    <LiquidHero
      // Swap this for { type: "model", src: "/models/yours.glb" } to use your
      // own object, or forge one from an SVG, a PNG or a parametric shape.
      object={{ type: "text", value: "SHIP IT" }}
      preset="mercury-3"
      height="100vh"
      blend
    >
      {/* \`blend\` inverts this text against the liquid behind it. It needs a
          clean stacking context: no ancestor of this section may set a z-index,
          a transform, a filter or an opacity below 1. */}
      <h1 style={{ fontSize: "clamp(2.5rem, 9vw, 7rem)", margin: 0, letterSpacing: "-0.03em" }}>
        Your headline goes here
      </h1>
    </LiquidHero>
  )
}
`

function commandInit(args: string[], cwd: string) {
  const project = detectProject(cwd)

  log()
  log(paint("cyan", paint("bold", "  Liquidforge")))
  log(paint("dim", "  Liquid hero sections, one component."))
  log()

  if (!project) {
    fail("No package.json here. Run this inside your project.")
    process.exitCode = 1
    return
  }

  ok(`Detected ${paint("bold", project.framework)} (${project.packageManager})`)

  const needed = [...project.missing]
  if (!project.deps.liquidforge) needed.unshift("liquidforge")
  const typesCommand = project.missingTypes ? installDevCommand(project.packageManager, ["@types/three"]) : null

  if (needed.length > 0) {
    const command = installCommand(project.packageManager, needed)
    if (args.includes("--yes") || args.includes("-y")) {
      log(`${paint("dim", "  running:")} ${command}`)
      try {
        execSync(command, { cwd, stdio: "inherit" })
        ok("Dependencies installed")
      } catch {
        fail("Install failed. Run it yourself:")
        log(`  ${paint("cyan", command)}`)
        process.exitCode = 1
        return
      }
    } else {
      log()
      warn("Install these first:")
      log(`  ${paint("cyan", command)}`)
      log(paint("dim", "  (or re-run with --yes to install automatically)"))
    }
  } else {
    ok("All dependencies present")
  }

  if (typesCommand) {
    if (args.includes("--yes") || args.includes("-y")) {
      log(`${paint("dim", "  running:")} ${typesCommand}`)
      try {
        execSync(typesCommand, { cwd, stdio: "inherit" })
        ok("Types installed")
      } catch {
        warn(`Could not install @types/three. Run it yourself: ${typesCommand}`)
      }
    } else {
      warn("TypeScript project — three ships no types of its own:")
      log(`  ${paint("cyan", typesCommand)}`)
    }
  }

  const componentPath = join(cwd, project.componentsDir, "liquid-hero.tsx")
  if (existsSync(componentPath) && !args.includes("--force")) {
    warn(`${relative(cwd, componentPath)} already exists, leaving it alone.`)
  } else {
    mkdirSync(dirname(componentPath), { recursive: true })
    writeFileSync(componentPath, EXAMPLE_COMPONENT)
    ok(`Created ${paint("bold", relative(cwd, componentPath))}`)
  }

  log()
  log(paint("bold", "Next:"))
  log(`  1. Drop ${paint("cyan", "<LiquidSection />")} into a page.`)
  if (project.framework === "next") {
    log(paint("dim", "     It's a client component already — no extra directive needed."))
  }
  log(`  2. Try another colourway: 90 of them, ${paint("cyan", "npx liquidforge presets")}.`)
  log(`  3. Want to own the source? ${paint("cyan", "npx liquidforge add hero")}`)
  log()
}

function commandPresets() {
  // Loaded lazily so `init` and `add` stay dependency-free.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { COLLECTIONS } = require("../presets") as typeof import("../presets")

  log()
  for (const collection of COLLECTIONS) {
    log(`  ${paint("bold", collection.name.padEnd(10))} ${paint("dim", collection.blurb)}`)
    const ids = collection.colourways
      .map((c, i) => `${collection.name.toLowerCase()}-${i + 1} ${paint("dim", c.name)}`)
      .join("   ")
    log(`  ${paint("cyan", ids)}`)
    log()
  }
}

function commandList() {
  log()
  log(paint("bold", "  Available components"))
  for (const [name, meta] of Object.entries(BUNDLES)) {
    log(`    ${paint("cyan", name.padEnd(10))} ${paint("dim", meta.description)}`)
  }
  log()
  log(paint("dim", "  npx liquidforge add hero"))
  log()
}

function commandHelp() {
  log()
  log(paint("cyan", paint("bold", "  Liquidforge")))
  log(paint("dim", "  Liquid 3D hero sections for React."))
  log()
  log(paint("bold", "  Usage"))
  log("    npx liquidforge <command> [options]")
  log()
  log(paint("bold", "  Commands"))
  log(`    ${"init".padEnd(14)} ${paint("dim", "Install deps and scaffold a hero component")}`)
  log(`    ${"add <name>".padEnd(14)} ${paint("dim", "Copy the source into your project (you own it)")}`)
  log(`    ${"presets".padEnd(14)} ${paint("dim", "List every collection and colourway")}`)
  log(`    ${"list".padEnd(14)} ${paint("dim", "Show what `add` can copy")}`)
  log()
  log(paint("bold", "  Options"))
  log(`    ${"--yes, -y".padEnd(14)} ${paint("dim", "Run the install for me")}`)
  log(`    ${"--dir, -d".padEnd(14)} ${paint("dim", "Where `add` should write files")}`)
  log(`    ${"--force".padEnd(14)} ${paint("dim", "Overwrite existing files")}`)
  log()
}

function main() {
  const [, , command, ...args] = process.argv
  const cwd = process.cwd()

  switch (command) {
    case "init":
      return commandInit(args, cwd)
    case "add":
      return commandAdd(args, cwd)
    case "presets":
      return commandPresets()
    case "list":
      return commandList()
    case "help":
    case "--help":
    case "-h":
    case undefined:
      return commandHelp()
    default:
      fail(`Unknown command "${command}".`)
      commandHelp()
      process.exitCode = 1
  }
}

main()
