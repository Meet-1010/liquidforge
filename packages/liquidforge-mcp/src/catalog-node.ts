/**
 * Where the Objaverse index comes from on Node.
 *
 * The browser fetches `/objaverse-index.json` from the Studio's `public/`
 * directory, which is not a thing that exists in a stdio subprocess. This looks
 * for the copy inside the monorepo first — so a developer running the server
 * from a checkout works offline — and otherwise pulls it from the repository
 * over HTTPS. `LIQUIDFORGE_OBJAVERSE_INDEX` overrides both.
 */

import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { configureCatalog, type ObjaverseIndex } from "liquidforge/catalog"
import { OBJAVERSE_INDEX_FALLBACK_URL } from "./constants.js"

const here = dirname(fileURLToPath(import.meta.url))

const LOCAL_CANDIDATES = [
  // dist/ -> package -> packages/ -> repo root
  resolve(here, "..", "..", "..", "apps", "studio", "public", "objaverse-index.json"),
  resolve(here, "..", "objaverse-index.json"),
]

export function configureNodeCatalog(): void {
  configureCatalog({
    loadObjaverseIndex: async () => {
      const override = process.env.LIQUIDFORGE_OBJAVERSE_INDEX
      const local = override && !/^https?:/i.test(override)
        ? [resolve(override)]
        : LOCAL_CANDIDATES

      for (const path of local) {
        if (!existsSync(path)) continue
        return JSON.parse(await readFile(path, "utf8")) as ObjaverseIndex
      }

      const url = override && /^https?:/i.test(override) ? override : OBJAVERSE_INDEX_FALLBACK_URL
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(
          `Objaverse index returned ${response.status} from ${url}. Set LIQUIDFORGE_OBJAVERSE_INDEX to a local copy to work offline.`,
        )
      }
      return (await response.json()) as ObjaverseIndex
    },
  })
}
