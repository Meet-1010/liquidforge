import { BufferAttribute, BufferGeometry, Sphere, Vector3 } from "three"
import { APPEARANCE_STRIDE, type Appearance } from "../forge/appearance"

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
  /** Triangle count before decimation, when the input was too heavy to process. */
  decimatedFrom?: number
  /**
   * Vertices grouped by welded position, and the crease threshold used.
   *
   * Handed back so an animated mesh can rebuild its normals every frame without
   * redoing the bucketing, which is the expensive half and depends only on
   * topology — which does not change as a rig moves.
   */
  weld: WeldGroups
  /**
   * The source's own surface, when it was forged with one. The per-vertex part
   * is already on the geometry as `lfUv`, `lfSurface` and `lfSlot`; this is the
   * texture those read from.
   */
  appearance?: Pick<Appearance, "atlas" | "rects">
}

export interface WeldGroups {
  groups: number[][]
  creaseCos: number
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
  // Appearance is aligned with the source's non-indexed vertices. Every forge
  // that attaches one builds non-indexed geometry, so an indexed input carrying
  // one is a bug upstream — drop the surface rather than scramble it.
  const sourceAppearance = input.userData?.appearance as Appearance | undefined
  const appearance = sourceAppearance && !input.index ? sourceAppearance : undefined

  let geometry = input.index ? input.toNonIndexed() : input.clone()

  // Only position survives the pipeline — normals are rebuilt from scratch
  // below, and the one family that wants the source's surface has it carried
  // separately, in `extras`, so it can follow the vertices through every pass.
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position") geometry.deleteAttribute(name)
  }

  geometry.computeBoundingSphere()
  const radius = geometry.boundingSphere?.radius || 1
  const target = maxEdge * radius

  let positions = geometry.getAttribute("position").array as Float32Array
  let extras: Float32Array | null =
    appearance && appearance.extras.length === (positions.length / 3) * APPEARANCE_STRIDE ? appearance.extras : null

  // Anything from a public catalogue can be a photogrammetry scan — Poly Haven
  // ships grass at 1.6 million triangles. `buildNormals` below buckets every
  // vertex in a hash map, so a mesh that size is not slow, it is a frozen tab.
  // Clustering it down first is also no loss here: this material reflects an
  // environment off a displaced surface and has almost no interior detail to
  // spend, so what carries the effect is the silhouette, which survives.
  // A rig writes new positions into this buffer every frame, addressing
  // vertices by index. Decimating or subdividing renumbers them, so for an
  // animated source both passes are skipped and the vertex order is carried
  // through 1:1 — which is what `RIG_VERTEX_LIMIT` exists to keep affordable.
  const rigged = Boolean(input.userData?.rig)

  const inputTriangles = positions.length / 9
  const ceiling = vertexBudget / 3
  let decimatedFrom: number | undefined
  if (!rigged && inputTriangles > ceiling) {
    ;({ positions, extras } = decimate(positions, ceiling, extras))
    decimatedFrom = inputTriangles
  }

  // Uniform 1-to-4 splits, not longest-edge splits: every triangle subdivides
  // the same way, so neighbours always agree on their shared edge. Splitting
  // selectively would leave T-junctions, and a T-junction is exactly where a
  // displaced surface cracks open.
  let guard = rigged ? 0 : 6
  while (guard-- > 0) {
    const vertexCount = positions.length / 3
    if (vertexCount * 4 > vertexBudget) break
    if (edgePercentile(positions, 0.95) <= target) break
    ;({ positions, extras } = subdivide(positions, extras))
  }

  const creaseCos = Math.cos((creaseAngle * Math.PI) / 180)
  const groups = weldByPosition(positions)
  const normal = new Float32Array(positions.length)
  const flowNormal = new Float32Array(positions.length)
  computeNormals(positions, { groups, creaseCos }, normal, flowNormal)

  const out = new BufferGeometry()
  out.setAttribute("position", new BufferAttribute(positions, 3))
  out.setAttribute("normal", new BufferAttribute(normal, 3))
  out.setAttribute("flowNormal", new BufferAttribute(flowNormal, 3))
  if (extras) {
    const count = positions.length / 3
    const uv = new Float32Array(count * 2)
    const surface = new Float32Array(count * 3)
    const slot = new Float32Array(count)
    for (let v = 0; v < count; v++) {
      const o = v * APPEARANCE_STRIDE
      uv[v * 2] = extras[o]
      uv[v * 2 + 1] = extras[o + 1]
      surface[v * 3] = extras[o + 2]
      surface[v * 3 + 1] = extras[o + 3]
      surface[v * 3 + 2] = extras[o + 4]
      slot[v] = extras[o + 5]
    }
    // Prefixed so they can never collide with the `uv` and `color` three
    // declares for itself on a ShaderMaterial.
    out.setAttribute("lfUv", new BufferAttribute(uv, 2))
    out.setAttribute("lfSurface", new BufferAttribute(surface, 3))
    out.setAttribute("lfSlot", new BufferAttribute(slot, 1))
  }
  out.boundingSphere = new Sphere(new Vector3(), radius)
  out.computeBoundingBox()
  const extents = out.boundingBox
    ? out.boundingBox.getSize(new Vector3()).multiplyScalar(0.5)
    : new Vector3(radius, radius, radius)

  if (geometry !== input) geometry.dispose()

  return {
    geometry: out,
    radius,
    extents,
    triangles: positions.length / 9,
    decimatedFrom,
    weld: { groups, creaseCos },
    ...(extras && appearance ? { appearance: { atlas: appearance.atlas, rects: appearance.rects } } : {}),
  }
}

