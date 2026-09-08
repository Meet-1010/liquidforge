import path from "node:path"
import type { NextConfig } from "next"

const librarySrc = path.resolve(__dirname, "../../packages/liquidforge/src")

/**
 * Static export is opt-in via `npm run build:static`.
 *
 * Every route prerenders to HTML already — there are no API routes and no
 * runtime data fetching — so the site can ship as plain files to any static
 * host. It stays opt-in because `output: "export"` forbids ever adding an API
 * route, and the community page is written to grow a backend later.
 */
const isStatic = process.env.LIQUIDFORGE_STATIC === "1"

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
  ...(isStatic ? { output: "export" as const, trailingSlash: true } : {}),
  transpilePackages: ["liquidforge"],
  turbopack: {
    resolveAlias: {
      liquidforge: path.join(librarySrc, "index.ts"),
      "liquidforge/forge": path.join(librarySrc, "forge/index.ts"),
      "liquidforge/presets": path.join(librarySrc, "presets/index.ts"),
      "liquidforge/catalog": path.join(librarySrc, "catalog/index.ts"),
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
      "liquidforge/codegen$": path.join(librarySrc, "codegen/index.ts"),
    }
    return config
  },
}

export default nextConfig
