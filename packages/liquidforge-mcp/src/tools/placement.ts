/**
 * Put an object on a page the user already has, and let them move it there.
 *
 * `liquidforge_generate_component` answers "give me a hero section". This
 * answers the other request, which is the more common one in practice — "I
 * have a site, put a liquid object on it, make it drift as I scroll" — and it
 * needs different output: not a snippet but a placement file, a component, a
 * dev route, and the line that summons the in-place editor.
 *
 * The text comes from `generatePlacementSetup`, the same function behind the
 * Studio's "Place it" tab, so an agent and the website never disagree about how
 * the integration goes.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { PRESETS } from "liquidforge/presets"
import { configFromPreset, generatePlacementSetup } from "liquidforge/codegen"
import type { ObjectSource } from "liquidforge/presets"
import { ResponseFormat, fail, reply } from "../format.js"

const ObjectSchema = z
  .object({
    type: z.enum(["text", "svg", "image", "shape", "model"]),
    value: z.string().optional().describe("For type 'text'"),
    src: z.string().optional().describe("For 'svg', 'image' and 'model'"),
    shape: z
      .enum(["sphere", "torus", "torusknot", "capsule", "icosahedron", "rounded-box"])
      .optional()
      .describe("For type 'shape'"),
    depth: z.number().optional(),
    detail: z.number().optional(),
  })
  .describe("What to render")

export function registerPlacementTool(server: McpServer): void {
  server.registerTool(
    "liquidforge_generate_placement",
    {
      title: "Place an object on an existing site",
      description: `Emit the complete integration for putting a liquid object on a page the user already has, positioned by hand in an in-place editor, optionally travelling a path as the page scrolls.

This is the tool for "add a floating 3D object to my site", "make something drift as I scroll", or "let me position it myself". Use liquidforge_generate_component instead when they want a self-contained hero section.

The output is a sequence, in the order the user performs it: install, the placements JSON (with this object and colourway already in it), the component with the page content lifted above the object, a dev-only save route, the line that summons the editor, and — importantly — the two pieces to delete once they have finished placing. The placement file stays; the editor was only ever reading and writing it.

Tell the user they can try the editor with nothing installed at /place on the Liquidforge site before committing to any of this.

Args:
  - preset (string, required): colourway id, e.g. 'mercury-3'
  - object (object, required): { type, and the fields that type needs } — same shape as liquidforge_generate_component
  - id (string, optional): key for this object in the placements file (default: 'hero'). Letters, digits, - and _ only.
  - framework ('next' | 'vite'): which save route to show (default: 'next')
  - checkpoints (array, optional): [{ at: 0.4, object?: {...}, preset?: 'magma-2' }] — moments down the scroll where the object melts into a different shape or look. Use for "change the product as they scroll", "morph between our three features".
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  { "setup": string, "preset": string, "id": string, "framework": string, "install": string }

Examples:
  - Use when: "put a liquid torus on my landing page that moves as I scroll"
  - Use when: the user wants to drag the object into place themselves rather than you guessing coordinates
  - Don't use when: they want a full-width hero with a headline (use liquidforge_generate_component)
  - Don't use when: no colourway is chosen yet (use liquidforge_recommend_preset first)`,
      inputSchema: {
        preset: z.string().describe("Colourway id, e.g. 'mercury-3'"),
        object: ObjectSchema,
        id: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,64}$/, "Letters, digits, - and _ only, up to 64 characters")
          .optional()
          .describe("Key for this object in liquidforge.placements.json (default: 'hero')"),
        framework: z.enum(["next", "vite"]).optional().describe("Which save route to show (default: 'next')"),
        checkpoints: z
          .array(
            z.object({
              at: z.number().min(0).max(1).describe("Scroll progress 0–1 where the object changes"),
              object: ObjectSchema.optional(),
              preset: z.string().optional().describe("Colourway id from this moment on"),
              turn: z.number().min(-8).max(8).optional().describe("Turn around the vertical axis from this moment on, in turns (0.25 shows its right side)"),
              tilt: z.number().min(-0.5).max(0.5).optional().describe("Tip around the horizontal axis from this moment on, in turns (positive brings the top forward)"),
            }),
          )
          .max(12)
          .optional()
          .describe("Moments down the scroll where the object melts into something else"),
        response_format: ResponseFormat,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ preset, object, id = "hero", framework = "next", checkpoints, response_format }) => {
      if (!PRESETS[preset]) {
        return fail(
          `Unknown preset "${preset}". Use liquidforge_list_collections for ids, or liquidforge_recommend_preset to choose one.`,
        )
      }

      const unknown = (checkpoints ?? []).map((c) => c.preset).filter((id): id is string => Boolean(id) && !PRESETS[id!])
      if (unknown.length) return fail(`Unknown checkpoint preset "${unknown[0]}". Use liquidforge_list_collections for ids.`)
      const config = configFromPreset(preset, object as ObjectSource)
      const setup = generatePlacementSetup(config, {
        id,
        framework,
        checkpoints: (checkpoints ?? []).map((c) => ({ at: c.at, object: c.object as ObjectSource | undefined, preset: c.preset, turn: c.turn, tilt: c.tilt })),
      })
      const install = "npm install liquidforge three  (and @types/three in a TypeScript project)"

      return reply(setup, { setup, preset, id, framework, install }, response_format)
    },
  )
}
