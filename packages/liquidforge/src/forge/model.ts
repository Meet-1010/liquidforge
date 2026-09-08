import {
  AnimationClip,
  BufferAttribute,
  BufferGeometry,
  LoadingManager,
  Mesh,
  Object3D,
  Vector3,
} from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js"
import { LiquidRig, RIG_VERTEX_LIMIT, type RigSource } from "./rig"
import type { ModelObjectSource } from "../types"

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

const cache = new Map<string, Promise<LoadedGltf>>()

function loadGltf(src: string): Promise<LoadedGltf> {
  const cached = cache.get(src)
  if (cached) return cached

  const promise = new Promise<LoadedGltf>((resolve, reject) => {
    new GLTFLoader(geometryOnlyManager()).load(
      src,
      (gltf) => resolve({ scene: gltf.scene, animations: gltf.animations ?? [] }),
      undefined,
      (cause) => {
        const detail = cause instanceof Error ? cause.message : ""
        reject(
          new Error(
            `liquidforge: could not load "${src}".${detail ? ` ${detail}` : ""} Compressed meshes (Draco, Meshopt) and KTX2 textures need their own decoders, which this library does not bundle — re-export the model uncompressed, or upload a plain .glb.`,
          ),
        )
      },
    )
  })
  // Don't cache rejections, or a transient network blip becomes permanent.
  promise.catch(() => cache.delete(src))
  cache.set(src, promise)
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
export async function forgeModel(source: ModelObjectSource): Promise<BufferGeometry> {
  if (!source.src) throw new Error("liquidforge: no model file chosen yet")

  const loaded = await loadGltf(source.src)
  // SkeletonUtils.clone, not Object3D.clone: a plain clone leaves SkinnedMeshes
  // pointing at the original's bones, so two heroes sharing a cached glTF would
  // drive each other's skeletons.
  const scene = loaded.animations.length > 0 ? cloneSkinned(loaded.scene) : loaded.scene
  scene.updateWorldMatrix(true, true)

  const chunks: Float32Array[] = []
  const sources: RigSource[] = []
  let total = 0

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
