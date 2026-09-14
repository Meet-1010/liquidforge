import { Matrix4, Mesh, Ray, Raycaster, Vector2, Vector3, type BufferGeometry, type Camera } from "three"

export type ProbeMode = "mesh" | "sphere"

export interface SurfaceHit {
  /** Where the cursor is on the surface, in object space. */
  point: Vector3
  /** The surface normal there, in object space. */
  normal: Vector3
  /** True when the ray actually met the object rather than parking on its rim. */
  over: boolean
}

/**
 * Where the cursor is *on the object*.
 *
 * Projecting the object's disc flatly into screen space is only correct at dead
 * centre. Measured on the reference implementation at 154px off-centre: the
 * flat projection gave 0.781 where the true perspective answer is 0.67, so the
 * dent landed about 22px away from the cursor, and it got worse toward the rim.
 * Visitors read that instantly as "it isn't tracking me" (§5.2).
 *
 * So this casts a real ray. Everything is resolved in **object space**, by
 * transforming the ray through the inverse world matrix rather than by
 * forbidding the object to move. The shader compares the pointer against
 * object-space positions, so a rotating mesh would otherwise put the
 * interaction progressively out of step with the cursor — silently, and worse
 * the further it turns (§5.3).
 */
export class SurfaceProbe {
  private readonly raycaster = new Raycaster()
  private readonly inverse = new Matrix4()
  private readonly localRay = new Ray()
  private readonly toCentre = new Vector3()
  private readonly scratch = new Vector3()

  readonly point = new Vector3(0, 0, 1)
  readonly normal = new Vector3(0, 0, 1)
  over = false

  /**
   * The flat projection, kept only to be shown failing.
   *
   * Maps the pointer's NDC straight onto the object's disc with no camera in
   * the calculation at all. Measured on the reference implementation at 154px
   * off-centre it gave 0.781 where the true perspective answer is 0.67 — about
   * 22px of error, worse toward the rim.
   */
  flat(pointer: Vector2, mesh: Mesh): SurfaceHit {
    const radius = mesh.geometry.boundingSphere?.radius ?? 1
    const x = pointer.x
    const y = pointer.y
    const r2 = x * x + y * y
    const z = r2 < 1 ? Math.sqrt(1 - r2) : 0
    this.point.set(x, y, z).normalize().multiplyScalar(radius)
    this.normal.copy(this.point).normalize()
    this.over = r2 < 1
    return this
  }

  /**
   * `surface`, when given, is raycast in place of the mesh's own geometry — a
   * lighter version of the same shape, so a heavily refined mesh can still be
   * probed exactly. It shares the mesh's transform.
   */
  probe(pointer: Vector2, camera: Camera, mesh: Mesh, mode: ProbeMode, surface?: BufferGeometry | null): SurfaceHit {
    this.raycaster.setFromCamera(pointer, camera)

    mesh.updateWorldMatrix(true, false)
    this.inverse.copy(mesh.matrixWorld).invert()
    this.localRay.copy(this.raycaster.ray).applyMatrix4(this.inverse)

    if (mode === "mesh") {
      const own = mesh.geometry
      if (surface) mesh.geometry = surface
      let hits
      try {
        hits = this.raycaster.intersectObject(mesh, false)
      } finally {
        mesh.geometry = own
      }
      const first = hits[0]
      if (first) {
        this.point.copy(first.point).applyMatrix4(this.inverse)
        // `face.normal` is already in object space, which is the space the
        // ripple axis and the height field both live in.
        if (first.face) this.normal.copy(first.face.normal).normalize()
        else this.normal.copy(this.point).normalize()
        this.over = true
        return this
      }
    }

    return this.againstBoundingSphere(mesh, mode)
  }

  /**
   * Analytic ray/sphere against the object's own bounding sphere.
   *
   * Two jobs. For a sphere or a very dense mesh it *is* the probe — exact, and
   * free next to walking a hundred thousand triangles at pointer-move rates.
   * For everything else it is the miss path: the interaction parks at the
   * silhouette nearest the cursor instead of jumping back to wherever it was.
   */
  private againstBoundingSphere(mesh: Mesh, mode: ProbeMode): SurfaceHit {
    const sphere = mesh.geometry.boundingSphere
    const radius = sphere?.radius ?? 1
    const centre = sphere?.center ?? this.scratch.set(0, 0, 0)

    this.toCentre.copy(this.localRay.origin).sub(centre)
    const b = this.toCentre.dot(this.localRay.direction)
    const c = this.toCentre.lengthSq() - radius * radius
    const discriminant = b * b - c

    if (discriminant >= 0) {
      const distance = -b - Math.sqrt(discriminant)
      this.point
        .copy(this.localRay.direction)
        .multiplyScalar(distance)
        .add(this.localRay.origin)
      this.normal.copy(this.point).sub(centre).normalize()
      // A bounding-sphere hit only counts as "over the object" when the sphere
      // is standing in for the mesh. On the miss path the ray has already been
      // shown not to touch anything.
      this.over = mode === "sphere"
      return this
    }

    // No intersection at all: the closest point on the ray, pushed out to the
    // silhouette.
    this.point
      .copy(this.localRay.direction)
      .multiplyScalar(-b)
      .add(this.localRay.origin)
      .sub(centre)
      .normalize()
      .multiplyScalar(radius)
      .add(centre)
    this.normal.copy(this.point).sub(centre).normalize()
    this.over = false
    return this
  }
}
