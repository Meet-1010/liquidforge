/**
 * A colourway from a website.
 *
 * "Make it match our site" is the brief that comes up most, and this server runs
 * on the user's own machine, so it can simply fetch the page. The colours come
 * from what the site's stylesheets declare — brand tokens and buttons count
 * most — rather than from a screenshot, which would need a browser and would
 * mostly measure the hero photograph.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { readSite, recommend, stylesheetLinks } from "liquidforge/recommend"
import { configFromPreset, generateCode } from "liquidforge/codegen"
import type { ObjectSource } from "liquidforge/presets"
import { ResponseFormat, fail, reply } from "../format.js"
import { fetchText } from "../fetch-guard.js"

export function registerPaletteTool(server: McpServer, options: { publicOnly?: boolean } = {}): void {
  const { publicOnly = false } = options
  server.registerTool(
    "liquidforge_palette_from_url",
    {
      title: "Colourway from a website",
      description: `Read a website's brand colours from its CSS and turn them into a colourway.

Fetches the page and up to six of its stylesheets, weighs every colour declaration by where it appears (brand tokens like --primary and colours on buttons and links count most), and returns a palette, whether the page is light or dark, the closest built-in colourway, and a component using that colourway with the site's palette.

Args:
  - url (string, required): the site, e.g. 'stripe.com' or 'https://linear.app'
  - text (string, optional): what the hero should say, for the component (default: the site's name)
  - response_format ('markdown' | 'json')

Returns:
  { "palette": string[], "background": "light"|"dark"|"mid", "brandColor", "preset", "reason", "component" }

Examples:
  - Use when: "make the hero match our website", "use our brand colours"
  - Don't use when: the user already gave you hex colours (pass them as palette to liquidforge_generate_component)`,
      inputSchema: {
        url: z.string().min(3).max(500),
        text: z.string().max(24).optional(),
        response_format: ResponseFormat,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ url, text, response_format }) => {
      let target: string
      try {
        target = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).toString()
      } catch {
        return fail(`"${url}" is not a web address.`)
      }

      try {
        const page = await fetchText(target, { limit: 1_500_000, publicOnly })
        const sheets = await Promise.all(
          stylesheetLinks(page.text, page.url)
            .slice(0, 6)
            .map((href) => fetchText(href, { limit: 800_000, publicOnly }).then((sheet) => sheet.text).catch(() => "")),
        )
        const site = readSite(page.text, sheets)
        const suggestion = recommend({
          palette: site.palette,
          brandColor: site.brandColor,
          description: [site.title, site.description].filter(Boolean).join(". "),
          background: site.background === "light" ? "light" : "dark",
        })

        const word = (text ?? site.title?.split(/[|\-–—:·]/)[0] ?? "LIQUID").trim().slice(0, 24) || "LIQUID"
        const object: ObjectSource = { type: "text", value: word.toUpperCase(), depth: 0.45, bevel: 0.03 }
        const config = {
          ...configFromPreset(suggestion.preset.id, object),
          palette: site.palette,
          background: site.background,
        }
        const component = generateCode(config)

        const structured = {
          url: page.url,
          title: site.title ?? null,
          palette: site.palette,
          background: site.background,
          brandColor: site.brandColor ?? null,
          signals: site.signals,
          preset: suggestion.preset.id,
          reason: suggestion.reason,
          component,
        }
        const markdown = [
          `## ${site.title ?? page.url}`,
          "",
          `**Palette:** ${site.palette.map((c) => `\`${c}\``).join(" ")} · **page:** ${site.background}${site.brandColor ? ` · **brand:** \`${site.brandColor}\`` : ""}`,
          site.signals < 12 ? "\n_Few colours were declared in this site's CSS, so treat the palette as a starting point._" : "",
          "",
          `**Starting colourway:** \`${suggestion.preset.id}\` — ${suggestion.reason}`,
          "",
          "```tsx",
          component,
          "```",
        ].join("\n")
        return reply(markdown, structured, response_format)
      } catch (error) {
        return fail(`Could not read ${target}: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  )
}
