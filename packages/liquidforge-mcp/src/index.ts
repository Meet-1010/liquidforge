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

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { SERVER_NAME, SERVER_VERSION, SITE_URL } from "./constants.js"
import { configureNodeCatalog } from "./catalog-node.js"
import { createLiquidforgeServer } from "./server.js"

const HELP = `
  ${SERVER_NAME} v${SERVER_VERSION}

  An MCP server for Liquidforge — liquid 3D surfaces for React, Webflow, Framer and plain HTML.

  Usage
    npx liquidforge-mcp               Run the server over stdio (how a client starts it)
    npx liquidforge-mcp --help        Show this
    npx liquidforge-mcp --version     Print the version

  Tools
    liquidforge_get_started           Learn the library — start here
    liquidforge_get_docs              Documentation by topic, including the gotchas
    liquidforge_list_collections      Twelve families, 108 colourways, with palettes
    liquidforge_inspect_preset        One colourway's exact numbers
    liquidforge_recommend_preset      Pick a colourway for a described site
    liquidforge_palette_from_url      Take a colourway from a website's own CSS
    liquidforge_generate_component    React, or a Webflow / Framer / HTML embed
    liquidforge_render                See a look as a PNG, using a browser on this machine
    liquidforge_search_models         Search five open 3D catalogues, ~46,900 models
    liquidforge_get_model_import      Resolve a catalogue id to a loadable .glb URL
    liquidforge_generate_placement    Float an object over an existing site, on a scroll path
    liquidforge_propose_placement     Hand a placement to the in-place editor to approve
    liquidforge_breed_presets         Cross two colourways into a litter

  Environment
    LIQUIDFORGE_BROWSER               Path to Chrome, Edge, Brave or Chromium for rendering
    LIQUIDFORGE_OBJAVERSE_INDEX       Path or URL for the Objaverse category index

  Add it to a client
    Claude Desktop  Install the desktop extension from ${SITE_URL}/mcp
    Claude Code     claude mcp add liquidforge -- npx -y liquidforge-mcp
    Cursor          .cursor/mcp.json -> { "mcpServers": { "liquidforge": { "command": "npx", "args": ["-y", "liquidforge-mcp"] } } }
    Codex           ~/.codex/config.toml -> [mcp_servers.liquidforge] command = "npx", args = ["-y", "liquidforge-mcp"]
    Any client      ${SITE_URL}/api/mcp  (hosted, no install; render and propose are local-only)

  ${SITE_URL}
`

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
  const server = createLiquidforgeServer({ mode: "local" })
  await server.connect(new StdioServerTransport())
  console.error(`${SERVER_NAME} v${SERVER_VERSION} ready on stdio`)
}

main().catch((error) => {
  console.error(`${SERVER_NAME}: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
