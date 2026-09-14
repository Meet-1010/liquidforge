/** Shared constants. */

export const SERVER_NAME = "liquidforge-mcp"
export const SERVER_VERSION = "0.2.1"

/** Ceiling on any single tool response, so a broad listing can't flood the context. */
export const CHARACTER_LIMIT = 25_000

/**
 * The public site. The source repository is private, so every link a user is
 * handed — in get_started, in the help text, in the directory listing — points
 * here, where the documentation, the Studio and the privacy policy all live.
 */
export const SITE_URL = "https://liquidforge-pi.vercel.app"
export const REPO_URL = SITE_URL
export const STUDIO_HOWTO = `Open the Studio at ${SITE_URL}/studio — forge an object, tune the material, copy the component`

/**
 * Where the Objaverse category index comes from when the server is not running
 * inside the monorepo. Overridable with LIQUIDFORGE_OBJAVERSE_INDEX.
 */
export const OBJAVERSE_INDEX_FALLBACK_URL = `${SITE_URL}/objaverse-index.json`

/** Peer dependencies a host app needs before `liquidforge` will render. */
export const PEER_DEPENDENCIES = ["three"] as const
