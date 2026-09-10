/**
 * Moves posts out of the local `.data/community.json` and into `DATABASE_URL`.
 *
 * The file store is what runs before anyone connects a database, so by the time
 * the database arrives there are usually real posts sitting in the file. This
 * carries them across. Ids are preserved and inserts are `on conflict do
 * nothing`, so re-running it imports only what is missing.
 *
 * Rows whose status is neither `published` nor `hidden` are skipped: those are
 * leftovers from an older moderation model that no longer exists.
 *
 *   npm run db:import --workspace=@liquidforge/studio
 */
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

if (!process.env.DATABASE_URL) {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] ??= match[2]
  }
}

const sql = neon(process.env.DATABASE_URL)
const raw = JSON.parse(readFileSync(new URL("../.data/community.json", import.meta.url), "utf8"))
const posts = Array.isArray(raw) ? raw : (raw.posts ?? [])

let imported = 0
let skipped = 0

for (const post of posts) {
  if (post.status !== "published" && post.status !== "hidden") {
    console.log("– skipped", post.id, `(status "${post.status}")`)
    skipped += 1
    continue
  }
  const rows = await sql`
    insert into community_posts (id, title, author, url, object, preset, created_at, status, submitter_key, parent_id)
    values (${post.id}, ${post.title}, ${post.author}, ${post.url ?? ""},
            ${JSON.stringify(post.object)}::jsonb, ${post.preset},
            ${post.createdAt ?? new Date().toISOString()}, ${post.status},
            ${post.submitterKey ?? "imported"}, ${post.parentId ?? null})
    on conflict (id) do nothing
    returning id
  `
  if (rows.length) {
    console.log("✓ imported", post.id)
    imported += 1
  } else {
    console.log("– already there", post.id)
    skipped += 1
  }
}

console.log(`\n${imported} imported, ${skipped} skipped`)
