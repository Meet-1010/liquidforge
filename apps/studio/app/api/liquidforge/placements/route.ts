import { createPlacementsRoute } from "liquidforge/dev"

/**
 * Where the in-place editor saves.
 *
 * Three lines, because the whole handler ships with the library — validation,
 * the merge with what is already on disk, and the refusal to run in production
 * all live there rather than being re-implemented per app.
 */
// No `file` given: the default is "liquidforge.placements.json" relative to the
// dev server's cwd, which for this app is apps/studio — exactly where it goes.
export const { POST } = createPlacementsRoute()

export const dynamic = "force-dynamic"
