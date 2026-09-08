/**
 * Asset search providers.
 *
 * Each catalogue's API and its file CDN both send `Access-Control-Allow-Origin: *`,
 * so search and import need no proxy, no API key, and no Liquidforge server —
 * because there isn't one.
 *
 * This module is isomorphic: it uses nothing but `fetch`, so it runs unchanged
 * in the browser (the Studio) and on Node 18+ (the MCP server). The single
 * environment-specific piece is where the Objaverse index is read from, which
 * `configureCatalog` injects.
 *
 * ## What a liquid surface wants from a catalogue
 *
 * Different from what an ASCII one wants, in two ways worth stating.
 *
 * Animation is irrelevant: `forgeModel` bakes every mesh in a glTF into a
 * single static surface, so a walking soldier arrives as a soldier-shaped lump
 * and the clips are dropped. There is deliberately no "animated only" filter
 * here — offering one would imply the rig survives.
 *
 * What matters instead is **silhouette and polycount**. The material reflects
 * an environment off a displaced surface, so a clean readable outline carries
 * the effect and interior detail mostly does not survive. Anything past ~90k
 * triangles also pushes the cursor probe onto the bounding sphere. Results
 * carry `polycount` where the catalogue reports it, and the Studio warns.
 */

export type ProviderId = "objaverse" | "polyhaven" | "khronos" | "threejs" | "sketchfab"

export interface AssetResult {
  id: string
  provider: ProviderId
  name: string
  author?: string
  /** Shown verbatim. Never guess a licence — link to the source instead. */
  license: string
  thumbnail?: string
  tags: string[]
  polycount?: number
  downloads?: number
  /**
   * `true`/`false` when the catalogue tells us; `undefined` when unknown.
   *
   * Not a filter — every clip is dropped when the mesh is flattened into one
   * liquid surface. It is here so the UI can say so before you import a rig
   * and wonder why it stands still.
   */
  animated?: boolean
  sourceUrl: string
  /** False for catalogues we can search but not legally auto-download. */
  importable: boolean
  /**
   * Objaverse knows only a category up front; the real name, author, licence
   * and thumbnail are fetched per card once it scrolls into view.
   */
  enrich?: boolean
  /** Some providers need a second request to resolve the loadable file. */
  resolveModelUrl: () => Promise<string>
}

export interface ProviderMeta {
  id: ProviderId
  label: string
  blurb: string
  homepage: string
  license: string
  importable: boolean
  /** Rough catalogue size, for the UI. */
  size: string
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "objaverse",
    label: "Objaverse",
    blurb: "46,000 models across 1,156 categories, from the Allen Institute's dataset.",
    homepage: "https://objaverse.allenai.org",
    license: "Per model — mostly CC-BY",
    importable: true,
    size: "46,207",
  },
  {
    id: "polyhaven",
    label: "Poly Haven",
    blurb: "Photoscanned and hand-modelled assets, every one CC0.",
    homepage: "https://polyhaven.com/models",
    license: "CC0 (public domain)",
    importable: true,
    size: "521",
  },
  {
    id: "threejs",
    label: "three.js",
    blurb: "The three.js example models. Small, clean, and the fastest thing to try.",
    homepage: "https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf",
    license: "Per model — check source",
    importable: true,
    size: "24",
  },
  {
    id: "khronos",
    label: "Khronos",
    blurb: "The official glTF sample models, including the standard animation tests.",
    homepage: "https://github.com/KhronosGroup/glTF-Sample-Assets",
    license: "Varies — check source",
    importable: true,
    size: "119",
  },
  {
    id: "sketchfab",
    label: "Sketchfab",
    blurb: "Millions of models. Search here, download from Sketchfab, then upload.",
    homepage: "https://sketchfab.com",
    license: "Per model — shown on each result",
    importable: false,
    size: "millions",
  },
]

