/**
 * Creates the community tables on whatever `DATABASE_URL` points at.
 *
 * Every statement is `if not exists`, so running this twice is a no-op and
 * running it against a database that is already live cannot lose a row. That
 * matters more than it sounds: this is the script someone runs when they are
 * not sure whether they ran it, and it should be safe to just run again.
 *
 *   npm run db:migrate --workspace=@liquidforge/studio
 */
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

// Next.js loads .env.local for us; a bare `node` run has to do it itself.
if (!process.env.DATABASE_URL) {
  try {
    for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
      const match = /^([A-Z_]+)=(.*)$/.exec(line.trim())
      if (match) process.env[match[1]] ??= match[2]
    }
  } catch {
    /* no .env.local; fall through to the error below */
  }
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. Put it in apps/studio/.env.local, or export it.")
  process.exit(1)
}

const sql = neon(url)

const statements = [
  `create table if not exists community_posts (
     id            text primary key,
     title         text not null,
     author        text not null,
     url           text not null,
     object        jsonb not null,
     preset        text not null,
     created_at    timestamptz not null default now(),
     status        text not null default 'published',
     submitter_key text not null,
     parent_id     text references community_posts(id) on delete set null
   )`,
  // The gallery reads published posts newest-first and nothing else, so this
  // one index answers the only query that runs on every page load.
  `create index if not exists community_posts_status_idx
     on community_posts (status, created_at desc)`,
  // Rate limiting counts one submitter's last hour.
  `create index if not exists community_posts_submitter_idx
     on community_posts (submitter_key, created_at desc)`,
  // Remixes hang off their parent; the gallery shows the count on a card.
  `create index if not exists community_posts_parent_idx
     on community_posts (parent_id)`,
]

for (const statement of statements) {
  // `sql` is a tagged template; a plain string goes through `.query`.
  await sql.query(statement)
  console.log("✓", statement.split("\n")[0].trim())
}

const [{ count }] = await sql`select count(*)::text as count from community_posts`
const [{ size }] = await sql`
  select pg_size_pretty(pg_total_relation_size('community_posts')) as size
`
console.log(`\ncommunity_posts: ${count} row(s), ${size} on disk`)
