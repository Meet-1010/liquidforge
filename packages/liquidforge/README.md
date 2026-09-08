# Liquidforge

**Liquid 3D hero sections for React — and a browser-based forge, so you don't need a `.glb` to start.**

```tsx
import { LiquidHero } from "liquidforge"

<LiquidHero object={{ type: "text", value: "SHIP IT" }} preset="mercury-3" />
```

---

## The idea

Liquid-chrome heroes are all over Awwwards and almost nobody ships one, for two reasons.

1. **They're repos you fork, not packages you install.** Every one of them says *"now replace `model.glb` with your own"*. That step is where it dies: most people don't have a `.glb`, and getting one means Blender, a marketplace, or a licence they didn't read.
2. **The shader is the hard part and it's always buried.** Getting a displaced surface to actually *read* as liquid needs one specific thing — rebuilding the normals from the displaced surface — that almost no tutorial mentions. So people copy the code, see a flat gradient blob, and give up.

Liquidforge removes both. It's an installable component, it forges the object in your browser from a word or a logo or a primitive, and the material system is the product rather than an implementation detail.

---

## Install

```bash
npm install liquidforge three
```

Two peer dependencies: `react` (>=18) and `three` (>=0.160). No react-three-fiber, no postprocessing stack, and no HDRIs — the environment the metal reflects is computed analytically in the fragment shader.

Or scaffold it:

```bash
npx liquidforge init
```

---

## Objects

Any of these; they all arrive as one mesh, fitted into the same box, so the material never has to know which it was.

| type | input | notes |
| --- | --- | --- |
| `text` | a string | extruded from live browser text. Any font the page can render, emoji included |
| `svg` | `src` or `markup` | contours extruded directly |
| `image` | `src` | contour-traced to a silhouette, then extruded. Logos and icons — a photograph has no outline to find |
| `shape` | `sphere` `torus` `torusknot` `capsule` `icosahedron` `rounded-box` | parametric, no assets |
| `model` | a `.glb` URL | every mesh baked into one surface. Materials are dropped; animation is kept |

```tsx
<LiquidCanvas object={{ type: "text", value: "SHIP IT", depth: 0.5 }} />
<LiquidCanvas object={{ type: "shape", shape: "torusknot", detail: 128 }} />
<LiquidCanvas object={{ type: "model", src: "/models/logo.glb" }} />
```

### Don't have a model?

`liquidforge/catalog` searches five open catalogues — about 46,900 models —
from the browser, with no API key and no account, because all five serve
CORS-open metadata and files. The Studio's `/assets` page is this with a grid
around it.

```ts
import { searchAssets, randomAsset, resolveAssetUrl } from "liquidforge/catalog"

const { results } = await searchAssets({ query: "helmet", providers: ["khronos"] })
const src = await resolveAssetUrl("khronos", results[0].id)

// Or one at random out of every importable model in all four catalogues.
const surprise = await randomAsset()
const surpriseSrc = await surprise.resolveModelUrl()
```

`randomAsset` reaches into the packed Objaverse index rather than shuffling a
search page, so all 46,207 entries are actually reachable — a search returns a
handful per category, and shuffling that would mean "random among the first
slice" for ever. The draw is 25% from the curated sets and 75% weighted by
catalogue size, because the hand-picked models are the ones with the silhouettes
this material wants and pure size weighting would never show them.

Objaverse (46,207), Poly Haven (521, all CC0), Khronos (119), three.js (22) and
Sketchfab (search only — downloading needs an account). Licences come back
exactly as each catalogue states them; never infer one.

**What makes a good object here is not what makes a good render.** This material
reflects an environment off a displaced surface and carries almost no interior
detail, so a shape you can recognise from its outline survives and a cluttered
scene turns to soup. A photogrammetry scan of grass is 1.6 million triangles of
specks — it imports, but there is nothing to read.

Practical limits, all handled rather than hit:

- Over ~200k triangles the mesh is clustered down on import. `buildNormals`
  buckets every vertex, and a 1.6M-triangle scan is not slow, it is a frozen
  tab.
- Over ~90k triangles the cursor probe falls back to the bounding sphere
  instead of raycasting the mesh, because a per-frame raycast at that size
  costs more than the frame has.
- Textures are never downloaded. Only positions survive, so image requests are
  redirected to a blank pixel — which saves megabytes on a Poly Haven asset and
  removes the 404s from models whose textures sit beside the file.
- Draco and Meshopt geometry, and KTX2 textures, need decoders this package
  does not bundle. Re-export uncompressed.

### Animated models

