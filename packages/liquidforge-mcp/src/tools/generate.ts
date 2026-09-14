/**
 * Turn an explicit configuration into paste-ready TSX.
 *
 * Shares `generateCode` with the Studio's copy button, so the code an agent
 * hands you is byte-identical to the code the site hands you.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { PRESETS } from "liquidforge/presets"
import { configFromPreset, generateCode, generateEmbed } from "liquidforge/codegen"
import type { ObjectSource, Quality } from "liquidforge/presets"
import { ResponseFormat, fail, reply } from "../format.js"

const ObjectSchema = z
  .object({
    type: z.enum(["text", "svg", "image", "shape", "model"]),
    value: z.string().optional().describe("For type 'text'"),
    src: z.string().optional().describe("For 'svg', 'image' and 'model'"),
    markup: z.string().optional().describe("For 'svg', as an alternative to src"),
    shape: z
      .enum(["sphere", "torus", "torusknot", "capsule", "icosahedron", "rounded-box"])
      .optional()
      .describe("For type 'shape'"),
    depth: z.number().optional(),
    detail: z.number().optional(),
  })
  .describe("What to render")

export function registerGenerateTool(server: McpServer): void {
  server.registerTool(
    "liquidforge_generate_component",
    {
      title: "Generate the component",
      description: `Emit a paste-ready React component — or, for a site with no React, a Webflow, Framer or plain HTML embed — for an explicit configuration.

Only what differs from the named colourway is written out, so the snippet stays short instead of restating twenty numbers the reader did not change.

Args:
  - preset (string, required): colourway id, e.g. 'mercury-3'
  - object (object, required): { type, and the fields that type needs }
      text  -> { type: 'text', value: 'SHIP IT', depth?: 0.45 }
      shape -> { type: 'shape', shape: 'torusknot', detail?: 128 }
      svg   -> { type: 'svg', src?: '/logo.svg', markup?: '<svg .../>' }
      image -> { type: 'image', src: '/logo.png' }
      model -> { type: 'model', src: '/model.glb' }
  - component ('hero' | 'canvas'): the section with a content slot, or the bare surface (default: 'hero')
  - blend (boolean): invert the headline against the liquid (default: false)
  - quality ('auto' | 'high' | 'balanced' | 'low'): default 'auto'
  - palette (string[], optional): override the colourway's colours
  - import_from (string, optional): import path, for ejected source (default: 'liquidforge')
  - target ('react' | 'webflow' | 'framer' | 'html'): what the site is built with (default: 'react').
      webflow/html -> a <script> tag plus a <liquid-forge> element; framer -> a code component file
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  { "component": string, "preset": string, "install": string }

Examples:
  - Use when: the user has picked a colourway and you are writing the file
  - Use when: they ejected the source and need the import path changed
  - Use when: the site is Webflow, Framer, WordPress or plain HTML (set target)
  - Don't use when: you have not chosen a colourway yet (use liquidforge_recommend_preset)`,
      inputSchema: {
        preset: z.string().describe("Colourway id, e.g. 'mercury-3'"),
        object: ObjectSchema,
        component: z.enum(["hero", "canvas"]).default("hero"),
        blend: z.boolean().default(false),
        quality: z.enum(["auto", "high", "balanced", "low"]).default("auto"),
        palette: z.array(z.string()).optional(),
        import_from: z.string().default("liquidforge"),
        target: z.enum(["react", "webflow", "framer", "html"]).default("react"),
        response_format: ResponseFormat,
      },
    },
    async ({ preset, object, component, blend, quality, palette, import_from, target, response_format }) => {
      if (!PRESETS[preset]) {
        return fail(
          `Unknown preset "${preset}". Call liquidforge_list_collections for the 108 ids.`,
        )
      }

      const source = Object.fromEntries(
        Object.entries(object).filter(([, value]) => value !== undefined),
      ) as unknown as ObjectSource

      const config = {
        ...configFromPreset(preset, source),
        blend,
        quality: quality as Quality,
        ...(palette ? { palette } : {}),
      }

      if (target !== "react") {
        const embed = generateEmbed(config, { target })
        const language = target === "framer" ? "tsx" : "html"
        const install =
          target === "framer"
            ? "Nothing to install: paste as a Framer code component; it loads the element from jsDelivr."
            : "Nothing to install: the <script> tag loads the element from jsDelivr."
        return reply(["```" + language, embed, "```", "", install].join("\n"), { component: embed, preset, target, install }, response_format)
      }

      const code = generateCode(config, { component, importFrom: import_from })
      const markdown = ["```tsx", code, "```"].join("\n")

      return reply(
        markdown,
        { component: code, preset, install: "npm install liquidforge three  (and @types/three in a TypeScript project)" },
        response_format,
      )
    },
  )
}
