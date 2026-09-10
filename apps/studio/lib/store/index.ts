import { createHash } from "node:crypto"
import { neon } from "@neondatabase/serverless"
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
     * A plain import, deliberately.
     *
     * This used to be a dynamic `import()` marked `webpackIgnore` with a
     * `.catch(() => null)` around it, so that a checkout without the driver
     * would still typecheck. The cost of that cleverness was a store that fell
     * back to a file for *any* reason at all and reported the same sentence
     * about the package not being installed — including when the package was
     * installed and something else was wrong. The driver is a dependency of
     * this app; importing it like one removes the whole question.
     */
    try {
      /*
       * Neon's own type carries its result-shape generics, which do not line up
       * with the vendor-neutral `SqlClient` this store is written against. The
       * runtime contract is identical — a tagged template that returns rows —
       * so the cast sits at this one boundary rather than making PostgresStore
       * depend on one vendor's types, which is the thing it exists not to do.
       */
      store = new PostgresStore(neon(url) as unknown as SqlClient)
      return store
    } catch (error) {
      // Never silently. A gallery quietly running on a file instead of the
      // database is the failure that wastes the most time, because everything
      // works until it is deployed.
      console.error(
        "liquidforge: DATABASE_URL is set but the Postgres client could not be created — falling back to the file store.",
        error,
      )
    }
  }

  /*
   * Serverless hosts have a read-only filesystem, so the file-store fallback
   * cannot work there — and finding that out when the first person tries to
   * post is too late. Say it at boot, where it lands in the deploy log.
   */
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    console.error(
      "liquidforge: DATABASE_URL is not set. This host's filesystem is read-only, so posting to the community gallery will fail until it is.",
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
  // Sixteen hex characters is 64 bits: far more than enough to bucket requests
  // for an hour, and half the bytes of the row it sits in.
  return createHash("sha256").update(`${salt}:${address}`).digest("hex").slice(0, 16)
}
