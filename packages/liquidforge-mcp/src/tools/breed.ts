/**
 * Two colourways, crossed.
 *
 * For "something between mercury and magma", or "more like these two" — the
 * children are real colourways: every gene from one parent or the other or in
 * between, nudged a little, the family and the silhouette each taken whole
 * from one side. Deterministic by seed, so asking again with the same seed
 * returns the same litter.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { PRESETS } from "liquidforge/presets"
import { litter } from "liquidforge/breed"
import { configFromPreset, generateCode } from "liquidforge/codegen"
import type { ObjectSource } from "liquidforge/presets"
import { ResponseFormat, fail, reply } from "../format.js"

export function registerBreedTool(server: McpServer): void {
  server.registerTool(
    "liquidforge_breed_presets",
    {
      title: "Breed two colourways",
      description: `Cross two colourways into a litter of children that sit around both parents.

Use when the user likes two looks and wants something between or beyond them, or when no single colourway fits and two are close.

Args:
  - a (string, required): first parent colourway id
  - b (string, required): second parent colourway id
  - count (number): children, 1–8 (default 4)
  - mutation (number): how far children wander, 0–1 (default 0.15)
  - seed (number, optional): repeat a litter exactly
  - response_format ('markdown' | 'json')

Returns:
  { "seed": number, "children": [{ "family", "palette", "surface", "shading", "component" }] }`,
      inputSchema: {
        a: z.string(),
        b: z.string(),
        count: z.number().int().min(1).max(8).optional(),
        mutation: z.number().min(0).max(1).optional(),
        seed: z.number().int().optional(),
        response_format: ResponseFormat,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ a, b, count = 4, mutation = 0.15, seed, response_format }) => {
      if (!PRESETS[a]) return fail(`Unknown preset "${a}".`)
      if (!PRESETS[b]) return fail(`Unknown preset "${b}".`)
      const actualSeed = seed ?? Math.floor(Math.random() * 1e9)
      const object: ObjectSource = { type: "shape", shape: "torusknot", detail: 160 }
      const kids = litter({ preset: PRESETS[a], object }, { preset: PRESETS[b], object }, count, actualSeed, { mutation })

      const children = kids.map((child) => {
        // Start from a real config for whichever parent gave the family, then
        // lay the child's genes over it — generateCode writes only what differs.
        const parent = child.lineage.family === "a" ? a : b
        const component = generateCode({
          ...configFromPreset(parent, object),
          family: child.preset.family,
          palette: child.preset.palette,
          surface: child.preset.surface,
          shading: child.preset.shading,
        })
        return {
          family: child.preset.family,
          palette: child.preset.palette,
          surface: child.preset.surface,
          shading: child.preset.shading,
          component,
        }
      })

      const markdown = [
        `Seed \`${actualSeed}\` — pass it back to get this litter again.`,
        "",
        ...children.flatMap((child, i) => [
          `## Child ${i + 1} · ${child.family}`,
          "",
          child.palette.map((hex) => `\`${hex}\``).join(" "),
          "",
          "```tsx",
          child.component,
          "```",
          "",
        ]),
      ].join("\n")
      return reply(markdown, { seed: actualSeed, children }, response_format)
    },
  )
}
