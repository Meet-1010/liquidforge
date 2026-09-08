/**
 * What the server knows.
 *
 * The `shader` topic is the reason this file is worth its weight. Every item in
 * it is a bug that was hit, diagnosed and paid for once already; an agent that
 * reads it does not spend an afternoon rediscovering why its displaced surface
 * renders as a flat gradient.
 */

export const TOPICS = {
  overview: `# Liquidforge

Liquid 3D hero sections for React, as one component. Any object — text, an SVG,
a logo, a primitive, a \`.glb\` — rendered as a living chrome, glass or molten
surface that reacts to the cursor.

\`\`\`tsx
import { LiquidHero } from "liquidforge"

<LiquidHero object={{ type: "text", value: "SHIP IT" }} preset="mercury-3" />
\`\`\`

Two things make it different from the many liquid-chrome repos on GitHub:

1. **It is a package, not a boilerplate.** No fork, no "now replace model.glb
   with your own" — the object is forged in the browser from a word, an SVG, a
   PNG or a parametric shape.
2. **The material system is the product.** Five families, nine colourways each,
   shipped as data rather than as a shader you are expected to edit.

Peer dependencies are \`react\` and \`three\` and nothing else. The environment
the metal reflects is computed analytically in the fragment shader, so there
are no HDRIs to download and no \`PMREMGenerator\` step.`,

  install: `# Install

\`\`\`bash
npm install liquidforge three
\`\`\`

Peer dependencies: \`react\` (>=18) and \`three\` (>=0.160). That is the whole
list — no react-three-fiber, no postprocessing stack.

There is also a CLI:

\`\`\`bash
npx liquidforge init          # install deps and scaffold a hero component
npx liquidforge presets       # list every collection and colourway
npx liquidforge add hero      # copy the source into the project, to own it
\`\`\`

In Next.js the component is already marked \`"use client"\`, so no extra
directive is needed at the call site.`,

  api: `# API

## \`<LiquidHero />\`

The section plus a content slot. Takes everything \`<LiquidCanvas />\` takes, and:

- \`layout\`: \`"overlay"\` (default) or \`"split"\`
- \`canvasSide\`: \`"left" | "right"\`, for \`split\`
- \`height\`: default \`"100vh"\` for overlay
- \`blend\`: invert the content against the liquid with \`mix-blend-mode: difference\` — read the \`blend\` topic before using it
- \`children\`: your headline and copy

## \`<LiquidCanvas />\`

The surface on its own; fills its container.

- \`object\`: an \`ObjectSource\` — see the \`objects\` topic. Defaults to a sphere.
- \`preset\`: a colourway id like \`"mercury-3"\`, or a whole \`LiquidPreset\` object
- \`family\`, \`palette\`, \`surface\`, \`shading\`: overrides layered on the preset. \`surface\` and \`shading\` merge one level deep, so \`surface={{ advection: 1.2 }}\` changes one number and leaves the colourway alone.
- \`quality\`: \`"auto" | "high" | "balanced" | "low"\` (default \`"auto"\`)
- \`motion\`: \`{ autoRotate, tilt, draggable, respectReducedMotion }\`
- \`transparent\`, \`background\`, \`pauseOffscreen\`, \`fallback\`, \`errorFallback\`, \`onReady\`, \`onError\`

## Without React

\`LiquidEngine\` is exported and owns the whole render loop:

\`\`\`ts
const engine = new LiquidEngine({ container, preset: PRESETS["mercury-1"] })
engine.setGeometry(await forgeGeometry({ type: "text", value: "HI" }))
engine.resize(width, height)
engine.start()
\`\`\``,

  objects: `# Objects

Every source arrives at the same place — one \`BufferGeometry\` fitted into a
two-unit box — so the material never has to know which one produced it.

| type | input | notes |
| --- | --- | --- |
| \`text\` | a string | extruded from live browser text; any font the page can render, emoji included |
| \`svg\` | \`src\` or \`markup\` | contours extruded directly, no tracing needed |
| \`image\` | \`src\` | contour-traced to a silhouette, then extruded. Logos and icons, not photographs — a photograph has no outline to find |
| \`shape\` | \`sphere\` \`torus\` \`torusknot\` \`capsule\` \`icosahedron\` \`rounded-box\` | parametric, no assets |
| \`model\` | a \`.glb\` URL | every mesh baked into one surface; materials, skins and clips are dropped |

\`\`\`tsx
<LiquidCanvas object={{ type: "text", value: "SHIP IT", depth: 0.5 }} />
<LiquidCanvas object={{ type: "shape", shape: "torusknot", detail: 128 }} />
<LiquidCanvas object={{ type: "model", src: "/models/logo.glb" }} />
\`\`\`

Before the shader sees any of it, \`prepareGeometry\` subdivides the mesh until
its triangles are small enough to ripple, then builds two normal sets: a
crease-aware one for shading, and a fully welded one for the displacement
direction. That second set is what stops a hard edge tearing open — see the
\`shader\` topic.

Don't have a model? \`liquidforge_search_models\` searches five open
catalogues. The \`assets\` topic covers what makes a good one.`,

  assets: `# Finding an object

\`liquidforge_search_models\` searches five open catalogues — around 46,900
models — with no API key and no account, because all five serve CORS-open
metadata and files. \`liquidforge_get_model_import\` turns a result into a URL the
component can load.

| catalogue | what it is | importable |
| --- | --- | --- |
| Objaverse | 46,207 models across 1,156 categories | yes |
| Poly Haven | 521 assets, every one CC0 | yes |
| Khronos | 119 official glTF samples | yes |
| three.js | 22 hand-picked example models | yes |
| Sketchfab | millions, search only | no — needs an account |

## Picking one

**Silhouette is everything.** The material reflects an environment off a
displaced surface and carries almost no interior detail, so a shape you can
recognise from its outline — a bust, a helmet, a bottle, a logo — survives the
treatment, and a cluttered scene turns to soup. A photogrammetry scan of grass
is 1.6 million triangles of specks: it imports, but there is nothing there to
read.

**Polycount matters twice.** Past 200,000 triangles the mesh is clustered down
on import before anything else can touch it, and past 90,000 the cursor probe
falls back to the bounding sphere rather than raycasting the mesh. Results carry
a polycount where the catalogue reports one, and search ranks heavy models down.

**Animation works, under a budget.** Rigged and morph-target models animate:
the skeleton and mixer are kept alive and re-baked onto the liquid surface each
frame, because three's GPU skinning cannot be used through a custom
displacement shader. Past 60,000 vertices that re-bake costs more than the frame
has, so a heavier model is posed rather than animated. Control it with
\`motion={{ animation: "Run" }}\`.

**Compression is not supported.** Draco and Meshopt geometry, and KTX2
textures, need decoders this library does not bundle. Re-export uncompressed.

Textures are never downloaded at all: only positions survive the import, so
image requests are redirected to a blank pixel.

## Licences

Reported exactly as each catalogue states them. Never infer one — Objaverse
uids are Sketchfab uids, so every model links back to its own licence page, and
that link is what to hand the user.

Hotlinking a catalogue CDN is fine for a prototype and a bad idea in
production. Download the file and serve it yourself.`,

  presets: `# Presets

45 colourways across five families. A preset is data — a palette and about
twenty numbers — so it can be edited, serialised, and inlined into a component.

| family | look | reach for it when |
| --- | --- | --- |
| **Mercury** | liquid chrome, tinted | the default. Anything that should read as expensive and restrained |
| **Aurora** | iridescent oil slick | music, launches, anything that wants colour |
| **Prism** | glass with dispersion | product and hardware pages; reads as precision |
| **Magma** | molten, glowing in the troughs | loud. Games, events, energy |
| **Pearl** | soft matte iridescence | the only family built for a light background |

Ids run \`mercury-1\` … \`mercury-9\`, \`aurora-1\` … and so on. Call
\`liquidforge_list_collections\` for the palettes and \`liquidforge_inspect_preset\`
for one preset's exact numbers.

Overrides layer on top:

\`\`\`tsx
<LiquidHero
  object={{ type: "text", value: "SHIP IT" }}
  preset="mercury-3"
  palette={["#ff5f1f", "#1a1a1a", "#ffd6a5", "#7a2e0e"]}
  surface={{ advection: 1.1, trailSpacing: 0.14 }}
/>
\`\`\``,

  blend: `# The blend-mode trap

The signature effect is a headline that inverts to the complement of the liquid
behind it — teal over orange, olive over pink. It is one CSS line:

\`\`\`css
.blend { mix-blend-mode: difference; color: #fff; }
\`\`\`

\`<LiquidHero blend>\` applies it for you.

**But no ancestor may create a stacking context.** A \`z-index\`, a \`transform\`,
a \`filter\`, an \`opacity\` below 1, a \`will-change\`, a \`backdrop-filter\`, a
\`contain\`, or \`isolation: isolate\` on *any* parent isolates the blend group.
The text then composites against that parent's transparent backdrop instead of
against the canvas, and renders flat white over the object — with no error and
no clue as to why.

This is the single most common way to break the effect, and it is usually the
host layout that does it, not liquidforge. Things that commonly cause it:

- a page wrapper with \`transform: translateZ(0)\` for "GPU acceleration"
- an animation library's wrapper element mid-transition
- a fixed header given \`z-index: 50\`, if it wraps the hero rather than sitting beside it
- \`opacity\` on a fade-in wrapper

Fixes, in order of preference:

1. Handle painting order with **DOM order**, not \`z-index\`. \`<LiquidHero>\` does
   this internally: the canvas and the content are both positioned with
   \`z-index: auto\`, and positioned siblings paint in DOM order.
2. Move the offending property to an element that is not an ancestor of the hero.
3. If a fade-in is required, animate a child of the blended element rather than a parent.

In development \`<LiquidHero blend>\` walks the ancestor chain and logs the exact
element and property responsible. \`warnIfBlendIsolated(element)\` and
\`findBlendIsolator(element)\` are exported if you want to run the check yourself.`,

  shader: `# How the material works, and the four things that break it

Each of these was hit, diagnosed and fixed once already. They are all invisible
failures — nothing throws, the surface just looks wrong.

## 1. Rebuild the normals. This is the one.

Displacing vertices without recomputing normals leaves the lighting believing
the surface is undisturbed, so **dents and ripples are completely invisible**
however hard the geometry is pushed. You get a flat gradient, and you will spend
hours trying to fix it in the fragment shader, which is the wrong layer.

Liquidforge builds an orthonormal frame from the mesh's own normal — no UVs and
no tangent attribute needed, unlike \`computeTangents()\` — samples the height
field at two offsets in that tangent plane, and tilts the normal by the
gradient. That is algebraically the same as evaluating the surface at two
offsets and crossing the edges, and costs two fewer cross products.

## 2. Displacement direction has to be welded, shading normals do not

At a hard crease one position carries two different normals. Displacing each
along its own normal pulls the seam apart and opens a crack down every edge.
So the mesh carries two attributes: \`normal\` (averaged only within the crease
angle, keeps a letter's face crisp against its side wall) and \`flowNormal\`
(averaged across everything at a position, so the seam holds).

## 3. Cursor tracking must be a real ray cast

Projecting the object's disc flatly into screen space is only correct at dead
centre. Measured at 154px off-centre: the flat projection gave 0.781 where the
true perspective answer is 0.67 — the dent lands ~22px from the cursor, worse
toward the rim, and visitors read it instantly as "it isn't tracking me".
Liquidforge raycasts the mesh and falls back to the bounding sphere on a miss,
so the interaction parks at the silhouette instead of jumping.

Everything is resolved in **object space**, by transforming the ray through the
inverse world matrix. Doing it the other way — forbidding the mesh to rotate —
works until someone sets \`motion.autoRotate\`, and then the interaction drifts
out of step silently, worse the further it turns.

## 4. Ripples need a trail, not a single source

A single decaying "stir" scalar means all motion freezes the instant the mouse
stops. Instead there is a ring buffer of points the cursor has passed through,
each living out its own life afterwards. Rings are emitted on **distance
travelled**, not per frame — per-frame emission maps the frame rate rather than
the cursor's path, so the same gesture leaves a different wake on a 60Hz and a
120Hz display.

\`surface.trailSpacing\` is a preset field for a reason. At 0.07 a sweep drops
around 28 overlapping rings that smear into a tail *following* the cursor; at
0.26 it reads as a few separate stones dropped in a pond. Both are legitimate
looks.

## Bonus: the spiral comes from advection, not concentric rings

The scroll structure is a band curled around a bright core, and it comes from
rotating the colour field around each trail point — hard at the centre, weakly
further out. Differential rotation winds a smooth gradient into a spiral. It
runs **per pixel**; more triangles will not produce it, because the detail lives
between the vertices.

Critically, the twist is applied to a **separate normal used only for hue**.
Twisting the real shading normal aims it at the light and bleaches the cursor
into a white blob instead of swirling colour.`,

  performance: `# Performance

Fragment cost dominates, and it scales with the **square** of pixel ratio,
because the advection loop runs per pixel. In order of impact:

1. **Adaptive resolution.** \`quality="auto"\` measures real frame times and
   walks \`setPixelRatio\` between 0.75 and 2.0 every three quarters of a second.
   A fixed value either wastes a fast GPU or drops frames on a slow one, and
   which of those you have is not knowable up front.
2. **Early-out before the expensive maths.** Both loops reject trail entries on
   a squared distance, before any square root.
3. **One noise evaluation per vertex**, shared across the three samples the
   normal rebuild takes. At preset amplitudes it adds no relief of its own, so
   that is 2 lookups instead of 6.
4. \`antialias: false\`. A soft-edged liquid with a fresnel rim gains almost
   nothing from MSAA and it costs real fill rate.

The \`quality\` prop maps to pixel-ratio bounds, tessellation budget and trail
length:

| tier | pixel ratio | vertex budget | trail |
| --- | --- | --- | --- |
| \`auto\` | 0.75–2.0, measured | 160k | 12 |
| \`high\` | 1.5–2.0 | 400k | 16 |
| \`balanced\` | 1.0–1.5 | 160k | 12 |
| \`low\` | 0.75–1.0 | 60k | 8 |

Geometry is deliberately *not* adaptive: re-tessellating mid-scene rebuilds a
quarter of a million vertices on the main thread, which is a visible stall where
a pixel-ratio change is invisible.

For galleries, each canvas holds a WebGL context and browsers cap those at
roughly 16 before they silently drop the oldest. Mount only what is near the
viewport and hold a hard ceiling on the rest.`,

  accessibility: `# Accessibility

\`prefers-reduced-motion\` is honoured by default. When the visitor has asked for
reduced motion, the drift, the ripples and the advection all freeze and the
object renders as a still material — it does not disappear. Non-negotiable for
an effect this kinetic; \`motion.respectReducedMotion={false}\` exists but should
be left alone.

The canvas is decorative and carries no text, so headline and copy must live in
real DOM elements — which is what \`<LiquidHero>\`'s children slot is for. Do not
put the headline into the object and leave the page with no heading.

With \`blend\`, check contrast against the *whole* range the liquid sweeps
through, not one frame. Difference blending against a mid-tone can land near
invisible. Dark or light presets with a narrow palette are the safest choice
behind text.

Rendering pauses when the section scrolls out of view (\`pauseOffscreen\`).`,

  troubleshooting: `# Troubleshooting

**The surface looks like a flat gradient with no relief.**
Normals are not being rebuilt from the displaced surface. In liquidforge this is
handled, so the more likely cause is an ejected copy that lost the tangent-frame
block in the vertex shader. See the \`shader\` topic.

**The headline renders flat white instead of inverting.**
An ancestor is creating a stacking context. See the \`blend\` topic — in
development the component logs the exact element.

**Cracks appear along the hard edges of extruded text.**
The displacement is running along \`normal\` rather than \`flowNormal\`.

**The dent does not land under the cursor.**
Either a flat screen-space projection is being used instead of a ray cast, or
the mesh is rotating while the pointer is compared in object space.

**Nothing renders and the console says "Context Lost".**
Too many live WebGL contexts. Unmount previews that have scrolled away.

**A sphere shows a crease down the top.**
That is a UV sphere's pole. Liquidforge's \`shape: "sphere"\` is an icosphere for
exactly this reason; a \`.glb\` containing a UV sphere will still show it.

**Frame rate is poor on a laptop.**
Leave \`quality="auto"\` alone — it is measuring. If it is already low, the
object is probably a dense \`.glb\`; over 90k triangles the cursor probe also
falls back to the bounding sphere, which is a hint the mesh wants decimating.`,

  ejecting: `# Owning the source

\`\`\`bash
npx liquidforge add hero        # components + engine + material + forge
npx liquidforge add material    # just the shader and the render loop
npx liquidforge add forge       # just the object generators
\`\`\`

Copies the real source into the project. The shader lives in
\`material/glsl/\` — \`fragment.ts\` is where a new family goes, and it is a
\`#define\` branch alongside the five that ship.

If you add a family, keep the shared preamble: the advected hue field, the
analytic studio environment and the palette ramp are used by all of them.`,
} as const

export type TopicName = keyof typeof TOPICS

export const TOPIC_NAMES = Object.keys(TOPICS) as TopicName[]
