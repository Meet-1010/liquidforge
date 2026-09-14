import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { configureNodeCatalog, createLiquidforgeServer } from "liquidforge-mcp/server"

/**
 * The Liquidforge MCP server, hosted.
 *
 * Add `https://liquidforge-pi.vercel.app/api/mcp` as a custom connector in
 * Claude — or any MCP client that speaks Streamable HTTP — and the tools work
 * with nothing installed. Stateless: every request builds a fresh server and
 * transport, which is what lets this run on serverless functions that share
 * nothing between invocations. The two tools that need the user's own machine,
 * rendering with their browser and writing a proposal into their project, are
 * left out here; the desktop extension and `npx liquidforge-mcp` have them.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

configureNodeCatalog()

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-session-id, mcp-protocol-version, last-event-id, authorization",
  "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
}

async function handle(request: Request): Promise<Response> {
  const server = createLiquidforgeServer({ mode: "remote" })
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    const response = await transport.handleRequest(request)
    const headers = new Headers(response.headers)
    for (const [name, value] of Object.entries(CORS)) headers.set(name, value)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  } finally {
    // A JSON response is complete once it is built; nothing streams afterwards.
    void server.close().catch(() => {})
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export { handle as GET, handle as POST, handle as DELETE }
