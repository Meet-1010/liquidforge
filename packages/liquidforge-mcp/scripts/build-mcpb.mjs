/**
 * Build the Claude Desktop extension: liquidforge-<version>.mcpb.
 *
 * A bundle carries its own node_modules, so it installs with a double-click and
 * works offline. This stages the compiled server with production dependencies
 * only — no three.js or React, which the tools never load — plus the Objaverse
 * index so model search works without a network round trip, then packs it with
 * Anthropic's MCPB CLI.
 *
 *   npm run build && node scripts/build-mcpb.mjs
 */
import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync, readdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repo = resolve(root, "..", "..")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const stage = join(root, ".mcpb-stage")
const out = join(root, "dist-mcpb")

rmSync(stage, { recursive: true, force: true })
mkdirSync(join(stage, "server"), { recursive: true })
mkdirSync(out, { recursive: true })

const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" })

// The library as it will be published, from this checkout, so the bundle and
// the npm release never disagree.
const tarball = run("npm", ["pack", "--pack-destination", stage, "--silent"], join(repo, "packages", "liquidforge")).trim().split("\n").pop()

cpSync(join(root, "dist"), join(stage, "server", "dist"), { recursive: true })
writeFileSync(
  join(stage, "server", "package.json"),
  JSON.stringify(
    {
      name: "liquidforge-mcp-bundle",
      version: pkg.version,
      private: true,
      type: "module",
      dependencies: {
        ...pkg.dependencies,
        liquidforge: `file:../${tarball}`,
      },
    },
    null,
    2,
  ),
)
run("npm", ["install", "--omit=dev", "--omit=peer", "--legacy-peer-deps", "--no-audit", "--no-fund"], join(stage, "server"))
cpSync(join(repo, "apps", "studio", "public", "objaverse-index.json"), join(stage, "server", "objaverse-index.json"))
cpSync(join(repo, "assets", "brand", "icon-512.png"), join(stage, "icon.png"))
writeFileSync(
  join(stage, "manifest.json"),
  readFileSync(join(root, "mcpb", "manifest.template.json"), "utf8").replaceAll("{{version}}", pkg.version),
)
rmSync(join(stage, tarball))

// Nothing the tools never load: three and React are peers of the library, and
// source maps, type declarations, TypeScript sources and readmes are for
// editors, not for Node. They were over a third of the unpacked bundle.
for (const name of ["three", "@types", "react", "react-dom"]) {
  rmSync(join(stage, "server", "node_modules", name), { recursive: true, force: true })
}
const unused = /(\.map|\.d\.[cm]?ts|(?<!\.d)\.[cm]?ts|\.md|\.markdown)$/i
const prune = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "src" && dir.endsWith(join("node_modules", "liquidforge"))) rmSync(path, { recursive: true, force: true })
      else prune(path)
    } else if (unused.test(entry.name) && !/^licen[cs]e/i.test(entry.name)) {
      rmSync(path)
    }
  }
}
prune(join(stage, "server", "node_modules"))

const file = join(out, `liquidforge-${pkg.version}.mcpb`)
run("npx", ["-y", "@anthropic-ai/mcpb@latest", "validate", join(stage, "manifest.json")], root)
run("npx", ["-y", "@anthropic-ai/mcpb@latest", "pack", stage, file], root)
console.log(`${file} — ${(statSync(file).size / 1_048_576).toFixed(1)} MB`)
