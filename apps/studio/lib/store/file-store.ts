import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { CommunityStore, NewPost, Post } from "./types"

/**
 * A JSON file behind a serialised write queue.
 *
 * This is the development store and it is honest about being one: a single file
 * with a mutex around it is fine for one process and wrong for several, which
 * is exactly the line where you should move to Postgres. It exists so the whole
 * feature — submit, moderate, publish, paginate — can be built and tested
 * without anyone needing a database account first.
 */
/**
 * Why the file store could not write, in terms of the actual decision.
 *
 * A serverless function's filesystem is read-only apart from /tmp, and /tmp
 * does not survive between invocations — so falling back to it would turn a
 * loud failure into posts that vanish an hour later, which is worse. The only
 * real answer on that kind of host is a database.
 */
function cannotWrite(path: string, cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause)
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) || path.startsWith("/var/task")

  if (serverless) {
    return (
      "The gallery has no database, so it fell back to writing a file — and this host's filesystem is read-only. " +
      "Set DATABASE_URL to a Postgres connection string and redeploy. " +
      `(${detail})`
    )
  }
  return `Could not write the gallery file at ${path}. Set DATABASE_URL to use Postgres instead. (${detail})`
}

export class FileStore implements CommunityStore {
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly path: string) {}

  private async read(): Promise<Post[]> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as Post[]
    } catch {
      return []
    }
  }

  /** Serialised, so two submissions arriving together cannot lose one. */
  private write<T>(fn: (posts: Post[]) => Promise<[Post[], T]> | [Post[], T]): Promise<T> {
    const run = async (): Promise<T> => {
      const posts = await this.read()
      const [next, result] = await fn(posts)
      try {
        await mkdir(dirname(this.path), { recursive: true })
        await writeFile(this.path, JSON.stringify(next, null, 2))
      } catch (error) {
        // The raw failure here is `ENOENT ... mkdir '/var/task/.../.data'`,
        // which names a directory and not the reason, and sends whoever reads
        // it looking for a missing folder. The reason is always the same one.
        throw new Error(cannotWrite(this.path, error))
      }
      return result
    }
    const chained = this.queue.then(run, run)
    this.queue = chained.catch(() => {})
    return chained
  }

  async list({ status, limit, offset }: { status: Post["status"]; limit: number; offset: number }) {
    const all = (await this.read())
      .filter((post) => post.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { posts: all.slice(offset, offset + limit), total: all.length }
  }

  async get(id: string) {
    return (await this.read()).find((post) => post.id === id) ?? null
  }

  async create(post: NewPost) {
    return this.write((posts) => {
      const created: Post = {
        ...post,
        id: `${slug(post.title)}-${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        status: "published",
      }
      return [[created, ...posts], created]
    })
  }

  async setStatus(id: string, status: Post["status"]) {
    return this.write((posts) => {
      const found = posts.find((post) => post.id === id)
      if (!found) return [posts, null]
      const updated = { ...found, status }
      return [posts.map((post) => (post.id === id ? updated : post)), updated]
    })
  }

  async countRecent(submitterKey: string, since: Date) {
    const cutoff = since.toISOString()
    return (await this.read()).filter(
      (post) => post.submitterKey === submitterKey && post.createdAt >= cutoff,
    ).length
  }
}

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "untitled"
  )
}

export const defaultFileStore = () =>
  new FileStore(join(process.cwd(), ".data", "community.json"))