/**
 * Collapse a mesh onto a grid until it fits the budget.
 *
 * Vertex clustering (Rossignac-Borrel): snap every vertex to a cell, replace it
 * with that cell's centroid, and drop any triangle whose corners no longer
 * differ. Cruder than an edge-collapse decimator and far shorter, and it has
 * two properties that matter more here than fidelity — it is linear, so a
 * two-million-triangle scan is handled in one pass, and it emits *exactly*
 * equal positions for merged vertices, so the welding below has nothing left
 * to guess at.
 */
function decimate(
  positions: Float32Array,
  target: number,
  extras: Float32Array | null,
): { positions: Float32Array; extras: Float32Array | null } {
  let current = { positions, extras }
  // Roughly one cell per output vertex, and a surface of n cells per axis
  // carries on the order of n^2 of them.
  let cellsPerAxis = Math.max(8, Math.ceil(Math.sqrt(target)))

  for (let attempt = 0; attempt < 5; attempt++) {
    const next = cluster(current.positions, current.extras, cellsPerAxis)
    // A pass that removes nothing will not remove anything next time either.
    if (next.positions.length === 0 || next.positions.length >= current.positions.length) break
    current = next
    if (current.positions.length / 9 <= target) break
    cellsPerAxis = Math.max(8, Math.round(cellsPerAxis * 0.7))
  }

  return current
}

