import { PLACEMENTS_ENDPOINT, type PlacementFile } from "../placement/types"

export const DEFAULT_ENDPOINT = PLACEMENTS_ENDPOINT

export type SaveResult = { ok: true; file: string } | { ok: false; error: string }

/**
 * Hand the placements to the dev server so it can write them to disk.
 *
 * The browser cannot write to your repo, so the editor cannot be the thing that
 * saves — it can only ask. If nothing is listening on the endpoint, that is
 * almost always because the dev plugin is not installed, and saying so is more
 * use than reporting a 404.
 */
export async function savePlacements(
  placements: PlacementFile,
  endpoint: string = DEFAULT_ENDPOINT,
): Promise<SaveResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(placements),
    })

    if (response.status === 404) {
      return {
        ok: false,
        error:
          `Nothing is listening at ${endpoint}. Install the save route — and note that in Next, ` +
          `a folder whose name starts with an underscore is private and never becomes a URL.`,
      }
    }

    const body = (await response.json().catch(() => ({}))) as {
      file?: string
      path?: string
      error?: string
    }
    if (!response.ok) return { ok: false, error: body.error ?? `Save failed (${response.status})` }
    // The absolute path, when the server offers it: in a monorepo "where did
    // that go" is a real question and the answer should not need guessing.
    return { ok: true, file: body.path ?? body.file ?? "liquidforge.placements.json" }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Save failed" }
  }
}
