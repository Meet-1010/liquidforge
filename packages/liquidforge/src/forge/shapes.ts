import {
  BufferGeometry,
  CapsuleGeometry,
  IcosahedronGeometry,
  TorusGeometry,
  TorusKnotGeometry,
} from "three"
import type { ShapeObjectSource, ShapeKind } from "../types"

export const SHAPE_KINDS: ShapeKind[] = [
  "sphere",
  "torus",
  "torusknot",
  "capsule",
  "icosahedron",
  "rounded-box",
]

/**
 * Build a parametric primitive. Synchronous and asset-free.
 *
 * Tessellation matters more here than it would for a flat-shaded pipeline: the
 * ripples are vertex displacement, so a shape with too few vertices simply
 * cannot ripple. `prepareGeometry` will subdivide anything that arrives too
 * coarse, but generating it dense in the first place gives better-proportioned
 * triangles than subdividing a box would.
 */
export function forgeShape(source: ShapeObjectSource): BufferGeometry {
  const { shape, detail = 128 } = source
  const segments = Math.max(16, Math.min(512, Math.round(detail)))

  let geometry: BufferGeometry

  switch (shape) {
    case "sphere":
      // An icosphere, not a UV sphere. `SphereGeometry` has a pole singularity
      // and a seam: the pole triangles are slivers, so normals rebuilt from the
      // displaced surface pinch there and the seam draws a crease down the top
      // of the object. An icosphere has neither, and its triangles are all
      // about the same size, which is what the displacement wants.
      geometry = new IcosahedronGeometry(1, Math.max(3, Math.min(64, Math.round(segments / 12))))
      break

    case "icosahedron":
      // The faceted one. `prepareGeometry`'s crease angle is set below the
      // icosahedron's own 41.8 degrees, so the facets survive subdivision.
      geometry = new IcosahedronGeometry(1, 0)
      break

    case "torus":
      geometry = new TorusGeometry(0.72, 0.3, Math.max(16, Math.round(segments / 3)), segments)
      break

    case "torusknot":
      geometry = new TorusKnotGeometry(
        0.72,
        0.26,
        segments * 2,
        Math.max(16, Math.round(segments / 3)),
        2,
        3,
      )
      break

    case "capsule":
      geometry = new CapsuleGeometry(0.55, 1.1, Math.max(8, Math.round(segments / 6)), segments)
      break

    case "rounded-box":
      geometry = roundedBox(1.15, Math.max(4, Math.round(segments / 16)), 0.28)
      break

    default:
      geometry = new IcosahedronGeometry(1, 12)
  }

  geometry.center()
  geometry.computeVertexNormals()
  return geometry
}

/**
 * A rounded box, built by pushing a subdivided cube out onto a superellipsoid.
 *
 * `RoundedBoxGeometry` lives in three's examples and would be another deep
 * import; this is four lines of maths and gives a continuous surface, which the
 * displacement prefers to a bevel's hard seams.
 */
function roundedBox(size: number, segments: number, radius: number): BufferGeometry {
  // An icosphere again, for the same reason: a UV sphere's poles would land on
  // two faces of the box and pinch them.
  const geometry = new IcosahedronGeometry(1, segments)
  const position = geometry.getAttribute("position")
  // Higher exponent = squarer. 0.28 radius maps to roughly n = 6.
  const n = 2 / Math.max(0.02, radius)

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const k =
      Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n) + Math.pow(Math.abs(z), n)
    const scale = (size * Math.pow(k, -1 / n)) / 1
    position.setXYZ(i, x * scale, y * scale, z * scale)
  }

  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}
