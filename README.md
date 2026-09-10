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
| **MCP server** | Teaches an agent the library, recommends a colourway for the site it's looking at, and finds the model. Not on npm yet — run it from this checkout, see [its README](packages/liquidforge-mcp/README.md) |
| **`/studio`** | Forge an object, tune the material live, copy the component |
| **`/presets`** | The collection gallery — ten families, 90 colourways, each a live render |
| **`/how`** | Four switches that break the effect on purpose, so you can see what each one was buying |
| **`/showcase`** | Five complete demo sites you can open and use, plus a layout explorer for the eight placements |
| **`/assets`** | Search five open 3D catalogues and send a model straight into the Studio |
| **Surprise me** | The Studio's model tab rolls one at random out of 46,871, with its licence |
| **`/community`** | Live gallery, backed by a real database — post from the Studio's export |

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

### The community gallery

Posts go through `app/api/community`. With no configuration they land in a JSON
file under `apps/studio/.data/`, so a fresh clone has a working gallery you can
post to. For a deployment:

```bash
DATABASE_URL=postgres://…       # any Postgres; the driver is loaded lazily
SUBMISSION_SALT=…               # salts the hashed submitter key
MODERATION_TOKEN=…              # required before the moderation route answers
```

Posts go up straight away, the way they do everywhere people actually post.
Holding them for review is safer and it is also the reason nobody bothers, so
moderation is a takedown tool instead of a gate: `GET /api/community/moderate`
lists what is up and `PATCH` with `{ id, status }` hides it, both behind
`MODERATION_TOKEN` — and with no token set the route refuses everything, because
the failure mode for a missing secret has to be closed rather than open.

A row is about 250 bytes: no thumbnails are stored, because `/api/og` draws the
colourway on demand and a colourway edited later then has a correct preview
without a migration.

Submissions are validated field by field rather than passed through, capped in
length, restricted to presets that exist, and rate limited to three an hour per
address. The address itself is never stored, only a salted hash of it.

There is no static export any more. Every route still prerenders, but
`output: "export"` forbids API routes, and a gallery that cannot accept a post
is not the thing that was being asked for.

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
