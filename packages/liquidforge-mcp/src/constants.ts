/** Shared constants. */

export const SERVER_NAME = "liquidforge-mcp"
export const SERVER_VERSION = "0.1.0"

/** Ceiling on any single tool response, so a broad listing can't flood the context. */
export const CHARACTER_LIMIT = 25_000

export const REPO_URL = "https://github.com/Meet-1010/liquidforge"
/**
 * There is no hosted Studio yet, and there must not be a guess here: the
 * obvious domain for this name is a live site belonging to an unrelated
 * business, and `get_started` hands this to a user to click. Run it locally.
 */
export const STUDIO_HOWTO = "Run the Studio locally: clone the repo, npm install, npm run dev"

/**
 * Where the Objaverse category index comes from when the server is not running
 * inside the monorepo. Overridable with LIQUIDFORGE_OBJAVERSE_INDEX.
 */
export const OBJAVERSE_INDEX_FALLBACK_URL =
  "https://raw.githubusercontent.com/Meet-1010/liquidforge/main/apps/studio/public/objaverse-index.json"

/** Peer dependencies a host app needs before `liquidforge` will render. */
export const PEER_DEPENDENCIES = ["three"] as const