Rigged and morph-target `.glb` files animate. Three.js's own GPU skinning
cannot be used here — it lives in the material, and this material is a custom
shader doing its own displacement, over a mesh that is every mesh in the file
welded into one. So the skinning happens on the CPU: the scene graph, the
skeleton and the mixer are kept alive off-screen, and each frame their result is
read back into the flat buffer the shader draws.

That is affordable because the welding is done once — which vertices started
life in the same place is a fact about topology, and a rig moving them does not
change it. Per frame it is one transform per vertex and a cross product per
face, with no hashing.

Past **60,000 vertices** a per-frame re-bake costs more than the frame has, so
the model is posed rather than animated. The models that actually animate are an
order of magnitude under that; a photogrammetry scan is not, and does not
animate.

```tsx
<LiquidHero
  object={{ type: "model", src: "/soldier.glb" }}
  motion={{ animation: "Run", animationSpeed: 1.2 }}
  onReady={({ animations }) => console.log(animations)}
/>
```

---

## Presets

Ninety colourways across ten families. A preset is **data** — a palette and about twenty numbers — so you can edit one, serialise it, or inline it.

Each family is a different *technique*, not a different palette. If a look can be reached by recolouring an existing family, it is a colourway rather than a family.

| family | look | reach for it when |
| --- | --- | --- |
| **Mercury** | liquid chrome, tinted | the default. Anything that should read as restrained |
| **Aurora** | iridescent oil slick | music, launches, anything that wants colour |
| **Prism** | glass with dispersion | product and hardware pages; reads as precision |
| **Magma** | molten, glowing in the troughs | loud. Games, events, energy |
| **Pearl** | soft matte iridescence | light pages, and anything that should feel calm |
| **Obsidian** | lacquer over a deep body | luxury, automotive, audio — expensive and restrained |
| **Velvet** | cloth, lit along the silhouette | fashion, film, interiors. The only family with no highlight |
| **Halo** | holographic foil | streetwear, drops, merch. Loud and prismatic |
| **Jade** | translucent stone | the second light-page family; wellness, craft, ceramics |
| **Plasma** | filaments in a dark body | AI, data, networks. Electric and technical |

Each colourway declares the ground it expects: `dark`, `mid`, `light` or
`transparent`. **Pearl** and **Jade** are lit for a light page. **Obsidian** and
**Velvet** ask for `mid`, a studio grey — a black lacquer or a deep velvet
against a near-black page is not subtle, it is invisible, which is the same
reason nobody photographs a black car against black.

Ids run `mercury-1` … `mercury-9`, `aurora-1` …, and so on. `npx liquidforge presets` lists them all.

Overrides layer on top of a colourway, merged one level deep, so you can move one number without restating the other nineteen:

```tsx
<LiquidHero
  object={{ type: "text", value: "SHIP IT" }}
  preset="mercury-3"
  palette={["#ff5f1f", "#1a1a1a", "#ffd6a5", "#7a2e0e"]}
  surface={{ advection: 1.1, trailSpacing: 0.14 }}
/>
```

---

## The blend-mode trap — read this before using `blend`

The signature effect is a headline that inverts to the complement of the liquid behind it: teal over orange, olive over pink. It's one CSS line, and `<LiquidHero blend>` applies it for you.

```css
.blend { mix-blend-mode: difference; color: #fff; }
```

**But no ancestor may create a stacking context.** A `z-index`, a `transform`, a `filter`, an `opacity` below 1, a `will-change`, a `backdrop-filter`, a `contain`, or `isolation: isolate` on *any* parent isolates the blend group. The text then composites against that parent's transparent backdrop instead of against the canvas, and renders flat white over the object — with no error and no clue as to why.

It's usually the host layout that does it, not this component. The usual suspects:

- a page wrapper with `transform: translateZ(0)` for "GPU acceleration"
- an animation library's wrapper mid-transition
- a fixed header given `z-index: 50`, if it *wraps* the hero rather than sitting beside it
- `opacity` on a fade-in wrapper

Fixes, best first:

1. **Handle painting order with DOM order, not `z-index`.** `<LiquidHero>` does this internally — the canvas and the content are both positioned with `z-index: auto`, and positioned siblings paint in DOM order.
2. Move the offending property onto an element that isn't an ancestor of the hero.
3. If you need a fade-in, animate a *child* of the blended element rather than a parent.

In development the component walks the ancestor chain and logs the exact element and property responsible. You can run that check yourself:

```ts
import { findBlendIsolator, warnIfBlendIsolated } from "liquidforge"
```

---

## Performance

Fragment cost dominates, and it scales with the **square** of pixel ratio, because the advection loop runs per pixel.

`quality="auto"` (the default) measures real frame times and walks `setPixelRatio` between 0.75 and 2.0 every three quarters of a second. A fixed value either wastes a fast GPU or drops frames on a slow one, and which of those a visitor has is not knowable up front.

