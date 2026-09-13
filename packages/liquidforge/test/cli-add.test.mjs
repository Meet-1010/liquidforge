/**
 * `npx liquidforge add` has to produce source that compiles.
 *
 * It did not. The bundles were hand-kept lists of directories, every module
 * added after the list was written got left behind, and `add hero` wrote nine
 * imports pointing at files it never copied. Nothing noticed, because the only
 * thing that exercised it was a person after installing — so this is that
 * person, run on every test.
 *
 * For each bundle: eject into a temp project, then check every relative import
 * in what was written resolves to a file that was also written. An import that
 * does not resolve in the library's own source either is not a real import
 * (it is inside a doc comment or a generated-code string) and is ignored.
 *
 *   node test/cli-add.test.mjs      (after npm run build)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, normalize, relative } from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const cli = join(packageRoot, "dist", "cli.cjs")
const source = join(packageRoot, "src")

let pass = 0
let fail = 0
const ok = (name, condition, detail = "") => {
  condition ? pass++ : fail++
  console.log(`${condition ? "  ok" : "FAIL"}  ${name}${detail ? `  → ${detail}` : ""}`)
}

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })

const resolvesIn = (base) =>
  ["", ".ts", ".tsx", "/index.ts", "/index.tsx"].some((ext) => existsSync(base + ext) && statSync(base + ext).isFile())

if (!existsSync(cli)) {
  console.log("FAIL  dist/cli.cjs is missing — run npm run build first")
  process.exit(1)
}

for (const bundle of ["hero", "editor", "material", "forge"]) {
  const project = mkdtempSync(join(tmpdir(), `lf-add-${bundle}-`))
  try {
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "x", dependencies: { next: "15", react: "19", three: "0.172" } }))
    mkdirSync(join(project, "app"))

    try {
      execFileSync(process.execPath, [cli, "add", bundle], { cwd: project, stdio: "pipe" })
    } catch (error) {
      ok(`add ${bundle} writes a self-contained tree`, false, `the command itself failed (exit ${error.status})`)
      continue
    }

    const out = join(project, "components", "liquidforge")
    const written = walk(out).filter((file) => /\.(ts|tsx)$/.test(file))
    const broken = []

    for (const file of written) {
      const text = readFileSync(file, "utf8")
      for (const match of text.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
        const target = normalize(join(dirname(file), match[1]))
        if (resolvesIn(target)) continue
        // Only count it if the library itself has that file — otherwise it was
        // never a real import.
        const inSource = normalize(join(source, relative(out, target)))
        if (resolvesIn(inSource)) broken.push(`${relative(out, file)} → ${match[1]}`)
      }
    }

    ok(`add ${bundle} writes a self-contained tree`, broken.length === 0, broken.length ? broken.slice(0, 3).join("; ") : `${written.length} files`)
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
}

// A second run into the same place must refuse rather than overwrite.
{
  const project = mkdtempSync(join(tmpdir(), "lf-add-twice-"))
  try {
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "x", dependencies: { next: "15" } }))
    execFileSync(process.execPath, [cli, "add", "forge"], { cwd: project, stdio: "pipe" })
    let refused = false
    try {
      execFileSync(process.execPath, [cli, "add", "forge"], { cwd: project, stdio: "pipe" })
    } catch {
      refused = true
    }
    ok("add refuses to overwrite without --force", refused)
  } finally {
    rmSync(project, { recursive: true, force: true })
  }
}

// Unknown commands and bundles must fail loudly, so a script notices.
{
  let code = 0
  try {
    execFileSync(process.execPath, [cli, "frobnicate"], { stdio: "pipe" })
  } catch (error) {
    code = error.status
  }
  ok("an unknown command exits non-zero", code !== 0, `exit ${code}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