const cache = <T,>() => {
  let promise: Promise<T> | null = null
  return (load: () => Promise<T>) => {
    if (!promise) {
      promise = load()
      promise.catch(() => {
        promise = null
      })
    }
    return promise
  }
}

// -- Objaverse ---------------------------------------------------------------

const OBJAVERSE_GLB =
  "https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs"

export interface ObjaverseIndex {
  version: number
  categories: Record<string, string>
}

/**
 * The Objaverse index is 1.7 MB, so where it comes from is deployment-specific:
 * the Studio serves it from `public/`, while a Node host reads it off disk or
 * from a CDN. Injecting the loader keeps this module free of both assumptions.
 */
export interface CatalogOptions {
  loadObjaverseIndex?: () => Promise<ObjaverseIndex>
}

let objaverseLoader: () => Promise<ObjaverseIndex> = async () => {
  const response = await fetch("/objaverse-index.json")
  if (!response.ok) throw new Error(`Objaverse index returned ${response.status}`)
  return response.json() as Promise<ObjaverseIndex>
}

let objaverseCache = cache<ObjaverseIndex>()

/** Override environment-specific catalogue plumbing. Call once at startup. */
export function configureCatalog(options: CatalogOptions): void {
  if (options.loadObjaverseIndex) {
    objaverseLoader = options.loadObjaverseIndex
    objaverseCache = cache<ObjaverseIndex>()
  }
}

function loadObjaverseIndex(): Promise<ObjaverseIndex> {
  return objaverseCache(() => objaverseLoader())
}

function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Objaverse entries are `<32-char uid><3-digit shard>`, joined per category.
 * The uid doubles as the Sketchfab uid, which is what makes it possible to link
 * every model to its own licence page instead of asserting one.
 */
function objaverseResults(index: ObjaverseIndex, terms: string[], perCategory: number) {
  const results: AssetResult[] = []

  for (const [category, packed] of Object.entries(index.categories)) {
    const label = category.replace(/_/g, " ")
    if (terms.length > 0 && !terms.every((term) => label.includes(term))) continue

    const entries = packed.split(",")
    for (const entry of entries.slice(0, perCategory)) {
      const uid = entry.slice(0, 32)
      const shard = entry.slice(32)
      results.push({
        id: uid,
        provider: "objaverse",
        name: titleCase(category),
        license: "CC-BY (check source)",
        tags: [category],
        sourceUrl: `https://sketchfab.com/models/${uid}`,
        importable: true,
        enrich: true,
        resolveModelUrl: async () => `${OBJAVERSE_GLB}/000-${shard}/${uid}.glb`,
      })
    }
  }

  return results
}

/**
 * Fill in a single Objaverse model's real name, author, licence and thumbnail.
 *
 * Only called for cards actually on screen, and memoised, so a long scroll does
 * not fan out into thousands of requests.
 */
const metadataCache = new Map<string, Promise<Partial<AssetResult> | null>>()

export function fetchSketchfabMetadata(uid: string): Promise<Partial<AssetResult> | null> {
  const cached = metadataCache.get(uid)
  if (cached) return cached

  const promise = fetch(`https://api.sketchfab.com/v3/models/${uid}`)
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (!data) return null
      return {
        name: data.name || undefined,
        author: data.user?.displayName,
        license: data.license?.label ?? "CC-BY (check source)",
        thumbnail: pickThumbnail(data.thumbnails?.images),
        animated: (data.animationCount ?? 0) > 0,
        polycount: data.faceCount,
      } satisfies Partial<AssetResult>
    })
    .catch(() => null)

  metadataCache.set(uid, promise)
  return promise
}

function pickThumbnail(images?: Array<{ url: string; width: number }>) {
  if (!images || images.length === 0) return undefined
  const sorted = [...images].sort((a, b) => a.width - b.width)
  return (sorted.find((image) => image.width >= 400) ?? sorted[sorted.length - 1]).url
}

// -- Poly Haven --------------------------------------------------------------

