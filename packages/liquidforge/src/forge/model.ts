import { BufferAttribute, BufferGeometry, Mesh, Object3D } from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import type { ModelObjectSource } from "../types"

interface LoadedGltf {
  scene: Object3D
}

const cache = new Map<string, Promise<LoadedGltf>>()

function loadGltf(src: string): Promise<LoadedGltf> {
  const cached = cache.get(src)
  if (cached) return cached

  const promise = new Promise<LoadedGltf>((resolve, reject) => {
    new GLTFLoader().load(
      src,
      (gltf) => resolve({ scene: gltf.scene }),
      undefined,
      () => reject(new Error(`liquidforge: failed to load model "${src}"`)),
    )
  })
  // Don't cache rejections, or a transient network blip becomes permanent.
  promise.catch(() => cache.delete(src))
  cache.set(src, promise)
  return promise
}

/**
 * Flatten a `.glb` into one geometry.
 *
 * A glTF is a scene graph — many meshes, each with its own transform and its
 * own material. The liquid surface is a single shader over a single mesh, so
 * everything gets baked into world space and concatenated. Materials, skins and
 * animation clips are dropped: none of them survive being turned into liquid.
 *
 * Only positions are kept, because `prepareGeometry` rebuilds the normals from
 * scratch anyway — a glTF's own normals are usually split for hard-surface
 * shading, which is the opposite of what a molten version of it wants.
 */
export async function forgeModel(source: ModelObjectSource): Promise<BufferGeometry> {
  if (!source.src) throw new Error("liquidforge: no model file chosen yet")

  const { scene } = await loadGltf(source.src)
  scene.updateWorldMatrix(true, true)

  const chunks: Float32Array[] = []
  let total = 0

  scene.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh || !mesh.geometry) return

    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)

    const position = geometry.getAttribute("position")
    if (position) {
      const array = new Float32Array(position.array as ArrayLike<number>)
      chunks.push(array)
      total += array.length
    }
    geometry.dispose()
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
  return geometry
}
