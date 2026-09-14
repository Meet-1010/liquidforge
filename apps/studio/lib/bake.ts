import {
  AnimationClip,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NumberKeyframeTrack,
  Vector3,
} from "three"
import { prepareGeometry, type LiquidPreset, type ObjectSource } from "liquidforge"
import { forgeGeometry } from "liquidforge/forge"

/**
 * A liquid object that can leave the browser: a looping GLB for AR.
 *
 * The shader cannot travel into an AR viewer, but its motion can. The surface
 * is refined the way the engine refines it, then rippled on the CPU through
 * one closed loop — rings that rise from nothing and fade to nothing within
 * the loop, so the last frame leads back into the first — and each frame is
 * stored as a morph target, positions and normals both, driven by a clip that
 * crossfades from one frame to the next. The material is a real PBR material
 * built from the colourway's own shading numbers.
 */

export interface BakeOptions {
  frames?: number
  seconds?: number
  /** Longest side, in metres, as it will appear on a desk. */
  size?: number
  vertexBudget?: number
}

function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

export async function bakeLiquid(object: ObjectSource, preset: LiquidPreset, options: BakeOptions = {}): Promise<{ glb: Blob; usdz: Blob }> {
  const { frames = 20, seconds = 3, size = 0.25, vertexBudget = 9000 } = options
  const forged = await forgeGeometry(object)
  const prepared = prepareGeometry(forged, { maxEdge: 0.09, vertexBudget })
  forged.dispose()
  const source = prepared.geometry
  const base = source.getAttribute("position").array as Float32Array
  const flow = (source.getAttribute("flowNormal") ?? source.getAttribute("normal")).array as Float32Array
  const count = base.length / 3
  const radius = prepared.radius

  // Rings from fixed points on the surface, each on its own phase of the loop.
  const random = seeded(7)
  const rings = Array.from({ length: 7 }, () => {
    const index = Math.floor(random() * count) * 3
    return { x: base[index], y: base[index + 1], z: base[index + 2], phase: random(), amp: 0.6 + random() * 0.6 }
  })
  const amplitude = radius * 0.03
  const width = radius * 0.12
  const speed = radius * 1.4

  const groups = prepared.weld.groups
  const morphPositions: BufferAttribute[] = []
  const morphNormals: BufferAttribute[] = []
  const baseNormals = source.getAttribute("normal").array as Float32Array
  const displaced = new Float32Array(base.length)
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()

  for (let f = 0; f < frames; f++) {
    const t = f / frames
    for (let v = 0; v < count; v++) {
      const i = v * 3
      let height = Math.sin((t + base[i] / radius * 0.35) * Math.PI * 2) * amplitude * 0.35
      for (const ring of rings) {
        const age = (t - ring.phase + 1) % 1
        const distance = Math.hypot(base[i] - ring.x, base[i + 1] - ring.y, base[i + 2] - ring.z)
        const front = distance - speed * age
        // Zero at both ends of its life, so the loop has no seam.
        const life = 4 * age * (1 - age)
        height += Math.sin(front / width * Math.PI) * Math.exp(-(front * front) / (width * width * 2)) * life * ring.amp * amplitude
      }
      displaced[i] = base[i] + flow[i] * height
      displaced[i + 1] = base[i + 1] + flow[i + 1] * height
      displaced[i + 2] = base[i + 2] + flow[i + 2] * height
    }

    // Normals of the displaced surface, smoothed across welded positions.
    const faceNormals = new Float32Array(base.length)
    for (let v = 0; v < count; v += 3) {
      a.fromArray(displaced, v * 3)
      b.fromArray(displaced, (v + 1) * 3)
      c.fromArray(displaced, (v + 2) * 3)
      b.sub(a)
      c.sub(a)
      b.cross(c)
      for (let k = 0; k < 3; k++) faceNormals.set([b.x, b.y, b.z], (v + k) * 3)
    }
    // Each vertex starts from its own face, then shares with every face at its position.
    const normals = new Float32Array(base.length)
    for (let v = 0; v < count; v++) {
      const i = v * 3
      const length = Math.hypot(faceNormals[i], faceNormals[i + 1], faceNormals[i + 2]) || 1
      normals.set([faceNormals[i] / length, faceNormals[i + 1] / length, faceNormals[i + 2] / length], i)
    }
    for (const group of groups) {
      let x = 0
      let y = 0
      let z = 0
      for (const v of group) {
        x += faceNormals[v * 3]
        y += faceNormals[v * 3 + 1]
        z += faceNormals[v * 3 + 2]
      }
      const length = Math.hypot(x, y, z) || 1
      for (const v of group) normals.set([x / length, y / length, z / length], v * 3)
    }

    const positionDelta = new Float32Array(base.length)
    const normalDelta = new Float32Array(base.length)
    for (let i = 0; i < base.length; i++) {
      positionDelta[i] = displaced[i] - base[i]
      normalDelta[i] = normals[i] - baseNormals[i]
    }
    morphPositions.push(new BufferAttribute(positionDelta, 3))
    morphNormals.push(new BufferAttribute(normalDelta, 3))
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(base.slice(), 3))
  geometry.setAttribute("normal", new BufferAttribute(baseNormals.slice(), 3))
  geometry.morphAttributes.position = morphPositions
  geometry.morphAttributes.normal = morphNormals
  // The frames are stored as offsets from the rest surface, which is what glTF
  // targets are; without this, three treats them as absolute positions and the
  // exporter subtracts the surface from them a second time.
  geometry.morphTargetsRelative = true
  // Real-world size: the longest side becomes `size` metres, resting on the floor.
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const extent = box.getSize(new Vector3())
  const scale = size / Math.max(extent.x, extent.y, extent.z)

  // -- the material, from the colourway's own numbers ---------------------------------
  const { metalness, roughness, transmission = 0, ior = 1.5, thinFilm = 0, emissive = 0 } = preset.shading
  const palette = preset.palette.map((hex) => new Color(hex))
  const body = palette.reduce((sum, colour) => sum.add(colour), new Color(0, 0, 0)).multiplyScalar(1 / palette.length)
  const brightest = palette.reduce((best, colour) => (colour.getHSL({ h: 0, s: 0, l: 0 }).l > best.getHSL({ h: 0, s: 0, l: 0 }).l ? colour : best), palette[0])
  const material = new MeshPhysicalMaterial({
    color: metalness > 0.6 ? body.clone().lerp(new Color(1, 1, 1), 0.35) : body,
    metalness,
    roughness: Math.max(0.04, roughness),
    transmission,
    ior,
    thickness: transmission > 0 ? radius * scale * 0.6 : 0,
    iridescence: Math.min(1, thinFilm),
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [120, 480],
    emissive: emissive > 0 ? brightest : new Color(0, 0, 0),
    emissiveIntensity: Math.min(3, emissive),
  })

  const mesh = new Mesh(geometry, material)
  mesh.name = "liquid"
  mesh.scale.setScalar(scale)
  mesh.position.set(-(box.min.x + extent.x / 2) * scale, -box.min.y * scale, -(box.min.z + extent.z / 2) * scale)
  mesh.morphTargetInfluences = new Array(frames).fill(0)
  mesh.updateMorphTargets()

  // One weight at a time, handing over to the next frame and round to the first.
  const times: number[] = []
  const tracks: NumberKeyframeTrack[] = []
  for (let k = 0; k <= frames; k++) times.push((k / frames) * seconds)
  const weights: number[] = []
  for (let k = 0; k <= frames; k++) for (let f = 0; f < frames; f++) weights.push(f === k % frames ? 1 : 0)
  tracks.push(new NumberKeyframeTrack("liquid.morphTargetInfluences", times, weights))
  const clip = new AnimationClip("ripple", seconds, tracks)

  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js")
  const glbBuffer = (await new GLTFExporter().parseAsync(mesh, { binary: true, animations: [clip] })) as ArrayBuffer

  // Quick Look takes USDZ, and three writes it without animation or physical
  // extras: a still in a standard material is what an iPhone gets.
  const still = new Mesh(new BufferGeometry().copy(geometry), new MeshStandardMaterial({ color: material.color, metalness: material.metalness, roughness: material.roughness, emissive: material.emissive, emissiveIntensity: material.emissiveIntensity }))
  still.geometry.morphAttributes = {}
  still.scale.copy(mesh.scale)
  still.position.copy(mesh.position)
  const { USDZExporter } = await import("three/examples/jsm/exporters/USDZExporter.js")
  const usdzBuffer = await new USDZExporter().parseAsync(still)

  geometry.dispose()
  source.dispose()
  return { glb: new Blob([glbBuffer], { type: "model/gltf-binary" }), usdz: new Blob([new Uint8Array(usdzBuffer)], { type: "model/vnd.usdz+zip" }) }
}
