import type { ObjectSource } from "liquidforge"

/** A creation, as it lives in the store. */
export interface Post {
  id: string
  title: string
  author: string
  url: string
  object: ObjectSource
  preset: string
  createdAt: string
  /** Nothing is public until a human says so. */
  status: "pending" | "published" | "rejected"
  /** Hashed, never the address itself — see `hashKey`. */
  submitterKey: string
}

export interface NewPost {
  title: string
  author: string
  url: string
  object: ObjectSource
  preset: string
  submitterKey: string
}

/**
 * What a store has to do.
 *
 * Deliberately five methods and no query language. The gallery needs a page of
 * published posts, a moderator needs the pending ones, and submission needs a
 * rate-limit count — that is the whole product. Keeping the surface this small
 * is what lets the file-backed store used in development and a hosted database
 * used in production be the same thing behind one import, rather than the app
 * growing a dependency on one vendor's SDK.
 */
export interface CommunityStore {
  list(options: { status: Post["status"]; limit: number; offset: number }): Promise<{
    posts: Post[]
    total: number
  }>
  get(id: string): Promise<Post | null>
  create(post: NewPost): Promise<Post>
  setStatus(id: string, status: Post["status"]): Promise<Post | null>
  /** Submissions from this key since `since`. For the rate limit. */
  countRecent(submitterKey: string, since: Date): Promise<number>
}
