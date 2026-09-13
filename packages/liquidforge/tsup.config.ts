import { readFileSync } from "node:fs"
import { defineConfig } from "tsup"

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string
}
const define = { __LIQUIDFORGE_VERSION__: JSON.stringify(version) }

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
      element: "src/element/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    treeshake: true,
    sourcemap: true,
    target: "es2020",
    external: ["react", "react-dom", "three"],
    define,
  },
  /*
   * `<liquid-forge>` as one self-contained script, three.js included, for the
   * places that take a script tag and nothing else — Webflow, Squarespace, a
   * plain HTML page. Everywhere with a bundler should import
   * `liquidforge/element` instead and share its copy of three.
   */
  {
    entry: { "element.global": "src/element/index.ts" },
    format: ["iife"],
    outExtension: () => ({ js: ".js" }),
    dts: false,
    minify: true,
    sourcemap: false,
    target: "es2020",
    platform: "browser",
    noExternal: [/.*/],
    define,
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
