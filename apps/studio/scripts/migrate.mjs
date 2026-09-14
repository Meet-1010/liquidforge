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
  // Breeding: a second parent, and the look itself — a bred or tuned colourway
  // is not one of the named presets, so the id alone cannot carry it. Both are
  // added columns, nullable, so every existing row stays exactly as it was.
  `alter table community_posts
     add column if not exists second_parent_id text references community_posts(id) on delete set null`,
  `alter table community_posts add column if not exists look jsonb`,
  `create index if not exists community_posts_second_parent_idx
     on community_posts (second_parent_id)`,
  // Today's object: the UTC day a post answers, so the gallery can show a day's
  // worth side by side.
  `alter table community_posts add column if not exists daily text`,
  // The contact form: questions, bug reports and privacy requests. A salted
  // hash of the sender's address for rate limiting, never the address.
  `create table if not exists contact_messages (
     id            bigserial primary key,
     created_at    timestamptz not null default now(),
     topic         text not null,
     message       text not null,
     reply_to      text,
     submitter_key text not null
   )`,
  `create index if not exists contact_messages_submitter_idx
     on contact_messages (submitter_key, created_at desc)`,
  `create index if not exists community_posts_daily_idx
     on community_posts (daily, created_at desc) where daily is not null`,
  // Moving links: a look and the looping GIF made from it in the sharer's
  // browser, so a pasted link unfurls moving. The GIF is the only large thing
  // in the database, so it is capped in total and the least recently viewed
  // are dropped first; the look stays, and the link falls back to a still.
  `create table if not exists moving_links (
     id             text primary key,
     created_at     timestamptz not null default now(),
     title          text not null,
     object         jsonb not null,
     preset         text not null,
     width          int not null,
     height         int not null,
     gif            bytea,
     gif_bytes      int not null default 0,
     last_viewed_at timestamptz not null default now(),
     submitter_key  text not null
   )`,
  `create index if not exists moving_links_submitter_idx
     on moving_links (submitter_key, created_at desc)`,
  `create index if not exists moving_links_viewed_idx
     on moving_links (last_viewed_at) where gif is not null`,
  // Creator packs: a handle, claimed with an edit key that is stored only as a
  // hash, and the looks published under it. Uses are counted when someone
  // takes a look's code, which is the credit a pack earns.
  `create table if not exists creator_packs (
     handle        text primary key,
     name          text not null,
     key_hash      text not null,
     created_at    timestamptz not null default now(),
     submitter_key text not null
   )`,
  `create index if not exists creator_packs_submitter_idx
     on creator_packs (submitter_key, created_at desc)`,
  `create table if not exists pack_looks (
     handle     text not null references creator_packs(handle) on delete cascade,
     slug       text not null,
     title      text not null,
     preset     text not null,
     look       jsonb not null,
     uses       int not null default 0,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     primary key (handle, slug)
   )`,
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
