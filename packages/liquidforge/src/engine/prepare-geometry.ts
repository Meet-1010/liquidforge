import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from "three"

export interface PrepareOptions {
  /** Longest triangle edge to aim for, as a fraction of the bounding radius. */
  maxEdge: number
  /** Hard ceiling on vertices. Subdivision stops here however coarse it still is. */
  vertexBudget: number
  /**
   * Angle in degrees above which an edge stays sharp instead of being smoothed.
   * Below an icosahedron's own 41.8 degrees, so a faceted shape stays faceted.
   */
  creaseAngle?: number
}

export interface PreparedGeometry {
  geometry: BufferGeometry
  /** Bounding radius after preparation, for scale-independent presets. */
  radius: number
  /** Half-extents on each axis, for framing the camera. */
  extents: Vector3
  triangles: number
}

/**
 * Get any mesh ready to be displaced.
 *
 * Three problems, all of which a sphere hides and a torus knot or a piece of
 * extruded text exposes immediately:
 *
 * 1. **Not enough vertices.** A vertex shader can only move vertices that
 *    exist. `ExtrudeGeometry` gives a letter's face a handful of huge earcut
 *    triangles, and no amount of shader work will put a ripple across one.
 * 2. **Split vertices tear.** At a crease, one position carries two different
 *    normals. Displacing each along its own normal pulls the seam apart and
 *    opens a crack down every hard edge.
 * 3. **Faceted normals.** `ExtrudeGeometry` produces non-indexed geometry with
 *    face normals, so a curved side wall reads as flat panels — fatal for a
 *    material whose entire job is reflecting an environment.
 *
 * So: subdivide until the triangles are small enough (or the budget runs out),
 * then compute two normal sets from the result. `normal` averages only across
 * edges under the crease angle, which keeps a letter's front face crisp against
 * its side wall. `flowNormal` averages across everything at a position, so the
 * displacement direction is continuous and the seam holds together.
 */
export function prepareGeometry(
  input: BufferGeometry,
  { maxEdge, vertexBudget, creaseAngle = 35 }: PrepareOptions,
): PreparedGeometry {
  let geometry = input.index ? input.toNonIndexed() : input.clone()

  // Only position survives the pipeline — normals are rebuilt from scratch
  // below and nothing else in the shader reads the mesh's attributes.
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position") geometry.deleteAttribute(name)
  }

  geometry.computeBoundingSphere()
  const radius = geometry.boundingSphere?.radius || 1
  const target = maxEdge * radius

  let positions = geometry.getAttribute("position").array as Float32Array

  // Uniform 1-to-4 splits, not longest-edge splits: every triangle subdivides
  // the same way, so neighbours always agree on their shared edge. Splitting
  // selectively would leave T-junctions, and a T-junction is exactly where a
  // displaced surface cracks open.
  let guard = 6
  while (guard-- > 0) {
    const vertexCount = positions.length / 3
    if (vertexCount * 4 > vertexBudget) break
    if (edgePercentile(positions, 0.95) <= target) break
    positions = subdivide(positions)
  }

  const { normal, flowNormal } = buildNormals(positions, Math.cos((creaseAngle * Math.PI) / 180))

  const out = new BufferGeometry()
  out.setAttribute("position", new BufferAttribute(positions, 3))
  out.setAttribute("normal", new BufferAttribute(normal, 3))
  out.setAttribute("flowNormal", new BufferAttribute(flowNormal, 3))
  out.boundingSphere = new Sphere(new Vector3(), radius)
  out.computeBoundingBox()
  const extents = out.boundingBox
    ? out.boundingBox.getSize(new Vector3()).multiplyScalar(0.5)
    : new Vector3(radius, radius, radius)

  if (geometry !== input) geometry.dispose()

  return { geometry: out, radius, extents, triangles: positions.length / 9 }
}

/**
 * Edge length at a given percentile.
 *
 * The *longest* edge is the wrong measure: earcut leaves one sliver spanning a
 * whole letter, and chasing it would burn the entire vertex budget subdividing
 * everything else along with it.
 */
function edgePercentile(positions: Float32Array, percentile: number): number {
  const triangles = positions.length / 9
  const step = Math.max(1, Math.floor(triangles / 4000))
  const lengths: number[] = []

  for (let t = 0; t < triangles; t += step) {
    const o = t * 9
    lengths.push(
      dist(positions, o, o + 3),
      dist(positions, o + 3, o + 6),
      dist(positions, o + 6, o),
    )
  }
  if (lengths.length === 0) return 0
  lengths.sort((a, b) => a - b)
  return lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * percentile))]
}

