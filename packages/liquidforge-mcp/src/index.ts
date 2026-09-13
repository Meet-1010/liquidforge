#!/usr/bin/env node
/**
 * Liquidforge MCP server.
 *
 * Connects a coding agent — Claude Code, Cursor, Codex, anything that speaks
 * MCP — to Liquidforge: what the library is, which colourway suits the site the
 * agent is looking at, and the handful of failures that produce no error and no
 * clue when you write this by hand.
 *
 * stdio transport: this runs as a subprocess of the client, so stdout is the
 * JSON-RPC channel and every diagnostic goes to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { SERVER_NAME, SERVER_VERSION, REPO_URL } from "./constants.js"
import { registerDocsTools } from "./tools/docs.js"
import { registerRecommendTool } from "./tools/recommend.js"
import { registerGenerateTool } from "./tools/generate.js"
import { registerAssetTools } from "./tools/assets.js"
import { registerPlacementTool } from "./tools/placement.js"
import { registerProposeTool } from "./tools/propose.js"
import { registerBreedTool } from "./tools/breed.js"
import { configureNodeCatalog } from "./catalog-node.js"

const HELP = `
  ${SERVER_NAME} v${SERVER_VERSION}

  An MCP server for Liquidforge — liquid 3D hero sections for React.

  Usage
    liquidforge-mcp                   Run the server over stdio (how a client starts it)
    liquidforge-mcp --help            Show this
    liquidforge-mcp --version         Print the version

  Tools
    liquidforge_get_started           Learn the library — start here
    liquidforge_get_docs              Documentation by topic, including the gotchas
    liquidforge_list_collections      Eleven families, 99 colourways, with palettes
    liquidforge_inspect_preset        One colourway's exact numbers
    liquidforge_recommend_preset      Pick a colourway for a described site
    liquidforge_generate_component    Turn an explicit config into paste-ready TSX
    liquidforge_search_models         Search five open 3D catalogues, ~46,900 models
    liquidforge_get_model_import      Resolve a catalogue id to a loadable .glb URL

  Environment
    LIQUIDFORGE_OBJAVERSE_INDEX       Path or URL for the Objaverse category index.
                                      Defaults to the copy in the repository.

  Add it to a client
    Not on npm yet, so point the client at this file by absolute path:
    Claude Code   claude mcp add liquidforge -- node <repo>/packages/liquidforge-mcp/dist/index.js
    Cursor        .cursor/mcp.json  -> { "mcpServers": { "liquidforge": { "command": "node", "args": ["<repo>/packages/liquidforge-mcp/dist/index.js"] } } }
    Codex         ~/.codex/config.toml -> [mcp_servers.liquidforge] command = "node", args = ["<repo>/packages/liquidforge-mcp/dist/index.js"]

  ${REPO_URL}
`

const INSTRUCTIONS = `Liquidforge renders any object — text, an SVG, a logo, a primitive, a .glb — as a live liquid chrome, glass or molten surface, as one React component.

Call \`liquidforge_get_started\` before doing anything else with it. It explains the library, the two peer dependencies, and which tool to reach for next.

Typical paths:
- "add a liquid hero to my site", and you know what the site is -> \`liquidforge_recommend_preset\` (pass \`site_description\`, and \`brand_color\` and \`background\` if you can read them out of their CSS)
- The user has named a colourway -> \`liquidforge_generate_component\`
- You need one colourway's exact numbers before overriding a field -> \`liquidforge_inspect_preset\`
- The hero needs a real object rather than a word or a shape -> \`liquidforge_search_models\`, then \`liquidforge_get_model_import\`

Pick objects for **silhouette**. This material reflects an environment and carries almost no interior detail, so a shape recognisable from its outline survives and a cluttered scene does not. Animation never survives — every mesh is baked into one static surface. Report licences exactly as the catalogue states them; never infer one.

Two things are worth reading before writing any of this by hand, because both fail silently:
- \`liquidforge_get_docs\` topic **blend** — the mix-blend-mode headline breaks if any ancestor creates a stacking context, and renders flat white with no error
- \`liquidforge_get_docs\` topic **shader** — displacing vertices without rebuilding normals makes the whole effect invisible

Only the Pearl family is built for a light page. The other four are lit to sit on a dark ground.`

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP)
    return
  }
  if (args.includes("--version") || args.includes("-v")) {
    console.log(SERVER_VERSION)
    return
  }

  configureNodeCatalog()

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  )

  registerDocsTools(server)
  registerRecommendTool(server)
  registerGenerateTool(server)
  registerAssetTools(server)
  registerPlacementTool(server)
  registerProposeTool(server)
  registerBreedTool(server)

  await server.connect(new StdioServerTransport())
  console.error(`${SERVER_NAME} v${SERVER_VERSION} ready on stdio`)
}

main().catch((error) => {
  console.error(`${SERVER_NAME}: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
