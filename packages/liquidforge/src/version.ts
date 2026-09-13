declare const __LIQUIDFORGE_VERSION__: string | undefined

/**
 * The published version, written in at build time from package.json.
 *
 * Generated embed snippets pin to it, so a page pasted today keeps loading the
 * build it was made with rather than whatever is newest on the day it is next
 * visited. Read from a build-time constant rather than by importing
 * package.json, which sits outside `src` and would drag the whole manifest into
 * every bundle.
 */
export const VERSION: string =
  typeof __LIQUIDFORGE_VERSION__ === "string" ? __LIQUIDFORGE_VERSION__ : "0.0.0-dev"