interface PolyHavenAsset {
  name: string
  categories?: string[]
  tags?: string[]
  authors?: Record<string, string>
  polycount?: number
  download_count?: number
  thumbnail_url?: string
}

const polyHavenCache = cache<AssetResult[]>()

function loadPolyHaven(): Promise<AssetResult[]> {
  return polyHavenCache(async () => {
    const response = await fetch("https://api.polyhaven.com/assets?t=models")
    if (!response.ok) throw new Error(`Poly Haven returned ${response.status}`)
    const data = (await response.json()) as Record<string, PolyHavenAsset>

    return Object.entries(data).map(([id, asset]) => ({
      id,
      provider: "polyhaven" as const,
      name: asset.name || id,
      author: Object.keys(asset.authors ?? {})[0],
      license: "CC0",
      thumbnail: asset.thumbnail_url,
      tags: [...(asset.categories ?? []), ...(asset.tags ?? [])],
      polycount: asset.polycount,
      downloads: asset.download_count,
      animated: false,
      sourceUrl: `https://polyhaven.com/a/${id}`,
      importable: true,
      resolveModelUrl: () => resolvePolyHavenUrl(id),
    }))
  })
}

/**
 * Poly Haven ships glTF with sibling `.bin` and texture files. Because the
 * whole directory is CORS-open, GLTFLoader resolves those relative paths on
 * its own — so the 1k variant loads unmodified. 1k keeps the import to a few
 * hundred KB; the ASCII pass cannot resolve 8k textures anyway.
 */
async function resolvePolyHavenUrl(id: string): Promise<string> {
  const response = await fetch(`https://api.polyhaven.com/files/${id}`)
  if (!response.ok) throw new Error(`Could not resolve files for "${id}"`)
  const files = (await response.json()) as {
    gltf?: Record<string, { gltf?: { url?: string } }>
  }

  const resolutions = files.gltf ? Object.keys(files.gltf) : []
  if (resolutions.length === 0) throw new Error(`"${id}" has no glTF variant`)

  const preferred = ["1k", "2k", "4k", "8k"].find((r) => resolutions.includes(r)) ?? resolutions[0]
  const url = files.gltf?.[preferred]?.gltf?.url
  if (!url) throw new Error(`"${id}" has no downloadable glTF file`)
  return url
}

// -- Khronos glTF Sample Assets ---------------------------------------------

interface KhronosModel {
  name: string
  label?: string
  screenshot?: string
  tags?: string[]
  variants?: Record<string, string>
}

const KHRONOS_BASE =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models"

/** The index carries no animation flag, so the standard rigs are listed here. */
const KHRONOS_ANIMATED = new Set([
  "AnimatedColorsCube", "AnimatedCube", "AnimatedMorphCube", "AnimatedMorphSphere",
  "AnimatedTriangle", "BoxAnimated", "BrainStem", "CesiumMan", "CesiumMilkTruck",
  "Fox", "InterpolationTest", "MorphPrimitivesTest", "MorphStressTest",
  "RecursiveSkeletons", "RiggedFigure", "RiggedSimple", "SimpleSkin",
  "SimpleMorph", "ToyCar", "VertexColorTest",
])

const khronosCache = cache<AssetResult[]>()

function loadKhronos(): Promise<AssetResult[]> {
  return khronosCache(async () => {
    const response = await fetch(`${KHRONOS_BASE}/model-index.json`)
    if (!response.ok) throw new Error(`Khronos index returned ${response.status}`)
    const models = (await response.json()) as KhronosModel[]

    return models
      // Only single-file .glb: the multi-file variants drag in sibling buffers
      // that complicate a one-click import.
      .filter((model) => model.variants?.["glTF-Binary"])
      .map((model) => ({
        id: model.name,
        provider: "khronos" as const,
        name: model.label || model.name,
        license: "Varies — check source",
        thumbnail: model.screenshot
          ? `${KHRONOS_BASE}/${model.name}/${model.screenshot}`
          : undefined,
        tags: model.tags ?? [],
        animated: KHRONOS_ANIMATED.has(model.name),
        sourceUrl: `https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/${model.name}`,
        importable: true,
        resolveModelUrl: async () =>
          `${KHRONOS_BASE}/${model.name}/glTF-Binary/${model.variants!["glTF-Binary"]}`,
      }))
  })
}

