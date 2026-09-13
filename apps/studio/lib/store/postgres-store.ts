import type { CommunityStore, NewPost, Post } from "./types"

/**
 * The production store, over any Postgres that speaks HTTP or a pool.
 *
 * Written against a `sql` tagged template rather than one vendor's client, so
 * the same file works with Neon, Supabase, Vercel Postgres or plain `pg` — the
 * caller passes whichever one it has. That keeps the choice of host a
 * deployment decision instead of an architectural one.
 *
 * The table:
 *
 * ```sql
 * create table if not exists community_posts (
 *   id            text primary key,
 *   title         text not null,
 *   author        text not null,
 *   url           text not null,
 *   object        jsonb not null,
 *   preset        text not null,
 *   created_at    timestamptz not null default now(),
 *   status        text not null default 'published',
 *   submitter_key text not null,
 *   parent_id     text references community_posts(id) on delete set null,
 *   second_parent_id text references community_posts(id) on delete set null,
 *   look          jsonb
 * );
 * create index if not exists community_posts_status_idx
 *   on community_posts (status, created_at desc);
 * create index if not exists community_posts_submitter_idx
 *   on community_posts (submitter_key, created_at desc);
 * ```
 */
export type SqlClient = <T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T[]>

interface Row {
  id: string
  title: string
  author: string
  url: string
  object: Post["object"]
  preset: string
  created_at: string | Date
  status: Post["status"]
  submitter_key: string
  parent_id: string | null
  // Optional on the type as well: a database migrated before these columns
  // existed returns rows without them, and the gallery should still read.
  second_parent_id?: string | null
  look?: Post["look"] | null
}

const toPost = (row: Row): Post => ({
  id: row.id,
  title: row.title,
  author: row.author,
  url: row.url,
  object: row.object,
  preset: row.preset,
  createdAt: new Date(row.created_at).toISOString(),
  status: row.status,
  submitterKey: row.submitter_key,
  ...(row.parent_id ? { parentId: row.parent_id } : {}),
  ...(row.second_parent_id ? { secondParentId: row.second_parent_id } : {}),
  ...(row.look ? { look: row.look } : {}),
})

export class PostgresStore implements CommunityStore {
  constructor(private readonly sql: SqlClient) {}

  async list({ status, limit, offset }: { status: Post["status"]; limit: number; offset: number }) {
    const rows = await this.sql<Row>`
      select * from community_posts
      where status = ${status}
      order by created_at desc
      limit ${limit} offset ${offset}
    `
    const [{ count }] = await this.sql<{ count: string }>`
      select count(*)::text as count from community_posts where status = ${status}
    `
    return { posts: rows.map(toPost), total: Number(count) }
  }

  async get(id: string) {
    const rows = await this.sql<Row>`select * from community_posts where id = ${id}`
    return rows[0] ? toPost(rows[0]) : null
  }

  async create(post: NewPost) {
    const id = `${post.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "untitled"}-${Date.now().toString(36)}`

    const rows = await this.sql<Row>`
      insert into community_posts
        (id, title, author, url, object, preset, status, submitter_key, parent_id, second_parent_id, look)
      values (${id}, ${post.title}, ${post.author}, ${post.url},
              ${JSON.stringify(post.object)}::jsonb, ${post.preset}, 'published',
              ${post.submitterKey}, ${post.parentId ?? null}, ${post.secondParentId ?? null},
              ${post.look ? JSON.stringify(post.look) : null}::jsonb)
      returning *
    `
    return toPost(rows[0])
  }

  async setStatus(id: string, status: Post["status"]) {
    const rows = await this.sql<Row>`
      update community_posts set status = ${status} where id = ${id} returning *
    `
    return rows[0] ? toPost(rows[0]) : null
  }

  async countRecent(submitterKey: string, since: Date) {
    const [{ count }] = await this.sql<{ count: string }>`
      select count(*)::text as count from community_posts
      where submitter_key = ${submitterKey} and created_at >= ${since.toISOString()}
    `
    return Number(count)
  }
}
