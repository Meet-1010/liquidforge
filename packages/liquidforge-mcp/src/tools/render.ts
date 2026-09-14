/**
 * Let the agent see what it made.
 *
 * Every other tool describes a look in numbers. An agent choosing between two
 * colourways, or checking that a palette read from a website actually works on
 * the object, is guessing until it can look — so this renders the look to a PNG
 * with the browser already installed on the machine and returns the image.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { z } from "zod"
import { PRESETS } from "liquidforge/presets"
import { configFromPreset, elementAttributes } from "liquidforge/codegen"
import type { ObjectSource } from "liquidforge/presets"
import { ObjectSchema } from "./generate.js"
import { renderPng } from "../render.js"

export function registerRenderTool(server: McpServer): void {
  server.registerTool(
    "liquidforge_render",
    {
      title: "Render a look to an image",
      description: `Render a colourway on an object to a PNG and return the image, so you can see the result before writing code.

Uses a Chromium-based browser already installed on this machine (Chrome, Edge, Brave or Chromium), headless. Nothing is uploaded. Set LIQUIDFORGE_BROWSER to a browser path if one is not found.

Args:
  - preset (string, required): colourway id, e.g. 'ferrofluid-2'
  - object (object, required): as for liquidforge_generate_component
  - palette (string[], optional): override the colours
  - width, height (number): pixels, 256–2048 (default 1200 × 750)
  - pointer ({ x, y }, optional): hover here first, -1..1 across the frame, to show the surface reacting — ripples, or ferrofluid spikes
  - transparent (boolean): render without a background (default false)
  - save_to (string, optional): also write the PNG to this path

Returns: the PNG as image content, plus a line of text describing it.

Examples:
  - Use when: comparing two colourways for the user, or checking a palette from liquidforge_palette_from_url on their logo
  - Don't use when: the user only needs the code`,
      inputSchema: {
        preset: z.string(),
        object: ObjectSchema,
        palette: z.array(z.string()).optional(),
        width: z.number().int().min(256).max(2048).default(1200),
        height: z.number().int().min(256).max(2048).default(750),
        pointer: z.object({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1) }).optional(),
        transparent: z.boolean().default(false),
        save_to: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ preset, object, palette, width, height, pointer, transparent, save_to }) => {
      if (!PRESETS[preset]) {
        return { content: [{ type: "text" as const, text: `Unknown preset "${preset}". Call liquidforge_list_collections for the ids.` }], isError: true }
      }
      const source = Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined)) as unknown as ObjectSource
      const config = { ...configFromPreset(preset, source), ...(palette ? { palette } : {}), transparent }
      try {
        const png = await renderPng({ attributes: elementAttributes(config), width, height, transparent, pointer })
        let saved = ""
        if (save_to) {
          const path = resolve(save_to)
          writeFileSync(path, png)
          saved = ` Saved to ${path}.`
        }
        return {
          content: [
            { type: "image" as const, data: png.toString("base64"), mimeType: "image/png" },
            {
              type: "text" as const,
              text: `${PRESETS[preset].label} on ${source.type === "text" ? `"${source.value}"` : source.type === "shape" ? `a ${source.shape}` : `a ${source.type}`}, ${width}×${height}${pointer ? ", with the pointer on it" : ""}.${saved}`,
            },
          ],
        }
      } catch (error) {
        return { content: [{ type: "text" as const, text: `Could not render: ${error instanceof Error ? error.message : String(error)}` }], isError: true }
      }
    },
  )
}
