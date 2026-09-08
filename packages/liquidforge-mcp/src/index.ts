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
    liquidforge_list_collections      Five families, 45 colourways, with palettes
    liquidforge_inspect_preset        One colourway's exact numbers
    liquidforge_recommend_preset      Pick a colourway for a described site
    liquidforge_generate_component    Turn an explicit config into paste-ready TSX

  Add it to a client
    Claude Code   claude mcp add liquidforge -- npx -y liquidforge-mcp
    Cursor        .cursor/mcp.json  -> { "mcpServers": { "liquidforge": { "command": "npx", "args": ["-y", "liquidforge-mcp"] } } }
    Codex         ~/.codex/config.toml -> [mcp_servers.liquidforge] command = "npx", args = ["-y", "liquidforge-mcp"]

  ${REPO_URL}
`

const INSTRUCTIONS = `Liquidforge renders any object — text, an SVG, a logo, a primitive, a .glb — as a live liquid chrome, glass or molten surface, as one React component.

Call \`liquidforge_get_started\` before doing anything else with it. It explains the library, the two peer dependencies, and which tool to reach for next.

Typical paths:
- "add a liquid hero to my site", and you know what the site is -> \`liquidforge_recommend_preset\` (pass \`site_description\`, and \`brand_color\` and \`background\` if you can read them out of their CSS)
- The user has named a colourway -> \`liquidforge_generate_component\`
- You need one colourway's exact numbers before overriding a field -> \`liquidforge_inspect_preset\`

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

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  )

  registerDocsTools(server)
  registerRecommendTool(server)
  registerGenerateTool(server)

  await server.connect(new StdioServerTransport())
  console.error(`${SERVER_NAME} v${SERVER_VERSION} ready on stdio`)
}

main().catch((error) => {
  console.error(`${SERVER_NAME}: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
