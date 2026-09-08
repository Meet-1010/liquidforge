/**
 * Build the Objaverse browse index.
 *
 * Objaverse ships 800k objects, but the pieces needed to browse them are
 * awkward on their own:
 *
 *   - `lvis-annotations.json.gz` (~900 KB) groups ~46k objects under 1,156
 *     human-readable categories, but records no file paths.
 *   - `object-paths.json.gz` (~20 MB) maps every uid to its shard, but is far
 *     too large to ship to a browser.
 *
 * This joins the two ahead of time and emits a compact index of just the
 * annotated subset. Each entry is a 32-char uid followed by a 3-digit shard,
 * comma-separated per category, which keeps the whole thing near 1.7 MB
 * uncompressed and lets the asset page resolve a download URL without any
 * runtime lookup.
 *
 * Objaverse uids are Sketchfab uids, so every model links back to its own
 * licence page — which is why this source can be listed without inventing a
 * licence for it.
 *
 * Usage: node scripts/build-objaverse-index.mjs
 */
import { createWriteStream } from "node:fs"
import { mkdir, readFile, writeFile, rm } from "node:fs/promises"
import { pipeline } from "node:stream/promises"
import { createGunzip } from "node:zlib"
import { Readable } from "node:stream"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "..")
const CACHE = path.join(ROOT, ".cache/objaverse")
const OUT = path.join(ROOT, "apps/studio/public/objaverse-index.json")

const BASE = "https://huggingface.co/datasets/allenai/objaverse/resolve/main"

async function fetchGunzipped(name) {
  const cached = path.join(CACHE, name.replace(".gz", ""))
  try {
    return JSON.parse(await readFile(cached, "utf8"))
  } catch {
    // Not cached yet.
  }

  process.stdout.write(`  downloading ${name}…\n`)
  const response = await fetch(`${BASE}/${name}`)
  if (!response.ok) throw new Error(`${name} -> ${response.status}`)

  await mkdir(CACHE, { recursive: true })
  await pipeline(Readable.fromWeb(response.body), createGunzip(), createWriteStream(cached))
  return JSON.parse(await readFile(cached, "utf8"))
}

async function main() {
  console.log("Building Objaverse index…")

  const [annotations, paths] = await Promise.all([
    fetchGunzipped("lvis-annotations.json.gz"),
    fetchGunzipped("object-paths.json.gz"),
  ])

  const categories = {}
  let kept = 0
  let missing = 0

  for (const [category, uids] of Object.entries(annotations)) {
    const entries = []
    for (const uid of uids) {
      const filePath = paths[uid]
      if (!filePath) {
        missing++
        continue
      }
      // "glbs/000-023/<uid>.glb" -> "023"
      const shard = filePath.split("/")[1]?.split("-")[1]
      if (!shard || shard.length !== 3) {
        missing++
        continue
      }
      entries.push(`${uid}${shard}`)
      kept++
    }
    if (entries.length > 0) categories[category] = entries.join(",")
  }

  const index = { version: 1, source: "allenai/objaverse", categories }
  await mkdir(path.dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(index))

  const bytes = JSON.stringify(index).length
  console.log(`  categories: ${Object.keys(categories).length}`)
  console.log(`  objects:    ${kept}${missing ? ` (${missing} skipped, no path)` : ""}`)
  console.log(`  written:    ${path.relative(ROOT, OUT)} (${(bytes / 1e6).toFixed(2)} MB)`)
  console.log("\nThe 20 MB path file stays in .cache/ and is gitignored; delete it to refetch.")
  void rm
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
