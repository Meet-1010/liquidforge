# Liquidforge

**Liquid 3D hero sections for React, one component.** Any object — text, an SVG, a logo, a primitive, a `.glb` — rendered as a living chrome, glass or molten surface that reacts to the cursor.

```tsx
import { LiquidHero } from "liquidforge"

<LiquidHero object={{ type: "text", value: "SHIP IT" }} preset="mercury-3" />
```

Sibling of [glyphforge](https://github.com/Meet-1010/glyphforge). Same philosophy, same repo shape, different surface treatment: glyphforge turns geometry into ASCII, liquidforge turns it into liquid metal.

---

## Repository layout

```
packages/liquidforge/       The npm package — components, material system, forge, CLI
packages/liquidforge-mcp/   The MCP server — the same brains, for coding agents
apps/studio/                The site — landing, Studio, presets, community
```

| | |
| --- | --- |
| **Library** | React components, the GLSL material, five object generators, asset search, glTF export |
| **CLI** | `npx liquidforge init` to scaffold, `npx liquidforge add` to eject the source |
| **MCP server** | `npx liquidforge-mcp` — teaches an agent the library, recommends a colourway for the site it's looking at, and finds the model |
| **`/studio`** | Forge an object, tune the material live, copy the component |
| **`/presets`** | The collection gallery — 45 colourways, each a running scene |
| **`/assets`** | Search five open 3D catalogues and send a model straight into the Studio |
| **`/community`** | Live gallery of creations |

---

## Local development

```bash
npm install
npm run dev
```

Starts the Studio on [localhost:3000](http://localhost:3000). No build step first — the Studio resolves `liquidforge` to the library's **source**, so editing the library hot-reloads like any other file in the app.

Other scripts:

```bash
npm run build       # build the publishable package (dist/)
npm run build:all   # package + MCP server
npm run typecheck   # typecheck every workspace
npm run mcp         # build and run the MCP server over stdio
```

---

## Decisions worth knowing

**WebGL2, not WebGPU.** WebGPU would allow a compute-shader fluid simulation, which would give genuinely better ripples, but it excludes Safari below 18 and older Android. For a component whose entire job is to be dropped into other people's landing pages, that trade is the wrong way round. The analytic ripple field is a trail of expanding wavelets rather than a real height-field sim; it holds up, and a WebGPU path can be added later behind the same props.

**Two peer dependencies.** `react` and `three`. The reference implementation was plain three.js and the render loop needs to own frame timing, pointer probing and trail emission — all awkward through a reconciler — so this is not built on react-three-fiber. The environment is computed analytically in the fragment shader rather than baked through `PMREMGenerator`, which keeps the package free of binary assets and lets each colourway tint its own studio.

**A preset is data.** A palette and about twenty numbers, with no code in it. That is what lets the Studio edit one with sliders, the MCP server hand one to an agent as JSON, and `codegen` inline one into a component a person can still read.

---

## The four things that silently break this

Each was hit, diagnosed and fixed once. None of them throws; the surface just looks wrong. They're documented at length in [the package README](packages/liquidforge/README.md) and in the MCP server's `shader` and `blend` topics.

1. **Rebuild the normals from the displaced surface.** Skip it and dents and ripples are completely invisible, however hard you push the geometry.
2. **Displace along a welded normal, shade with a crease-aware one.** Otherwise every hard edge cracks open.
3. **Find the cursor with a ray cast, in object space.** A flat projection is only correct at dead centre.
4. **Ripples need a trail, not a single source.** Otherwise all motion freezes the instant the mouse stops.

---

## Licence

MIT © Meet Chauhan
