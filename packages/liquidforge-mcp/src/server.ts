/**
 * The Liquidforge MCP server, independent of how it is reached.
 *
 * The same tools run two ways. Locally, over stdio, as a subprocess of Claude
 * Desktop, Claude Code, Cursor or Codex — where it can read the project, write
 * a proposal for the editor to pick up, and render with the browser on the
 * machine. Hosted, over HTTP, as a custom connector anyone can add by URL —
 * where it has no project and no browser, so those tools are left out and every
 * URL it fetches is checked against private addresses.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { SERVER_NAME, SERVER_VERSION, SITE_URL } from "./constants.js"
import { registerDocsTools } from "./tools/docs.js"
import { registerRecommendTool } from "./tools/recommend.js"
import { registerGenerateTool } from "./tools/generate.js"
import { registerAssetTools } from "./tools/assets.js"
import { registerPlacementTool } from "./tools/placement.js"
import { registerProposeTool } from "./tools/propose.js"
import { registerBreedTool } from "./tools/breed.js"
import { registerPaletteTool } from "./tools/palette.js"
import { registerRenderTool } from "./tools/render.js"

export { configureNodeCatalog } from "./catalog-node.js"
export { SERVER_NAME, SERVER_VERSION } from "./constants.js"

export type ServerMode = "local" | "remote"

export const INSTRUCTIONS = `Liquidforge renders any object — text, an SVG, a logo, a primitive, a .glb — as a live liquid surface that reacts to the cursor: chrome, glass, molten, iridescent, ferrofluid that spikes toward the pointer, or the object's own textures made liquid. It ships as a React component, a <liquid-forge> element for Webflow, Framer and plain HTML, and an in-place editor for putting objects on an existing site.

Call \`liquidforge_get_started\` first. It explains the library and which tool to reach for next.

Typical paths:
- "add a liquid hero to my site" -> \`liquidforge_recommend_preset\` with a description of the site, or \`liquidforge_palette_from_url\` to take the colours from the site itself
- The user named a colourway -> \`liquidforge_generate_component\` (set \`target\` for Webflow, Framer or HTML)
- You want to see a look before committing to it -> \`liquidforge_render\` (local only)
- The hero needs a real object -> \`liquidforge_search_models\`, then \`liquidforge_get_model_import\`
- An object floating over an existing page, following a scroll path -> \`liquidforge_generate_placement\`, or \`liquidforge_propose_placement\` to hand a draft to the in-place editor (local only)
- "something between these two looks" -> \`liquidforge_breed_presets\`

Pick objects for **silhouette**: the surface reflects an environment and carries little interior detail, so a shape recognisable from its outline survives. Report licences exactly as a catalogue states them.

Two things fail silently when written by hand; read the docs topics first: **blend** (the inverted headline breaks under any ancestor that creates a stacking context) and **shader** (displacing vertices without rebuilding normals makes the effect invisible).

Pearl and Jade are lit for light pages; Obsidian, Velvet, Plasma, Original and Ferrofluid want a studio-grey ground; the rest sit on dark.

Docs, the Studio and the privacy policy: ${SITE_URL}`

export function createLiquidforgeServer(options: { mode?: ServerMode } = {}): McpServer {
  const mode = options.mode ?? "local"
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS })

  registerDocsTools(server)
  registerRecommendTool(server)
  registerGenerateTool(server)
  registerAssetTools(server)
  registerPlacementTool(server)
  registerBreedTool(server)
  registerPaletteTool(server, { publicOnly: mode === "remote" })
  if (mode === "local") {
    // Both need the user's machine: one writes a file into their project, the
    // other drives the browser installed on it.
    registerProposeTool(server)
    registerRenderTool(server)
  }
  return server
}
