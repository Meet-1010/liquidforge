import path from "node:path"
import type { NextConfig } from "next"

const librarySrc = path.resolve(__dirname, "../../packages/liquidforge/src")

/*
 * There is no static export any more, and that is a deliberate trade.
 *
 * Every route here still prerenders, but the community gallery now has a real
 * backend — `app/api/community` — and `output: "export"` forbids API routes
 * outright. The gallery was always written to grow one; taking it means giving
 * up the plain-files deploy, which is the correct way round: a read-only
 * gallery that cannot accept a post is not the thing anyone asked for.
 *
 * Deploy to anywhere that runs Node. Set DATABASE_URL for Postgres, or leave it
 * unset and posts land in a JSON file under .data/.
 */
/**
 * The Studio compiles the library from source rather than its build output.
 *
 * Consuming `dist` means every library edit needs a rebuild, and `tsup --clean`
 * deletes that directory while Next is mid-read, which leaves the dev server
 * serving a broken module graph. Source resolution removes both the race and
 * the rebuild step; the publishable bundle is verified separately by
 * `npm run build`.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["liquidforge"],
  // The hosted MCP route never renders — that tool is local-only — but the
  // server's source still mentions the headless browser library, which has no
  // business being bundled into a function. Left external, it is never loaded.
  serverExternalPackages: ["puppeteer-core"],
  turbopack: {
    resolveAlias: {
      liquidforge: path.join(librarySrc, "index.ts"),
      "liquidforge/forge": path.join(librarySrc, "forge/index.ts"),
      "liquidforge/presets": path.join(librarySrc, "presets/index.ts"),
      "liquidforge/catalog": path.join(librarySrc, "catalog/index.ts"),
      "liquidforge/recommend": path.join(librarySrc, "recommend/index.ts"),
      "liquidforge/codegen": path.join(librarySrc, "codegen/index.ts"),
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      liquidforge$: path.join(librarySrc, "index.ts"),
      "liquidforge/forge$": path.join(librarySrc, "forge/index.ts"),
      "liquidforge/presets$": path.join(librarySrc, "presets/index.ts"),
      "liquidforge/catalog$": path.join(librarySrc, "catalog/index.ts"),
      "liquidforge/recommend$": path.join(librarySrc, "recommend/index.ts"),
      "liquidforge/codegen$": path.join(librarySrc, "codegen/index.ts"),
    }
    return config
  },
}

export default nextConfig