// -- three.js example models -------------------------------------------------

const THREE_BASE = "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf"

/**
 * Hand-picked for silhouette. A liquid surface has no interior detail to spend,
 * so a shape you can recognise from its outline alone — a duck, a bust, a
 * dragon — survives the treatment where a cluttered scene turns to soup.
 */
const THREE_MODELS: Array<{ file: string; name: string; animated: boolean; tags: string[] }> = [
  { file: "Flamingo.glb", name: "Flamingo", animated: true, tags: ["bird", "animal", "flying"] },
  { file: "Parrot.glb", name: "Parrot", animated: true, tags: ["bird", "animal", "flying"] },
  { file: "Stork.glb", name: "Stork", animated: true, tags: ["bird", "animal", "flying"] },
  { file: "Horse.glb", name: "Horse", animated: true, tags: ["animal", "running"] },
  { file: "Soldier.glb", name: "Soldier", animated: true, tags: ["character", "human", "walk", "run"] },
  { file: "Xbot.glb", name: "Xbot", animated: true, tags: ["character", "robot", "walk", "run"] },
  { file: "Michelle.glb", name: "Michelle", animated: true, tags: ["character", "human", "dance"] },
  { file: "LittlestTokyo.glb", name: "Littlest Tokyo", animated: true, tags: ["scene", "city", "diorama"] },
  { file: "BoomBox.glb", name: "Boom Box", animated: false, tags: ["prop", "stereo", "music"] },
  { file: "CarbonFrameBike.glb", name: "Carbon Frame Bike", animated: false, tags: ["vehicle", "bicycle"] },
  { file: "AnisotropyBarnLamp.glb", name: "Barn Lamp", animated: false, tags: ["prop", "lamp", "light"] },
  { file: "DragonAttenuation.glb", name: "Dragon", animated: false, tags: ["creature", "statue", "glass"] },
  { file: "DispersionTest.glb", name: "Dispersion Test", animated: false, tags: ["spheres", "glass"] },
  { file: "IridescenceLamp.glb", name: "Iridescence Lamp", animated: false, tags: ["prop", "lamp"] },
  { file: "SheenChair.glb", name: "Sheen Chair", animated: false, tags: ["furniture", "chair", "fabric"] },
  { file: "ClearcoatTest/ClearcoatTest.glb", name: "Clearcoat Test", animated: false, tags: ["spheres", "material"] },
  { file: "MaterialsVariantsShoe/glTF/MaterialsVariantsShoe.gltf", name: "Shoe", animated: false, tags: ["clothing", "shoe"] },
  { file: "IridescentDishWithOlives.glb", name: "Dish With Olives", animated: false, tags: ["food", "prop"] },
  { file: "Flower/Flower.glb", name: "Flower", animated: false, tags: ["plant", "nature"] },
  { file: "ShadowmappableMesh.glb", name: "Shadowmappable Mesh", animated: false, tags: ["abstract"] },
  { file: "coffeemat.glb", name: "Coffee Machine", animated: false, tags: ["prop", "machine", "coffee"] },
  { file: "Nefertiti/Nefertiti.glb", name: "Nefertiti", animated: false, tags: ["statue", "bust", "history"] },
  // Duck, Fox and AVIFTest used to sit here and no longer exist at this path.
  // Duck and Fox are Khronos sample assets anyway, so they are still one search
  // away — just under the provider that actually hosts them.
]

