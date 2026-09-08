import {
  AnimationClip,
  AnimationMixer,
  BufferAttribute,
  Mesh,
  Object3D,
  SkinnedMesh,
  Vector3,
  type BufferGeometry,
} from "three"

/**
 * Past this, re-baking every frame costs more than the frame has. The models
 * that actually animate — a flapping bird, a walking figure — are an order of
 * magnitude under it; a photogrammetry scan is not, and does not animate.
 */
export const RIG_VERTEX_LIMIT = 60_000

export interface RigSource {
  mesh: Mesh
  /** Where this mesh's vertices begin in the flattened buffer. */
  offset: number
  count: number
}

/**
 * A glTF that moves, re-baked onto the liquid surface every frame.
 *
 * The material is a custom `ShaderMaterial` doing its own displacement and its
 * own normal rebuild, and the mesh it renders is every mesh in the file welded
 * into one surface. Neither of those survives three's GPU skinning path, so the
 * skinning happens here instead: the scene graph, the skeleton and the mixer
 * are all kept alive off-screen, and each frame their result is read back into
 * the flat buffer the shader draws.
 *
 * That is only affordable because the welding is done once. Which vertices
 * started life in the same place is a fact about topology, and a rig moving
 * them does not change it — so per frame this is a transform per vertex and a
 * cross product per face, with no hashing.
 *
 * Morph targets are applied before skinning, in that order, because that is the
 * order glTF defines and the order the bind pose expects.
 */
export class LiquidRig {
  private readonly mixer: AnimationMixer
  private readonly vertex = new Vector3()
  private readonly morph = new Vector3()

  /** Set once the geometry has been prepared and its weld groups are known. */
  private target: BufferGeometry | null = null
  private recompute: ((positions: Float32Array) => void) | null = null

  constructor(
    private readonly root: Object3D,
    private readonly sources: RigSource[],
    readonly clips: AnimationClip[],
    /** Centre-and-scale applied by `fitGeometry`, reapplied every frame. */
    private readonly fit: { offset: Vector3; scale: number },
  ) {
    this.mixer = new AnimationMixer(root)
    if (clips[0]) this.mixer.clipAction(clips[0]).play()
  }

  get names(): string[] {
    return this.clips.map((clip) => clip.name)
  }

  /** Switch clip. `true` plays the first one, a string picks it by name. */
  play(which: boolean | string = true): void {
    this.mixer.stopAllAction()
    if (which === false) return
    const clip =
      typeof which === "string" ? (AnimationClip.findByName(this.clips, which) ?? this.clips[0]) : this.clips[0]
    if (clip) this.mixer.clipAction(clip).play()
  }

  /**
   * Bind to the prepared geometry. Called by the engine once it knows the weld
   * groups, since those are what make the per-frame normal rebuild affordable.
   */
  bind(geometry: BufferGeometry, recompute: (positions: Float32Array) => void): void {
    this.target = geometry
    this.recompute = recompute
  }

  /** Advance by `delta` seconds and rewrite the surface. */
  update(delta: number): void {
    const geometry = this.target
    if (!geometry || !this.recompute) return

    this.mixer.update(delta)
    this.root.updateMatrixWorld(true)

    const positions = geometry.getAttribute("position").array as Float32Array

    for (const source of this.sources) {
      const mesh = source.mesh
      const base = mesh.geometry.getAttribute("position")
      if (!base) continue

      const skinned = (mesh as SkinnedMesh).isSkinnedMesh ? (mesh as SkinnedMesh) : null
      skinned?.skeleton?.update()

      const morphs = mesh.geometry.morphAttributes?.position
      const influences = mesh.morphTargetInfluences
      const relative = mesh.geometry.morphTargetsRelative !== false

      for (let i = 0; i < source.count; i++) {
        this.vertex.fromBufferAttribute(base, i)

        if (morphs && influences) {
          for (let m = 0; m < morphs.length; m++) {
            const influence = influences[m]
            if (!influence) continue
            this.morph.fromBufferAttribute(morphs[m], i)
            // glTF morph targets are offsets from the base; the absolute form
            // exists in older assets and has to replace rather than add.
            if (relative) this.vertex.addScaledVector(this.morph, influence)
            else this.vertex.lerp(this.morph, influence)
          }
        }

        if (skinned) skinned.applyBoneTransform(i, this.vertex)
        this.vertex.applyMatrix4(mesh.matrixWorld)

        // Same centre-and-scale the rest pose was fitted with, so the object
        // does not breathe in and out as its bounds change.
        this.vertex.add(this.fit.offset).multiplyScalar(this.fit.scale)
        this.vertex.toArray(positions, (source.offset + i) * 3)
      }
    }

    this.recompute(positions)
    ;(geometry.getAttribute("position") as BufferAttribute).needsUpdate = true
    ;(geometry.getAttribute("normal") as BufferAttribute).needsUpdate = true
    ;(geometry.getAttribute("flowNormal") as BufferAttribute).needsUpdate = true
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.root)
    this.target = null
    this.recompute = null
  }
}
