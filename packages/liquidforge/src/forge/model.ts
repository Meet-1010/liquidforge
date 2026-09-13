import {
  AnimationClip,
  BufferAttribute,
  BufferGeometry,
  LoadingManager,
  Mesh,
  Object3D,
  Vector3,
  type Material,
  type Texture,
} from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js"
import { LiquidRig, RIG_VERTEX_LIMIT, type RigSource } from "./rig"
import type { ModelObjectSource } from "../types"
import { APPEARANCE_STRIDE, MAX_SLOTS, buildAtlas, linearToSrgb, srgbOf, type Appearance } from "./appearance"

/** A 1x1 transparent PNG. Small enough to be free, real enough to decode. */
const BLANK_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

/**
 * Load the geometry and none of the pictures.
 *
 * Only positions survive this module, so every texture a glTF references is
 * downloaded and thrown away. On a Poly Haven asset that is several megabytes
 * of 1k maps for nothing, and on anything whose textures sit beside the file
 * rather than inside it, it is also three 404s in the console that look like a
 * bug in this library.
 *
 * Redirecting image requests to a data URI is the shortest way to opt out:
 * GLTFLoader still builds its materials, they are simply built around a pixel.
 */
function geometryOnlyManager(): LoadingManager {
  const manager = new LoadingManager()
  manager.setURLModifier((url) =>
    /\.(png|jpe?g|webp|avif|bmp|gif|tga)(\?|$)/i.test(url) ? BLANK_PIXEL : url,
  )
  return manager
}

interface LoadedGltf {
  scene: Object3D
  animations: AnimationClip[]
}

/** Bytes downloaded so far, and the total when the server reports one. */
export interface LoadProgress {
  loaded: number
  total: number
}

export type ProgressHandler = (progress: LoadProgress) => void

const cache = new Map<string, Promise<LoadedGltf>>()

/**
 * Give up rather than hang.
 *
 * A `.glb` that never arrives used to leave the surface saying "forging" for
 * ever — no error, no progress, nothing to distinguish a slow 40MB download
 * from a dead URL. Both read as broken, and only one of them is. The clock
 * resets on every chunk, so a genuinely slow connection is not punished for
 * being slow, only for being silent.
 */
const STALL_TIMEOUT_MS = 45_000

function loadGltf(src: string, onProgress?: ProgressHandler, withTextures = false): Promise<LoadedGltf> {
  // The geometry-only load and the textured load are different requests with
  // different results, so they cannot share an entry.
  const key = `${withTextures ? "textured" : "shape"}:${src}`
  const cached = cache.get(key)
  if (cached) return cached

  const promise = new Promise<LoadedGltf>((resolve, reject) => {
    let stalled: ReturnType<typeof setTimeout>
    let settled = false

    const resetStallTimer = () => {
      clearTimeout(stalled)
      stalled = setTimeout(() => {
        if (settled) return
        settled = true
        reject(
          new Error(
            `liquidforge: "${src}" stopped responding after ${STALL_TIMEOUT_MS / 1000}s. The file may be very large, or the host may be unreachable.`,
          ),
        )
      }, STALL_TIMEOUT_MS)
    }

    const done = <T>(fn: (value: T) => void) => (value: T) => {
      if (settled) return
      settled = true
      clearTimeout(stalled)
      fn(value)
    }

    resetStallTimer()

    new GLTFLoader(withTextures ? new LoadingManager() : geometryOnlyManager()).load(
      src,
      done((gltf: { scene: Object3D; animations?: AnimationClip[] }) =>
        resolve({ scene: gltf.scene, animations: gltf.animations ?? [] }),
      ),
      (event) => {
        resetStallTimer()
        onProgress?.({ loaded: event.loaded, total: event.total })
      },
      done((cause: unknown) => {
        const detail = cause instanceof Error ? cause.message : ""
        reject(
          new Error(
            `liquidforge: could not load "${src}".${detail ? ` ${detail}` : ""} Compressed meshes (Draco, Meshopt) and KTX2 textures need their own decoders, which this library does not bundle — re-export the model uncompressed, or upload a plain .glb.`,
          ),
        )
      }),
    )
  })
  // Don't cache rejections, or a transient network blip becomes permanent.
  promise.catch(() => cache.delete(key))
  cache.set(key, promise)
  return promise
}

/**
 * Flatten a `.glb` into one surface — and keep it moving, if it moves.
 *
 * A glTF is a scene graph: many meshes, each with its own transform, its own
 * material, and possibly a skeleton. The liquid surface is one shader over one
 * mesh, so everything is baked into world space and concatenated, and materials
 * are dropped. Only positions are kept, because the normals are rebuilt from
 * scratch anyway — a glTF's own are usually split for hard-surface shading,
 * which is the opposite of what a molten version of it wants.
 *
 * When the file carries animation, the scene graph is kept alive alongside the
 * flattened copy and `LiquidRig` re-bakes it every frame. Three.js's own GPU
 * skinning cannot be used here: it lives in the material, and this material is
 * a custom shader doing its own displacement — and in any case the mesh being
 * drawn is a weld of every mesh in the file, which no single skeleton indexes.
 */
