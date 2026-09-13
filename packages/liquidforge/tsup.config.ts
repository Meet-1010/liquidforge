import { defineConfig } from "tsup"

/*
 * No config here sets `clean`. The entries build concurrently, and a `clean` on
 * one of them races the output of the others — which showed up as `dev.d.ts`
 * being written and then deleted, so `liquidforge/dev` had working code and no
 * types roughly half the time. `npm run build` clears dist once, up front,
 * where nothing can race it.
 */

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      forge: "src/forge/index.ts",
      presets: "src/presets/index.ts",
      catalog: "src/catalog/index.ts",
      recommend: "src/recommend/index.ts",
      codegen: "src/codegen/index.ts",
      placement: "src/placement/index.ts",
      editor: "src/editor/index.ts",
      breed: "src/breed/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    treeshake: true,
    sourcemap: true,
    target: "es2020",
    external: ["react", "react-dom", "three"],
  },
  {
    entry: { dev: "src/dev/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    treeshake: true,
    sourcemap: true,
    target: "node18",
    platform: "node",
  },
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["cjs"],
    dts: false,
    sourcemap: false,
    target: "node18",
    banner: { js: "#!/usr/bin/env node" },
  },
])
