/**
 * Choose a colourway for a described site.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { configFromPreset, generateCode } from "liquidforge/codegen"
import type { ObjectSource } from "liquidforge/presets"
import { recommend } from "../recommend.js"
import { ResponseFormat, definitionList, reply } from "../format.js"

export function registerRecommendTool(server: McpServer): void {
  server.registerTool(
    "liquidforge_recommend_preset",
    {
      title: "Recommend a colourway",
      description: `Pick a material family and colourway for a site you are looking at, and return the component that uses it.

Two separate judgements. The family comes from register — chrome reads restrained, magma reads loud — scored from the description. The colourway comes from hue: when a brand colour is given, the palette closest to it in OKLab wins.

The one hard constraint is background. Only Pearl is lit for a light page; the other four are built to sit on a dark ground, so a light page with Mercury is not a near miss, it is unreadable. Pass \`background\` if you know it.

Args:
  - site_description (string, optional): what the site is and how it should feel, e.g. "a fintech dashboard, restrained and serious"
  - brand_color (string, optional): the site's accent colour as hex, e.g. "#7a5cff"
  - background ('light' | 'dark', optional): the page the hero will sit on
  - headline (string, optional): the words to forge, if the hero should be text
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  {
    "preset": { ...the full colourway... },
    "family": string,
    "colourway": string,
    "reason": string,
    "runners_up": [ { "id": string, "label": string, "why": string } ],
    "component": string   // paste-ready TSX
  }

Examples:
  - Use when: the user says "add a liquid hero to my site" and you know what the site is
  - Use when: you have read a brand colour out of their CSS and want it matched
  - Don't use when: they have already named a preset (use liquidforge_generate_component)`,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        site_description: z.string().optional().describe("What the site is and how it should feel"),
        brand_color: z.string().optional().describe("Accent colour as hex, e.g. '#7a5cff'"),
        background: z.enum(["light", "dark"]).optional().describe("The page the hero sits on"),
        headline: z.string().optional().describe("Words to forge, if the object should be text"),
        response_format: ResponseFormat,
      },
    },
    async ({ site_description, brand_color, background, headline, response_format }) => {
      const result = recommend({
        description: site_description,
        brandColor: brand_color,
        background,
      })

      const object: ObjectSource = headline
        ? { type: "text", value: headline, depth: 0.45, bevel: 0.03 }
        : { type: "shape", shape: "sphere", detail: 160 }

      const config = { ...configFromPreset(result.preset.id, object), blend: Boolean(headline) }
      const component = generateCode(config, { component: "hero" })

      const markdown = [
        `## ${result.preset.label} — ${result.colourway}`,
        "",
        result.reason,
        "",
        definitionList([
          ["family", result.family],
          ["palette", result.preset.palette.join(" ")],
          ["background", result.preset.background],
        ]),
        "",
        "```tsx",
        component,
        "```",
        "",
        result.runnersUp.length > 0
          ? `Also worth a look: ${result.runnersUp.map((entry) => `\`${entry.id}\` (${entry.why})`).join(", ")}.`
          : "",
        "",
        headline
          ? "This uses `blend`, which inverts the headline against the liquid. Read the `blend` topic in `liquidforge_get_docs` first — any ancestor with a z-index, transform, filter or opacity below 1 silently flattens it to white."
          : "",
      ]
        .filter(Boolean)
        .join("\n")

      return reply(
        markdown,
        {
          preset: result.preset,
          family: result.family,
          colourway: result.colourway,
          reason: result.reason,
          runners_up: result.runnersUp,
          component,
        },
        response_format,
      )
    },
  )
}
