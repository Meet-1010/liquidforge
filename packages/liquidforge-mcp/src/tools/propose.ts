/**
 * Hand a placement to a person instead of writing it.
 *
 * An agent cannot see a web page. It can decide what the object should be and
 * roughly where it belongs, but it cannot tell whether that covers the
 * headline — and a placement written straight into the repo on that basis is a
 * guess someone has to find and fix. So this writes a *proposal* beside the
 * placements file. The in-place editor, next time it opens on that page, loads
 * it as an unsaved draft with a banner, routes it through the page's empty
 * space if asked (only the browser knows where the text is), and it becomes
 * the placement only when the person presses save.
 */

import { existsSync, readdirSync, statSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { PRESETS } from "liquidforge/presets"
import { writeProposal } from "liquidforge/dev"
import type { ObjectSource } from "liquidforge/presets"
import { ResponseFormat, fail, reply } from "../format.js"

const ObjectSchema = z
  .object({
    type: z.enum(["text", "svg", "image", "shape", "model"]),
    value: z.string().optional(),
    src: z.string().optional(),
    shape: z.enum(["sphere", "torus", "torusknot", "capsule", "icosahedron", "rounded-box"]).optional(),
    depth: z.number().optional(),
    detail: z.number().optional(),
  })
  .describe("What to render")

/** The nearest existing placements file under `root`, shallow and skipping build output. */
function findPlacementsFile(root: string, depth = 4): string | null {
  const skip = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo", ".vercel"])
  const queue: Array<{ dir: string; level: number }> = [{ dir: root, level: 0 }]
  while (queue.length) {
    const { dir, level } = queue.shift()!
    const candidate = join(dir, "liquidforge.placements.json")
    if (existsSync(candidate)) return candidate
    if (level >= depth) continue
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (skip.has(entry) || entry.startsWith(".")) continue
      const path = join(dir, entry)
      try {
        if (statSync(path).isDirectory()) queue.push({ dir: path, level: level + 1 })
      } catch {
        /* unreadable; skip */
      }
    }
  }
  return null
}

export function registerProposeTool(server: McpServer): void {
  server.registerTool(
    "liquidforge_propose_placement",
    {
      title: "Propose a placement for a person to approve",
      description: `Leave a placement for the user to review in the in-place editor, instead of writing it into their repo.

Use this whenever you are placing an object on a page you cannot see — which is always. It writes liquidforge.proposal.json beside their liquidforge.placements.json. The next time the editor opens on that page (it opens automatically when a proposal is waiting), the proposal appears as an unsaved draft with a banner. With route: "whitespace", the editor first draws the scroll path through the empty space between the page's real content, keeping any checkpoints. Nothing is written to the placements file until the user presses Save.

Requires the page to already have <LiquidSpot id="..."> and <LiquidEditor /> set up — use liquidforge_generate_placement for that first.

Args:
  - id (string, required): the LiquidSpot id this is for
  - preset (string, required): colourway id
  - object (object, required): what it is
  - route ('whitespace' | 'none'): let the editor route it around the page's content (default: 'whitespace')
  - checkpoints (array, optional): [{ at, object?, preset? }] — moments where it melts into something else
  - note (string, optional): one sentence for the banner, e.g. why you chose this
  - placements_file (string, optional): path to liquidforge.placements.json; found automatically under the working directory otherwise
  - response_format ('markdown' | 'json')

Returns:
  { "proposal": string (path written), "id": string, "next": string }`,
      inputSchema: {
        id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
        preset: z.string(),
        object: ObjectSchema,
        route: z.enum(["whitespace", "none"]).optional(),
        checkpoints: z
          .array(z.object({ at: z.number().min(0).max(1), object: ObjectSchema.optional(), preset: z.string().optional() }))
          .max(12)
          .optional(),
        note: z.string().max(240).optional(),
        placements_file: z.string().optional(),
        response_format: ResponseFormat,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, preset, object, route = "whitespace", checkpoints = [], note, placements_file, response_format }) => {
      if (!PRESETS[preset]) return fail(`Unknown preset "${preset}". Use liquidforge_list_collections for ids.`)
      const bad = checkpoints.map((c) => c.preset).find((p) => p && !PRESETS[p])
      if (bad) return fail(`Unknown checkpoint preset "${bad}".`)

      const file = placements_file
        ? isAbsolute(placements_file)
          ? placements_file
          : resolve(process.cwd(), placements_file)
        : (findPlacementsFile(process.cwd()) ?? join(process.cwd(), "liquidforge.placements.json"))

      const moments = [...checkpoints].sort((a, b) => a.at - b.at)
      const placement = {
        frame: "viewport" as const,
        origin: { x: 0.74, y: 0.34, size: 0.3 },
        layer: 0,
        object: object as ObjectSource,
        preset,
        ...(moments.length
          ? {
              path: {
                ease: 0.1,
                morph: 0.06,
                points: [
                  { x: 0.74, y: 0.34, size: 0.3 },
                  ...moments.map((m, i) => ({
                    x: i % 2 === 0 ? 0.3 : 0.74,
                    y: 0.34 + 0.3 * m.at,
                    at: m.at,
                    ...(m.object ? { object: m.object as ObjectSource } : {}),
                    ...(m.preset ? { preset: m.preset } : {}),
                  })),
                  { x: 0.5, y: 0.5, size: 0.26 },
                ],
              },
            }
          : {}),
      }

      try {
        const written = await writeProposal(
          { id, placement, ...(route === "whitespace" ? { route: "whitespace" as const } : {}), ...(note ? { note } : {}) },
          { file, allowInProduction: true },
        )
        const next = `Ask the user to open the page with <LiquidSpot id="${id}"> in their dev server. The editor opens on the proposal by itself; they adjust and press Save, or Discard.`
        return reply(
          `Proposal written to \`${written}\`.\n\n${next}`,
          { proposal: written, id, next },
          response_format,
        )
      } catch (error) {
        return fail(error instanceof Error ? error.message : "Could not write the proposal")
      }
    },
  )
}