async function loadThreeJs(): Promise<AssetResult[]> {
  return THREE_MODELS.map((model) => ({
    id: model.file,
    provider: "threejs" as const,
    name: model.name,
    author: "three.js examples",
    license: "Per model — check source",
    tags: model.tags,
    animated: model.animated,
    sourceUrl: `${THREE_BASE}/${model.file}`,
    importable: true,
    resolveModelUrl: async () => `${THREE_BASE}/${model.file}`,
  }))
}

// -- Sketchfab (search only) -------------------------------------------------

interface SketchfabResult {
  uid: string
  name: string
  user?: { displayName?: string }
  license?: { label?: string }
  thumbnails?: { images?: Array<{ url: string; width: number }> }
  tags?: Array<{ name: string }>
  animationCount?: number
  faceCount?: number
  likeCount?: number
  viewerUrl?: string
  isDownloadable?: boolean
}

/**
 * The model's page on Sketchfab.
 *
 * The search endpoint returns every `viewerUrl` with a placeholder `none-`
 * slug. It redirects to the right page, but it reads as a broken link — and
 * this URL is handed to a person to click. The canonical uid form lands in the
 * same place and looks like what it is.
 */
function sketchfabPageUrl(model: SketchfabResult): string {
  const viewer = model.viewerUrl
  if (viewer && !viewer.includes("/3d-models/none-")) return viewer
  return `https://sketchfab.com/models/${model.uid}`
}

/**
 * Sketchfab's search endpoint is public, but downloading a model needs an OAuth
 * token tied to a real account. Rather than pretend, these results are marked
 * not-importable and send you to Sketchfab to download, then back here to
 * upload.
 */
async function searchSketchfab(query: string): Promise<AssetResult[]> {
  if (!query.trim()) return []

  const params = new URLSearchParams({
    type: "models",
    q: query,
    downloadable: "true",
    count: "24",
    sort_by: "-likeCount",
  })
  const response = await fetch(`https://api.sketchfab.com/v3/search?${params}`)
  if (!response.ok) throw new Error(`Sketchfab returned ${response.status}`)
  const data = (await response.json()) as { results?: SketchfabResult[] }

  return (data.results ?? []).map((model) => ({
    id: model.uid,
    provider: "sketchfab" as const,
    name: model.name,
    author: model.user?.displayName,
    license: model.license?.label ?? "Check source",
    thumbnail: pickThumbnail(model.thumbnails?.images),
    tags: (model.tags ?? []).map((tag) => tag.name),
    polycount: model.faceCount,
    downloads: model.likeCount,
    animated: (model.animationCount ?? 0) > 0,
    sourceUrl: sketchfabPageUrl(model),
    importable: false,
    resolveModelUrl: async () => {
      throw new Error("Sketchfab downloads need an account — open the source and download there.")
    },
  }))
}

// -- Direct resolution -------------------------------------------------------

/**
 * Resolve a loadable model URL from a provider and an id, without searching
 * first.
 *
 * Search returns a `resolveModelUrl` closure, which is convenient in a UI that
 * still holds the result but useless to a caller that only kept the id — an
 * agent handing a model to a user across two turns, say.
 */
export async function resolveAssetUrl(provider: ProviderId, id: string): Promise<string> {
  switch (provider) {
    case "threejs":
      return `${THREE_BASE}/${id}`

    case "polyhaven":
      return resolvePolyHavenUrl(id)

    case "khronos": {
      const models = await loadKhronos()
      const model = models.find((entry) => entry.id === id)
      if (!model) throw new Error(`"${id}" is not a Khronos sample model`)
      return model.resolveModelUrl()
    }

    case "objaverse": {
      const index = await loadObjaverseIndex()
      // The index packs `<32-char uid><3-digit shard>` per category, so the
      // shard has to be found before a download URL can be built.
      for (const packed of Object.values(index.categories)) {
        const at = packed.indexOf(id)
        if (at === -1) continue
        const shard = packed.slice(at + 32, at + 35)
        if (!/^\d{3}$/.test(shard)) continue
        return `${OBJAVERSE_GLB}/000-${shard}/${id}.glb`
      }
      throw new Error(`"${id}" is not in the Objaverse index`)
    }

    case "sketchfab":
      throw new Error(
        `Sketchfab downloads need an account, so there is no direct URL. Open https://sketchfab.com/models/${id} , download the glTF, then host the .glb yourself or upload it in the Studio.`,
      )
  }
}