export async function forgeModel(
  source: ModelObjectSource,
  onProgress?: ProgressHandler,
  options: { appearance?: boolean } = {},
): Promise<BufferGeometry> {
  if (!source.src) throw new Error("liquidforge: no model file chosen yet")

  const keepAppearance = options.appearance === true
  const loaded = await loadGltf(source.src, onProgress, keepAppearance)
  // SkeletonUtils.clone, not Object3D.clone: a plain clone leaves SkinnedMeshes
  // pointing at the original's bones, so two heroes sharing a cached glTF would
  // drive each other's skeletons.
  const scene = loaded.animations.length > 0 ? cloneSkinned(loaded.scene) : loaded.scene
  scene.updateWorldMatrix(true, true)

  const chunks: Float32Array[] = []
  const extraChunks: Float32Array[] = []
  const sources: RigSource[] = []
  let total = 0

  // One atlas slot per distinct image, however many materials point at it.
  const slotOf = new Map<unknown, number>()
  const atlasImages: CanvasImageSource[] = []
  const slotFor = (map: Texture | null | undefined): number => {
    const image = map?.image as CanvasImageSource | undefined
    if (!image) return -1
    const known = slotOf.get(image)
    if (known !== undefined) return known
    if (atlasImages.length >= MAX_SLOTS) return -1
    slotOf.set(image, atlasImages.length)
    atlasImages.push(image)
    return atlasImages.length - 1
  }

  const world = new Vector3()

  scene.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh || !mesh.geometry) return

    /*
     * The mesh keeps its geometry in LOCAL space and the flattened copy is in
     * world space, and the two must not be the same object.
     *
     * De-indexing is what forces the issue: the flattened buffer is
     * non-indexed, so an indexed mesh has to be converted, and the rig then has
     * to read from that same converted geometry or its vertex numbering will
     * not line up. Handing the mesh a copy that had already been baked into
     * world space meant the rig applied `matrixWorld` a second time on top of
     * the bone transform — the soldier came out as a scatter of stretched
     * shards that still, unhelpfully, animated.
     */
    const local = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
    if (local !== mesh.geometry) {
      mesh.geometry.dispose()
      mesh.geometry = local
    }

    const position = local.getAttribute("position")
    if (!position) return

    const array = new Float32Array(position.count * 3)
    for (let i = 0; i < position.count; i++) {
      world.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
      world.toArray(array, i * 3)
    }

    chunks.push(array)
    sources.push({ mesh, offset: total / 3, count: position.count })
    total += array.length

    if (keepAppearance) extraChunks.push(meshAppearance(mesh, local, position.count, slotFor))
  })

  if (total === 0) throw new Error(`liquidforge: "${source.src}" contains no meshes`)

  const positions = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    positions.set(chunk, offset)
    offset += chunk.length
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(positions, 3))

  if (keepAppearance) {
    const extras = new Float32Array((total / 3) * APPEARANCE_STRIDE)
    let at = 0
    for (const chunk of extraChunks) {
      extras.set(chunk, at)
      at += chunk.length
    }
    const { atlas, rects } = buildAtlas(atlasImages)
    geometry.userData.appearance = { extras, atlas, rects } satisfies Appearance
  }

  const vertices = total / 3
  if (loaded.animations.length > 0 && vertices <= RIG_VERTEX_LIMIT) {
    // Filled in by `fitGeometry`, which is the only thing that knows how the
    // rest pose was framed. The rig holds the same object, so it reapplies the
    // exact transform every frame instead of re-fitting and breathing.
    const fit = { offset: new Vector3(), scale: 1 }
    geometry.userData.fit = fit
    geometry.userData.rig = new LiquidRig(scene, sources, loaded.animations, fit)
  } else if (loaded.animations.length > 0) {
    geometry.userData.animationSkipped = `${vertices.toLocaleString()} vertices is past the ${RIG_VERTEX_LIMIT.toLocaleString()} a per-frame re-bake can carry, so this one is posed rather than animated.`
  }

  return geometry
}

/**
 * One mesh's surface, per vertex: its UV, its base colour, and its atlas slot.
 *
 * A glTF mesh can carry several materials, split by geometry groups, and each
 * can bring a colour factor, vertex colours and a base-colour map with its own
 * UV transform. All four are resolved here so the shader only ever sees one
 * colour and one lookup.
 */
function meshAppearance(
  mesh: Mesh,
  geometry: BufferGeometry,
  count: number,
  slotFor: (map: Texture | null | undefined) => number,
): Float32Array {
  const out = new Float32Array(count * APPEARANCE_STRIDE)
  const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as Array<
    Material & { color?: import("three").Color; map?: Texture | null; vertexColors?: boolean }
  >
  const uv = geometry.getAttribute("uv")
  const colour = geometry.getAttribute("color")
  const groups = geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count, materialIndex: 0 }]

  // Resolve each material once, not once per vertex.
  const resolved = materials.map((material) => {
    const map = material?.map ?? null
    if (map) map.updateMatrix()
    return {
      base: srgbOf(material?.color),
      map,
      slot: slotFor(map),
      vertexColours: Boolean(material?.vertexColors && colour),
    }
  })

  for (const group of groups) {
    const entry = resolved[group.materialIndex ?? 0] ?? resolved[0]
    if (!entry) continue
    const end = Math.min(count, group.start + group.count)
    const e = entry.map?.matrix.elements

    for (let v = group.start; v < end; v++) {
      const o = v * APPEARANCE_STRIDE
      let u = uv ? uv.getX(v) : 0
      let w = uv ? uv.getY(v) : 0
      if (e) {
        // KHR_texture_transform, as three already parsed it into the map.
        const tu = e[0] * u + e[3] * w + e[6]
        const tw = e[1] * u + e[4] * w + e[7]
        u = tu
        w = tw
      }
      // glTF maps are loaded unflipped, which matches the atlas; anything that
      // arrived flipped needs turning the right way up to match.
      if (entry.map?.flipY) w = 1 - w

      let [r, g, b] = entry.base
      if (entry.vertexColours && colour) {
        r *= linearToSrgb(colour.getX(v))
        g *= linearToSrgb(colour.getY(v))
        b *= linearToSrgb(colour.getZ(v))
      }

      out[o] = u
      out[o + 1] = w
      out[o + 2] = r
      out[o + 3] = g
      out[o + 4] = b
      out[o + 5] = entry.slot
    }
  }

  return out
}
