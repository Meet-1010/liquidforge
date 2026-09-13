/**
 * Teaching tools: what Liquidforge is, how it works, and what the looks are.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { COLLECTIONS, PRESETS, PRESET_IDS, presetName } from "liquidforge/presets"
import { TOPICS, TOPIC_NAMES, type TopicName } from "../knowledge.js"
import { PEER_DEPENDENCIES, REPO_URL, STUDIO_HOWTO } from "../constants.js"
import { ResponseFormat, definitionList, fail, reply, table } from "../format.js"

export function registerDocsTools(server: McpServer): void {
  server.registerTool(
    "liquidforge_get_started",
    {
      title: "Learn Liquidforge",
      description: `Start here. Explains what Liquidforge is, how to install it, the shape of the API, and which of the other tools to reach for next.

Call this once before working with Liquidforge for the first time in a session. It is self-contained — no network, no arguments beyond the output format.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  {
    "overview": string,      // what the library is and the problem it solves
    "install": string,       // install command and peer dependencies
    "quickstart": string,    // the smallest working component
    "topics": string[],      // every topic liquidforge_get_docs accepts
    "tools": [ { "name": string, "use_when": string } ],
    "repo": string,
    "studio": string
  }

Examples:
  - Use when: the user mentions Liquidforge, a liquid or chrome hero, or you find \`liquidforge\` in their package.json
  - Use when: you need the peer dependency list before installing
  - Don't use when: you want a specific colourway recommended for a specific site (use liquidforge_recommend_preset)`,
      inputSchema: { response_format: ResponseFormat },
    },
    async ({ response_format }) => {
      const tools = [
        { name: "liquidforge_get_docs", use_when: "You need detail on one topic — the blend trap, performance, the shader" },
        { name: "liquidforge_list_collections", use_when: "You want every family and colourway with its palette" },
        { name: "liquidforge_inspect_preset", use_when: "You need one colourway's exact numbers" },
        { name: "liquidforge_recommend_preset", use_when: "You know what the site is and want a colourway chosen for it" },
        { name: "liquidforge_generate_component", use_when: "You already know the props and want paste-ready TSX" },
        { name: "liquidforge_generate_placement", use_when: "They have a site already and want an object placed on it — dragged into position, drifting as the page scrolls" },
        { name: "liquidforge_propose_placement", use_when: "You are placing an object on a page you cannot see — leave it as a draft the user approves in the editor" },
        { name: "liquidforge_breed_presets", use_when: "They like two colourways and want something between or beyond them" },
        { name: "liquidforge_search_models", use_when: "The hero needs a real object rather than a word or a shape" },
        { name: "liquidforge_get_model_import", use_when: "You picked a catalogue result and need a loadable URL" },
      ]

      const markdown = [
        TOPICS.overview,
        "",
        TOPICS.install,
        "",
        "## Next",
        "",
        definitionList(tools.map((tool) => [tool.name, tool.use_when])),
        "",
        `Topics for \`liquidforge_get_docs\`: ${TOPIC_NAMES.join(", ")}.`,
        "",
        `Read the **blend** and **shader** topics before writing any of this by hand. Both are lists of failures that produce no error and no clue.`,
      ].join("\n")

      return reply(
        markdown,
        {
          overview: TOPICS.overview,
          install: TOPICS.install,
          quickstart: `import { LiquidHero } from "liquidforge"\n\n<LiquidHero object={{ type: "text", value: "SHIP IT" }} preset="mercury-3" />`,
          peer_dependencies: [...PEER_DEPENDENCIES, "react"],
          topics: TOPIC_NAMES,
          tools,
          repo: REPO_URL,
          studio: STUDIO_HOWTO,
        },
        response_format,
      )
    },
  )

  server.registerTool(
    "liquidforge_get_docs",
    {
      title: "Liquidforge documentation by topic",
      description: `Documentation for one topic at a time.

Topics:
  - overview — what the library is
  - install — install command, CLI, peer dependencies
  - api — every prop on <LiquidHero> and <LiquidCanvas>, and the headless engine
  - objects — the five object sources and what each is good for
  - assets — the five open catalogues, and what makes a good object for this material
  - presets — the eleven families and when to reach for each
  - blend — the mix-blend-mode stacking-context trap. READ THIS before using \`blend\`
  - shader — how the material works and the four things that silently break it
  - performance — the quality tiers and what actually costs frames
  - accessibility — reduced motion, contrast under blend, semantics
  - troubleshooting — symptom to cause
  - ejecting — owning the source, and where to add a new family

Args:
  - topic (string, required): one of the topics above
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  { "topic": string, "content": string, "related": string[] }

Examples:
  - Use when: the headline renders flat white instead of inverting (topic: 'blend')
  - Use when: the surface shows no relief however hard it is displaced (topic: 'shader')
  - Don't use when: you have not called liquidforge_get_started yet — it covers overview and install already`,
      inputSchema: {
        topic: z.enum(TOPIC_NAMES as [TopicName, ...TopicName[]]).describe("Which topic to return"),
        response_format: ResponseFormat,
      },
    },
    async ({ topic, response_format }) => {
      const content = TOPICS[topic]
      if (!content) return fail(`Unknown topic "${topic}". Available: ${TOPIC_NAMES.join(", ")}.`)
      return reply(
        content,
        { topic, content, related: TOPIC_NAMES.filter((name) => name !== topic) },
        response_format,
      )
    },
  )

  server.registerTool(
    "liquidforge_list_collections",
    {
      title: "List the material collections",
      description: `Every family and colourway, with palettes and the numbers that define them.

99 colourways across 11 families. Pass \`collection\` to get one family's nine in full; omit it for a summary of all ten.

Args:
  - collection (string, optional): 'mercury' | 'aurora' | 'prism' | 'magma' | 'pearl'
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  {
    "collections": [
      { "name": string, "family": string, "blurb": string, "background": string,
        "colourways": [ { "id": string, "label": string, "name": string, "palette": string[] } ] }
    ]
  }

Examples:
  - Use when: the user asks what colourways exist, or you want to offer a choice
  - Use when: you need a preset id to pass to liquidforge_generate_component
  - Don't use when: you want one chosen for a described site (use liquidforge_recommend_preset)`,
      inputSchema: {
        collection: z
          .string()
          .optional()
          .describe("Limit to one collection, e.g. 'mercury'"),
        response_format: ResponseFormat,
      },
    },
    async ({ collection, response_format }) => {
      const wanted = collection?.toLowerCase()
      const chosen = wanted
        ? COLLECTIONS.filter((entry) => entry.name.toLowerCase() === wanted || entry.family === wanted)
        : COLLECTIONS

      if (chosen.length === 0) {
        return fail(
          `Unknown collection "${collection}". Available: ${COLLECTIONS.map((c) => c.name).join(", ")}.`,
        )
      }

      const structured = {
        collections: chosen.map((entry) => ({
          name: entry.name,
          family: entry.family,
          blurb: entry.blurb,
          background: entry.background,
          colourways: entry.colourways.map((colourway, index) => {
            const id = `${entry.name.toLowerCase()}-${index + 1}`
            return {
              id,
              label: PRESETS[id]?.label ?? id,
              name: colourway.name,
              palette: colourway.palette,
            }
          }),
        })),
      }

      const markdown = structured.collections
        .map((entry) => {
          const rows = entry.colourways.map((colourway) => [
            `\`${colourway.id}\``,
            colourway.name,
            colourway.palette.join(" "),
          ])
          return [
            `## ${entry.name}`,
            "",
            `${entry.blurb} Built for a **${entry.background}** background.`,
            "",
            table(["id", "name", "palette"], rows),
          ].join("\n")
        })
        .join("\n\n")

      return reply(markdown, structured, response_format)
    },
  )

  server.registerTool(
    "liquidforge_inspect_preset",
    {
      title: "Inspect one colourway",
      description: `Every number in one colourway, plus the component that uses it.

Args:
  - preset (string, required): a colourway id, e.g. 'mercury-3'
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  {
    "preset": { "id", "collection", "family", "label", "palette", "surface", "shading", "background" },
    "usage": string   // the component that renders it
  }

Examples:
  - Use when: the user wants to copy a colourway's numbers into their own preset
  - Use when: you are about to override one field and need to see the rest
  - Don't use when: you want the whole catalogue (use liquidforge_list_collections)`,
      inputSchema: {
        preset: z.string().describe("Colourway id, e.g. 'mercury-3'"),
        response_format: ResponseFormat,
      },
    },
    async ({ preset, response_format }) => {
      const found = PRESETS[preset]
      if (!found) {
        return fail(
          `Unknown preset "${preset}". Ids run mercury-1..9, aurora-1..9, prism-1..9, magma-1..9, pearl-1..9 (${PRESET_IDS.length} total).`,
        )
      }

      const usage = `<LiquidHero\n  object={{ type: "text", value: "SHIP IT" }}\n  preset="${found.id}"\n/>`

      const markdown = [
        `## ${found.label} — ${presetName(found.id) ?? ""}`.trim(),
        "",
        definitionList([
          ["family", found.family],
          ["background", found.background],
          ["palette", found.palette.join(" ")],
        ]),
        "",
        "### Surface",
        "",
        definitionList(Object.entries(found.surface).map(([k, v]) => [k, String(v)])),
        "",
        "### Shading",
        "",
        definitionList(Object.entries(found.shading).map(([k, v]) => [k, String(v)])),
        "",
        "### Usage",
        "",
        "```tsx",
        usage,
        "```",
      ].join("\n")

      return reply(markdown, { preset: found, usage }, response_format)
    },
  )
}