// -- Search ------------------------------------------------------------------

/**
 * Past this a model needs clustering down before the displacement pass can
 * touch it, and the cursor probe falls back to the bounding sphere.
 */
export const HEAVY_POLYCOUNT = 200_000

export interface SearchOptions {
  query: string
  providers: ProviderId[]
  limit?: number
}

export interface SearchOutcome {
  results: AssetResult[]
  total: number
  /** Providers that failed, so the UI can say which rather than showing nothing. */
  failed: Array<{ provider: ProviderId; message: string }>
}

export async function searchAssets({
  query,
  providers,
  limit = 60,
}: SearchOptions): Promise<SearchOutcome> {
  const failed: SearchOutcome["failed"] = []
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  const run = async (provider: ProviderId): Promise<AssetResult[]> => {
    try {
      switch (provider) {
        case "objaverse": {
          const index = await loadObjaverseIndex()
          // Cap per category so one huge bucket cannot crowd out every other
          // match for a broad query.
          return objaverseResults(index, terms, terms.length > 0 ? 40 : 6)
        }
        case "polyhaven":
          return await loadPolyHaven()
        case "khronos":
          return await loadKhronos()
        case "threejs":
          return await loadThreeJs()
        case "sketchfab":
          return await searchSketchfab(query)
      }
    } catch (error) {
      failed.push({
        provider,
        message: error instanceof Error ? error.message : "Request failed",
      })
      return []
    }
  }

  const batches = await Promise.all(providers.map(run))
  const all = batches.flat()

  const matched = all.filter((asset) => {
    // Objaverse and Sketchfab already filtered server- or index-side.
    if (terms.length > 0 && asset.provider !== "objaverse" && asset.provider !== "sketchfab") {
      const haystack = `${asset.name} ${asset.tags.join(" ")} ${asset.author ?? ""}`.toLowerCase()
      if (!terms.every((term) => haystack.includes(term))) return false
    }
    return true
  })

  const ranked = [...matched].sort((a, b) => {
    if (a.importable !== b.importable) return a.importable ? -1 : 1
    // A million-triangle photogrammetry scan outranks everything on download
    // count and is close to the worst thing you can pick: the mesh has to be
    // clustered down before it can be processed at all, and what is left is a
    // field of specks. Popularity is the wrong signal for this material.
    const aHeavy = (a.polycount ?? 0) > HEAVY_POLYCOUNT ? 1 : 0
    const bHeavy = (b.polycount ?? 0) > HEAVY_POLYCOUNT ? 1 : 0
    if (aHeavy !== bHeavy) return aHeavy - bHeavy
    if (terms.length > 0) {
      const aName = a.name.toLowerCase().includes(terms[0]) ? 1 : 0
      const bName = b.name.toLowerCase().includes(terms[0]) ? 1 : 0
      if (aName !== bName) return bName - aName
    }
    // With no query this is a shop window, so lead with the curated sets:
    // three.js and Khronos are a few dozen clean, recognisable shapes, which is
    // a far better first impression than whatever Poly Haven downloads most.
    if (terms.length === 0) {
      const curated = (provider: ProviderId) =>
        provider === "threejs" || provider === "khronos" ? 0 : 1
      const order = curated(a.provider) - curated(b.provider)
      if (order !== 0) return order
    }
    return (b.downloads ?? 0) - (a.downloads ?? 0)
  })

  return { results: ranked.slice(0, limit), total: ranked.length, failed }
}

