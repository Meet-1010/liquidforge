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
  /**
   * Posts go up immediately and come down if they have to.
   *
   * The other way round — nothing visible until someone approves it — is safer
   * and it is also why nobody posts: you publish into a void and check back
   * tomorrow. Every site people actually post to works this way, and the
   * moderation route exists to take something down rather than to let it up.
   */
  status: "published" | "hidden"
  /** Hashed and truncated, never the address itself — see `hashKey`. */
  submitterKey: string
  /** The post this was remixed from, when it was. */
  parentId?: string
}

export interface NewPost {
  title: string
  author: string
  url: string
  object: ObjectSource
  preset: string
  submitterKey: string
  parentId?: string
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
