import { createHash } from "node:crypto"
import type { CommunityStore } from "./types"
import { defaultFileStore } from "./file-store"
import { PostgresStore, type SqlClient } from "./postgres-store"

export type { CommunityStore, NewPost, Post } from "./types"
export { FileStore } from "./file-store"
export { PostgresStore, type SqlClient } from "./postgres-store"

let store: CommunityStore | null = null

/**
 * Whichever store this deployment has.
 *
 * With `DATABASE_URL` set the app talks to Postgres; without it, to a JSON file
 * under `.data/`. Falling back rather than throwing is deliberate: cloning the
 * repo and running `npm run dev` should give you a working gallery you can post
 * to, and the moment someone deploys it the same code path picks up the real
 * database.
 */
export async function getStore(): Promise<CommunityStore> {
  if (store) return store

  const url = process.env.DATABASE_URL
  if (url) {
    /*
     * Resolved at runtime rather than imported, so a deployment that has no
     * Postgres never has to install the driver — and so this file typechecks
     * in a checkout where it is not installed, which is every checkout until
     * someone deploys.
     */
    const driver = (await import(
      /* webpackIgnore: true */ "@neondatabase/serverless" as string
    ).catch(() => null)) as { neon?: (url: string) => SqlClient } | null
    const neon = driver?.neon

    if (neon) {
      store = new PostgresStore(neon(url))
      return store
    }
    console.warn(
      "liquidforge: DATABASE_URL is set but @neondatabase/serverless is not installed — falling back to the file store.",
    )
  }

  store = defaultFileStore()
  return store
}

/**
 * A stable, anonymous handle for one submitter.
 *
 * The address is never stored. Rate limiting needs to know that two requests
 * came from the same place, and nothing more than that, so what goes in the row
 * is a salted hash — useless for identifying anyone, sufficient for counting.
 */
export function hashKey(address: string): string {
  const salt = process.env.SUBMISSION_SALT ?? "liquidforge-dev-salt"
  return createHash("sha256").update(`${salt}:${address}`).digest("hex").slice(0, 32)
}