/**
 * One model at random, out of every importable thing in the catalogues.
 *
 * Not `searchAssets` with an empty query and a shuffle: that caps Objaverse at
 * a handful per category, so the same few thousand entries would come back for
 * ever and "random" would mean "random among the first slice". This reaches
 * into the packed index and picks a category and then an entry inside it, so
 * all 46,207 are actually reachable.
 *
 * Weighted by catalogue size, with a floor under the curated sets. Objaverse is
 * two orders of magnitude larger than the rest, so pure size weighting would
 * mean never seeing the hand-picked models — and those are the ones with the
 * silhouettes that suit this material.
 */
export interface RandomOptions {
  /** Where to draw from. Sketchfab is excluded; it cannot be imported. */
  providers?: ProviderId[]
  /** Chance of drawing from the curated sets rather than by size. @default 0.25 */
  curatedBias?: number
  /** Injectable for tests and for reproducible picks. */
  random?: () => number
}

/** Catalogue sizes, so the bulk draw is proportional rather than per-provider. */
const CATALOGUE_SIZE: Partial<Record<ProviderId, number>> = {
  objaverse: 46207,
  polyhaven: 521,
  khronos: 119,
  threejs: 22,
}

function pickWeighted(providers: ProviderId[], random: () => number): ProviderId {
  const total = providers.reduce((sum, id) => sum + (CATALOGUE_SIZE[id] ?? 1), 0)
  let roll = random() * total
  for (const id of providers) {
    roll -= CATALOGUE_SIZE[id] ?? 1
    if (roll <= 0) return id
  }
  return providers[providers.length - 1] ?? "objaverse"
}

export async function randomAsset(options: RandomOptions = {}): Promise<AssetResult> {
  const { curatedBias = 0.25, random = Math.random } = options
  const allowed = (options.providers ?? ["objaverse", "polyhaven", "threejs", "khronos"]).filter(
    (provider) => provider !== "sketchfab",
  )
  if (allowed.length === 0) throw new Error("randomAsset: no importable providers to draw from")

  const curated = allowed.filter((p) => p === "threejs" || p === "khronos")
  const bulk = allowed.filter((p) => p === "objaverse" || p === "polyhaven")

  // The two pools have to be disjoint. Drawing the second from *all* providers
  // let the curated sets win from both branches: 62% of rolls, against 19% for
  // the 46,207 models the button is nominally offering.
  const useCurated = curated.length > 0 && (bulk.length === 0 || random() < curatedBias)
  const provider = useCurated
    ? (curated[Math.floor(random() * curated.length)] ?? "threejs")
    : pickWeighted(bulk, random)

  if (provider === "objaverse") {
    const index = await loadObjaverseIndex()
    const categories = Object.keys(index.categories)
    if (categories.length === 0) throw new Error("randomAsset: the Objaverse index is empty")
    const category = categories[Math.floor(random() * categories.length)]
    const entries = index.categories[category].split(",")
    const entry = entries[Math.floor(random() * entries.length)]
    const uid = entry.slice(0, 32)
    const shard = entry.slice(32)
    return {
      id: uid,
      provider: "objaverse",
      name: titleCase(category),
      license: "CC-BY (check source)",
      tags: [category],
      sourceUrl: `https://sketchfab.com/models/${uid}`,
      importable: true,
      enrich: true,
      resolveModelUrl: async () => `${OBJAVERSE_GLB}/000-${shard}/${uid}.glb`,
    }
  }

  const batch =
    provider === "polyhaven"
      ? await loadPolyHaven()
      : provider === "khronos"
        ? await loadKhronos()
        : await loadThreeJs()

  if (batch.length === 0) throw new Error(`randomAsset: ${provider} returned nothing`)
  return batch[Math.floor(random() * batch.length)]
}

/** Total catalogue size, for the landing copy. */
export const TOTAL_ASSETS = 46207 + 521 + 119 + 24