function dist(p: Float32Array, a: number, b: number): number {
  const dx = p[a] - p[b]
  const dy = p[a + 1] - p[b + 1]
  const dz = p[a + 2] - p[b + 2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** Split every triangle into four by its edge midpoints. */
function subdivide(positions: Float32Array): Float32Array {
  const triangles = positions.length / 9
  const out = new Float32Array(triangles * 4 * 9)
  const mid = new Float32Array(9) // ab, bc, ca

  let w = 0
  const push = (source: Float32Array, offset: number) => {
    out[w++] = source[offset]
    out[w++] = source[offset + 1]
    out[w++] = source[offset + 2]
  }

  for (let t = 0; t < triangles; t++) {
    const o = t * 9
    for (let k = 0; k < 3; k++) {
      const a = o + k * 3
      const b = o + ((k + 1) % 3) * 3
      mid[k * 3] = (positions[a] + positions[b]) * 0.5
      mid[k * 3 + 1] = (positions[a + 1] + positions[b + 1]) * 0.5
      mid[k * 3 + 2] = (positions[a + 2] + positions[b + 2]) * 0.5
    }

    // (a, ab, ca) (ab, b, bc) (ca, bc, c) (ab, bc, ca)
    push(positions, o); push(mid, 0); push(mid, 6)
    push(mid, 0); push(positions, o + 3); push(mid, 3)
    push(mid, 6); push(mid, 3); push(positions, o + 6)
    push(mid, 0); push(mid, 3); push(mid, 6)
  }

  return out
}

/**
 * Two normal sets from one non-indexed mesh.
 *
 * `flowNormal` sums every face touching a position. `normal` sums only the
 * faces within the crease angle of the one this vertex belongs to.
 */
function buildNormals(positions: Float32Array, creaseCos: number) {
  const vertexCount = positions.length / 3
  const triangles = vertexCount / 3

  const faceNormals = new Float32Array(triangles * 3)
  const faceAreas = new Float32Array(triangles)

  const ax = new Vector3()
  const bx = new Vector3()
  const cx = new Vector3()
  const e1 = new Vector3()
  const e2 = new Vector3()
  const cross = new Vector3()

  for (let t = 0; t < triangles; t++) {
    const o = t * 9
    ax.fromArray(positions, o)
    bx.fromArray(positions, o + 3)
    cx.fromArray(positions, o + 6)
    e1.subVectors(bx, ax)
    e2.subVectors(cx, ax)
    cross.crossVectors(e1, e2)
    const area = cross.length()
    faceAreas[t] = area
    if (area > 1e-12) cross.divideScalar(area)
    else cross.set(0, 0, 1)
    cross.toArray(faceNormals, t * 3)
  }

  // Bucket vertices by welded position. Quantising at 1e-4 of the model's own
  // scale is coarse enough to absorb the float error between two subdivision
  // paths that should have produced the same point, and still two orders of
  // magnitude finer than the closest genuinely distinct vertices the
  // tessellation budget allows.
  let extent = 0
  for (let i = 0; i < positions.length; i++) {
    const v = Math.abs(positions[i])
    if (v > extent) extent = v
  }
  const quantum = Math.max(extent, 1e-6) * 1e-4
  const buckets = new Map<string, number[]>()

  for (let v = 0; v < vertexCount; v++) {
    const o = v * 3
    const key = `${Math.round(positions[o] / quantum)},${Math.round(positions[o + 1] / quantum)},${Math.round(positions[o + 2] / quantum)}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(v)
    else buckets.set(key, [v])
  }

  const normal = new Float32Array(vertexCount * 3)
  const flowNormal = new Float32Array(vertexCount * 3)
  const smooth = new Vector3()
  const flow = new Vector3()
  const own = new Vector3()
  const other = new Vector3()

  for (const bucket of buckets.values()) {
    flow.set(0, 0, 0)
    for (const v of bucket) {
      const t = (v / 3) | 0
      other.fromArray(faceNormals, t * 3).multiplyScalar(faceAreas[t])
      flow.add(other)
    }
    if (flow.lengthSq() < 1e-20) flow.fromArray(faceNormals, (((bucket[0] / 3) | 0) * 3))
    flow.normalize()

    for (const v of bucket) {
      const t = (v / 3) | 0
      own.fromArray(faceNormals, t * 3)
      smooth.set(0, 0, 0)
      for (const w of bucket) {
        const tw = (w / 3) | 0
        other.fromArray(faceNormals, tw * 3)
        if (other.dot(own) < creaseCos) continue
        smooth.addScaledVector(other, faceAreas[tw])
      }
      if (smooth.lengthSq() < 1e-20) smooth.copy(own)
      smooth.normalize().toArray(normal, v * 3)
      flow.toArray(flowNormal, v * 3)
    }
  }

  return { normal, flowNormal }
}
