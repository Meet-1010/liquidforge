/**
 * Find an object to make liquid.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import {
  HEAVY_POLYCOUNT,
  PROVIDERS,
  resolveAssetUrl,
  searchAssets,
  TOTAL_ASSETS,
  type ProviderId,
} from "liquidforge/catalog"
import { ResponseFormat, fail, reply, table } from "../format.js"

const PROVIDER_IDS = PROVIDERS.map((provider) => provider.id) as [ProviderId, ...ProviderId[]]

export function registerAssetTools(server: McpServer): void {
  server.registerTool(
    "liquidforge_search_models",
    {
      title: "Search open 3D catalogues",
      description: `Search five open 3D catalogues — about ${TOTAL_ASSETS.toLocaleString()} models — for something to render as liquid.

No API key and no account: every one of these serves CORS-open metadata and files.

What makes a good result here is not what makes a good result in a model viewer. The liquid material reflects an environment off a displaced surface and carries almost no interior detail, so **silhouette is everything** — a duck, a bust, a helmet, a logo. A photogrammetry scan of grass is 1.6 million triangles of specks; it will import, but it will be clustered down first and it will not read. Results are ranked with that in mind.

Animation works for rigged and morph-target models under about 60,000 vertices, above which the model is posed instead. There is still no animated filter, because animation is not what makes a good result here — silhouette is.

Args:
  - query (string, optional): search terms. Omit for a curated starting set
  - providers (string[], optional): any of 'objaverse', 'polyhaven', 'threejs', 'khronos', 'sketchfab'. Defaults to all
  - limit (number, optional): max results, default 24
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  {
    "results": [ { "id", "provider", "name", "author", "license", "polycount",
                   "heavy": boolean, "animated": boolean, "importable": boolean,
                   "source_url": string } ],
    "total": number,
    "failed": [ { "provider": string, "message": string } ]
  }

Licences are reported exactly as each catalogue states them. Never infer one — link the user to the source instead.

Examples:
  - Use when: the user wants a real object rather than text or a primitive
  - Use when: they asked for "a skull", "a helmet", "a statue" in the hero
  - Don't use when: a word or a parametric shape would do (forge those, no download needed)`,
      inputSchema: {
        query: z.string().optional().describe("Search terms"),
        providers: z.array(z.enum(PROVIDER_IDS)).optional(),
        limit: z.number().int().min(1).max(60).default(24),
        response_format: ResponseFormat,
      },
    },
    async ({ query, providers, limit, response_format }) => {
      const outcome = await searchAssets({
        query: query ?? "",
        providers: providers ?? PROVIDER_IDS,
        limit,
      })

      const results = outcome.results.map((asset) => ({
        id: asset.id,
        provider: asset.provider,
        name: asset.name,
        author: asset.author,
        license: asset.license,
        polycount: asset.polycount,
        heavy: (asset.polycount ?? 0) > HEAVY_POLYCOUNT,
        animated: asset.animated,
        importable: asset.importable,
        source_url: asset.sourceUrl,
      }))

      if (results.length === 0) {
        return reply(
          "Nothing matched. Objaverse is searched by category name, so a broader word finds more — try `chair` rather than `eames lounge chair`.",
          { results, total: 0, failed: outcome.failed },
          response_format,
        )
      }

      const markdown = [
        table(
          ["name", "provider", "id", "licence", "notes"],
          results.map((asset) => [
            asset.name,
            asset.provider,
            `\`${asset.id}\``,
            asset.license,
            [
              asset.heavy ? `${Math.round((asset.polycount ?? 0) / 1000)}k tris — heavy` : "",
              asset.animated ? "rigged (animation dropped)" : "",
              asset.importable ? "" : "download at source",
            ]
              .filter(Boolean)
              .join(", "),
          ]),
        ),
        "",
        `${outcome.total} matched. Pass an id to \`liquidforge_get_model_import\` for a loadable URL.`,
        outcome.failed.length > 0
          ? `\nDidn't answer: ${outcome.failed.map((f) => `${f.provider} (${f.message})`).join(", ")}.`
          : "",
      ]
        .filter(Boolean)
        .join("\n")

      return reply(markdown, { results, total: outcome.total, failed: outcome.failed }, response_format)
    },
  )

  server.registerTool(
    "liquidforge_get_model_import",
    {
      title: "Resolve a model to a loadable URL",
      description: `Turn a catalogue id into a URL \`<LiquidHero object={{ type: "model", src }} />\` can load, plus the component that uses it.

Args:
  - provider (string, required): 'objaverse' | 'polyhaven' | 'threejs' | 'khronos' | 'sketchfab'
  - id (string, required): the id from liquidforge_search_models
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  { "url": string, "component": string, "note": string }

Sketchfab has no direct URL — downloading needs an account — so that provider returns guidance rather than a link. Hand the user the model page and let them download it themselves.

Examples:
  - Use when: the user picked a result from liquidforge_search_models
  - Don't use when: they have a .glb already (pass its path straight to the component)`,
      inputSchema: {
        provider: z.enum(PROVIDER_IDS),
        id: z.string().describe("Catalogue id from liquidforge_search_models"),
        response_format: ResponseFormat,
      },
    },
    async ({ provider, id, response_format }) => {
      try {
        const url = await resolveAssetUrl(provider, id)
        const component = `<LiquidHero\n  object={{ type: "model", src: "${url}" }}\n  preset="mercury-1"\n/>`
        const note =
          "Hotlinking a catalogue CDN is fine for a prototype and a bad idea in production — download the file and serve it yourself. Materials, skins and animation clips are dropped: every mesh is baked into one liquid surface."

        return reply(
          [`\`\`\`\n${url}\n\`\`\``, "", "```tsx", component, "```", "", note].join("\n"),
          { url, component, note },
          response_format,
        )
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error))
      }
    },
  )
}