| tier | pixel ratio | vertex budget | trail |
| --- | --- | --- | --- |
| `auto` | 0.75–2.0, measured | 160k | 12 |
| `high` | 1.5–2.0 | 400k | 16 |
| `balanced` | 1.0–1.5 | 160k | 12 |
| `low` | 0.75–1.0 | 60k | 8 |

Geometry is deliberately *not* adaptive: re-tessellating mid-scene rebuilds a quarter of a million vertices on the main thread, which is a visible stall where a pixel-ratio change is invisible.

Rendering pauses when the section scrolls out of view.

If you're building a gallery, remember each canvas holds a WebGL context and browsers cap those at roughly 16 before silently dropping the oldest. Mount only what's near the viewport.

---

## Reduced motion

`prefers-reduced-motion` is honoured by default. When the visitor has asked for reduced motion the drift, the ripples and the advection all freeze and the object renders as a still material — it doesn't disappear. `motion.respectReducedMotion={false}` exists; leave it alone.

The canvas carries no text, so your headline and copy have to live in real DOM elements. That's what the children slot is for.

---

## API

### `<LiquidHero />`

Everything `<LiquidCanvas />` takes, plus:

| prop | default | |
| --- | --- | --- |
| `layout` | `"overlay"` | `"overlay"` or `"split"` |
| `canvasSide` | `"right"` | which side the surface sits on in `split` |
| `height` | `"100vh"` | section height |
| `blend` | `false` | invert the content against the liquid |
| `children` | | your headline and copy |

### `<LiquidCanvas />`

| prop | default | |
| --- | --- | --- |
| `object` | a sphere | what to render |
| `preset` | `"mercury-1"` | a colourway id, or a whole `LiquidPreset` |
| `family` `palette` `surface` `shading` | | overrides layered on the preset |
| `quality` | `"auto"` | `auto` `high` `balanced` `low` |
| `motion` | | `{ autoRotate, tilt, draggable, respectReducedMotion }` |
| `transparent` | `false` | composite over the page |
| `background` | | override the preset's background colour |
| `pauseOffscreen` | `true` | stop rendering when scrolled past |
| `fallback` `errorFallback` `onReady` `onError` | | |

### Without React

`LiquidEngine` owns the whole render loop and has no React in it:

```ts
import { LiquidEngine, forgeGeometry, PRESETS } from "liquidforge"

const engine = new LiquidEngine({ container, preset: PRESETS["mercury-1"] })
engine.setGeometry(await forgeGeometry({ type: "text", value: "HI" }))
engine.resize(width, height)
engine.start()
```

---

## Owning the source

```bash
npx liquidforge add hero        # components + engine + material + forge
npx liquidforge add material    # just the shader and the render loop
npx liquidforge add forge       # just the object generators
```

Copies the real source into your project. The shader is in `material/glsl/`; `fragment.ts` is where a new family goes, as a `#define` branch alongside the five that ship.

---

## How it works, briefly

Four things, each of which fails silently if you get it wrong.

**Normals are rebuilt from the displaced surface.** Without this the lighting believes the surface is undisturbed, so dents and ripples are completely invisible however hard you push the geometry. The frame is built from the mesh's own normal — no UVs and no tangent attribute needed — and the normal is tilted by the gradient of the height field, which is algebraically the same as crossing two displaced tangent offsets and costs two fewer cross products.

**Displacement runs along a welded normal, shading along a crease-aware one.** At a hard edge one position carries two different normals; displacing each along its own tears the seam open. Two attributes, one job each.

**The cursor is found by ray cast, in object space.** A flat screen-space projection is only right at dead centre — measured 154px off-centre it put the dent 22px from the cursor, worse toward the rim, which visitors read instantly as "it isn't tracking me". Resolving in object space (rather than forbidding the mesh to rotate) means `motion.autoRotate` doesn't quietly drift the interaction out of step.

**Ripples come from a trail, not a single source.** A decaying "stir" scalar freezes every ripple the instant the mouse stops. Instead there's a ring buffer of points the cursor has passed through, each living out its own life — and rings are emitted on *distance travelled*, not per frame, so the same gesture leaves the same wake on a 60Hz and a 120Hz display.

The spiral, incidentally, is not concentric rings. It comes from rotating the colour field around each trail point — hard at the centre, weakly further out — per pixel. More triangles will not produce it, because the detail lives between the vertices.

---

## Licence

MIT © Meet Chauhan

The shader generalises the author's own liquid-sphere study, [form-flux-studio](https://github.com/Meet-1010/form-flux-studio), from one hard-coded sphere to arbitrary geometry with a library of looks.
