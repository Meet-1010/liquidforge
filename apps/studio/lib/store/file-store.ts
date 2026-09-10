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
      await mkdir(dirname(this.path), { recursive: true })
      await writeFile(this.path, JSON.stringify(next, null, 2))
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
        status: "pending",
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
