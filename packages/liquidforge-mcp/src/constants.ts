/** Shared constants. */

export const SERVER_NAME = "liquidforge-mcp"
export const SERVER_VERSION = "0.1.0"

/** Ceiling on any single tool response, so a broad listing can't flood the context. */
export const CHARACTER_LIMIT = 25_000

export const REPO_URL = "https://github.com/Meet-1010/liquidforge"
export const STUDIO_URL = "https://liquidforge.dev"

/** Peer dependencies a host app needs before `liquidforge` will render. */
export const PEER_DEPENDENCIES = ["three"] as const