function cluster(
  positions: Float32Array,
  extras: Float32Array | null,
  cellsPerAxis: number,
): { positions: Float32Array; extras: Float32Array | null } {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i] < minX) minX = positions[i]
    if (positions[i] > maxX) maxX = positions[i]
    if (positions[i + 1] < minY) minY = positions[i + 1]
    if (positions[i + 1] > maxY) maxY = positions[i + 1]
    if (positions[i + 2] < minZ) minZ = positions[i + 2]
    if (positions[i + 2] > maxZ) maxZ = positions[i + 2]
  }

  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1
  const cell = extent / cellsPerAxis
  const stride = cellsPerAxis + 2

  const cellOf = (i: number) => {
    const x = Math.floor((positions[i] - minX) / cell)
    const y = Math.floor((positions[i + 1] - minY) / cell)
    const z = Math.floor((positions[i + 2] - minZ) / cell)
    return (z * stride + y) * stride + x
  }

  // Numeric keys, not strings: at this size the difference is seconds.
  const sums = new Map<number, [number, number, number, number]>()
  for (let i = 0; i < positions.length; i += 3) {
    const key = cellOf(i)
    const entry = sums.get(key)
    if (entry) {
      entry[0] += positions[i]
      entry[1] += positions[i + 1]
      entry[2] += positions[i + 2]
      entry[3]++
    } else {
      sums.set(key, [positions[i], positions[i + 1], positions[i + 2], 1])
    }
  }

  const centroids = new Map<number, [number, number, number]>()
  for (const [key, [x, y, z, count]] of sums) {
    centroids.set(key, [x / count, y / count, z / count])
  }

  const out: number[] = []
  const outExtras: number[] = []
  for (let t = 0; t < positions.length; t += 9) {
    const ka = cellOf(t)
    const kb = cellOf(t + 3)
    const kc = cellOf(t + 6)
    // Two corners in one cell means the triangle collapsed to an edge.
    if (ka === kb || kb === kc || kc === ka) continue
    const a = centroids.get(ka)!
    const b = centroids.get(kb)!
    const c = centroids.get(kc)!
    out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
    if (extras) {
      // The surviving triangle keeps its own corners' surface rather than a
      // cell average: averaging UVs across two texture islands lands in the
      // gutter between them, and a triangle's corners always share an island.
      const v = t / 3
      for (let k = 0; k < 3; k++) {
        const o = (v + k) * APPEARANCE_STRIDE
        for (let s = 0; s < APPEARANCE_STRIDE; s++) outExtras.push(extras[o + s])
      }
    }
  }

  return { positions: new Float32Array(out), extras: extras ? new Float32Array(outExtras) : null }
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
function subdivide(
  positions: Float32Array,
  extras: Float32Array | null,
): { positions: Float32Array; extras: Float32Array | null } {
  const triangles = positions.length / 9
  const out = new Float32Array(triangles * 4 * 9)
  const mid = new Float32Array(9) // ab, bc, ca

  const S = APPEARANCE_STRIDE
  const outExtras = extras ? new Float32Array(triangles * 4 * 3 * S) : null
  const midExtras = new Float32Array(3 * S)

  let w = 0
  let we = 0
  const push = (source: Float32Array, offset: number) => {
    out[w++] = source[offset]
    out[w++] = source[offset + 1]
    out[w++] = source[offset + 2]
  }
  const pushExtras = (source: Float32Array, offset: number) => {
    if (!outExtras) return
    for (let s = 0; s < S; s++) outExtras[we++] = source[offset + s]
  }

  for (let t = 0; t < triangles; t++) {
    const o = t * 9
    const oe = t * 3 * S
    for (let k = 0; k < 3; k++) {
      const a = o + k * 3
      const b = o + ((k + 1) % 3) * 3
      mid[k * 3] = (positions[a] + positions[b]) * 0.5
      mid[k * 3 + 1] = (positions[a + 1] + positions[b + 1]) * 0.5
      mid[k * 3 + 2] = (positions[a + 2] + positions[b + 2]) * 0.5
      if (extras) {
        // A midpoint of a UV is exactly what the rasteriser would have
        // interpolated there, so subdividing never moves the texture.
        const ea = oe + k * S
        const eb = oe + ((k + 1) % 3) * S
        for (let s = 0; s < S; s++) midExtras[k * S + s] = (extras[ea + s] + extras[eb + s]) * 0.5
      }
    }

    // (a, ab, ca) (ab, b, bc) (ca, bc, c) (ab, bc, ca)
    push(positions, o); push(mid, 0); push(mid, 6)
    push(mid, 0); push(positions, o + 3); push(mid, 3)
    push(mid, 6); push(mid, 3); push(positions, o + 6)
    push(mid, 0); push(mid, 3); push(mid, 6)

    if (extras) {
      pushExtras(extras, oe); pushExtras(midExtras, 0); pushExtras(midExtras, 2 * S)
      pushExtras(midExtras, 0); pushExtras(extras, oe + S); pushExtras(midExtras, S)
      pushExtras(midExtras, 2 * S); pushExtras(midExtras, S); pushExtras(extras, oe + 2 * S)
      pushExtras(midExtras, 0); pushExtras(midExtras, S); pushExtras(midExtras, 2 * S)
    }
  }

  return { positions: out, extras: outExtras }
}

/**
 * Bucket vertices by welded position.
 *
 * Topology only, so an animated mesh does this once and reuses it for every
 * frame — it is the expensive half, and a rig moving its vertices does not
 * change which of them started life in the same place.
 *
 * Quantising at 1e-4 of the model's own scale is coarse enough to absorb the
 * float error between two subdivision paths that should have produced the same
 * point, and still two orders of magnitude finer than the closest genuinely
 * distinct vertices the tessellation budget allows.
 */
function weldByPosition(positions: Float32Array): number[][] {
  const vertexCount = positions.length / 3

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

  return [...buckets.values()]
}

/**
 * Two normal sets from one non-indexed mesh, given its weld groups.
 *
 * `flowNormal` sums every face touching a position. `normal` sums only the
 * faces within the crease angle of the one this vertex belongs to.
 */
export function computeNormals(
  positions: Float32Array,
  weld: WeldGroups,
  normal: Float32Array,
  flowNormal: Float32Array,
): void {
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

  const smooth = new Vector3()
  const flow = new Vector3()
  const own = new Vector3()
  const other = new Vector3()

  for (const bucket of weld.groups) {
    flow.set(0, 0, 0)
    for (const v of bucket) {
      const t = (v / 3) | 0
      other.fromArray(faceNormals, t * 3).multiplyScalar(faceAreas[t])
      flow.add(other)
    }
    if (flow.lengthSq() < 1e-20) flow.fromArray(faceNormals, ((bucket[0] / 3) | 0) * 3)
    flow.normalize()

    for (const v of bucket) {
      const t = (v / 3) | 0
      own.fromArray(faceNormals, t * 3)
      smooth.set(0, 0, 0)
      for (const w of bucket) {
        const tw = (w / 3) | 0
        other.fromArray(faceNormals, tw * 3)
        if (other.dot(own) < weld.creaseCos) continue
        smooth.addScaledVector(other, faceAreas[tw])
      }
      if (smooth.lengthSq() < 1e-20) smooth.copy(own)
      smooth.normalize().toArray(normal, v * 3)
      flow.toArray(flowNormal, v * 3)
    }
  }
}
