import { Box3, BufferGeometry, Vector3 } from "three"
import type { ObjectSource } from "../types"
import { forgeImage } from "./image"
import { forgeModel, type ProgressHandler } from "./model"
import { forgeShape } from "./shapes"
import { forgeSvg } from "./svg"
import { forgeText } from "./text"

export { forgeText, DEFAULT_TEXT_FONT } from "./text"
export { forgeSvg } from "./svg"
export { forgeImage } from "./image"
export { forgeShape, SHAPE_KINDS } from "./shapes"
export { forgeModel, type LoadProgress, type ProgressHandler } from "./model"
export { LiquidRig, RIG_VERTEX_LIMIT, type RigSource } from "./rig"
export { exportModel, downloadModel, downloadBlob, type ExportOptions } from "./export"
export {
  traceContours,
  contoursToShapes,
  contourBounds,
  simplify,
  signedArea,
  type Point,
} from "./contour"
export { rasterizeText, rasterizeImage, thresholdRaster, loadImage, fitTransform } from "./raster"

/** What `<LiquidHero />` renders when given no `object`. */
export const DEFAULT_OBJECT: ObjectSource = { type: "shape", shape: "sphere", detail: 160 }

/**
 * Build geometry from any source.
 *
 * Shapes are synchronous; everything else needs canvas or network work, so the
 * entry point is async for a single call signature.
 */
export async function forgeGeometry(
  source: ObjectSource,
  onProgress?: ProgressHandler,
): Promise<BufferGeometry> {
  const geometry = await build(source, onProgress)
  return fitGeometry(geometry)
}

async function build(source: ObjectSource, onProgress?: ProgressHandler): Promise<BufferGeometry> {
  switch (source.type) {
    case "text":
      return forgeText(source)
    case "svg":
      return forgeSvg(source)
    case "image":
      return forgeImage(source)
    case "shape":
      return forgeShape(source)
    case "model":
      return forgeModel(source, onProgress)
    default: {
      const exhaustive: never = source
      throw new Error(`liquidforge: unknown object source ${JSON.stringify(exhaustive)}`)
    }
  }
}

/**
 * Centre and scale into a 2-unit box.
 *
 * Every preset's numbers — well depth, ripple amplitude, trail spacing — are
 * divided by the object's bounding radius in the shader, so they are already
 * scale-independent. Normalising here as well is what makes them *comparable*:
 * a colourway tuned on a sphere lands the same way on a `.glb` from anywhere,
 * and one camera framing works for all of them.
 */
export function fitGeometry(geometry: BufferGeometry, targetSize = 2): BufferGeometry {
  const position = geometry.getAttribute("position")
  if (!position) return geometry

  const box = new Box3().setFromBufferAttribute(position as never)
  if (box.isEmpty()) return geometry

  const size = box.getSize(new Vector3())
  const centre = box.getCenter(new Vector3())
  const longest = Math.max(size.x, size.y, size.z) || 1

  const scale = targetSize / longest
  geometry.translate(-centre.x, -centre.y, -centre.z)
  geometry.scale(scale, scale, scale)
  geometry.computeBoundingSphere()

  // An animated source needs to reapply exactly this every frame, or the object
  // rescales itself as its bounds change and appears to breathe.
  const fit = geometry.userData.fit as { offset: Vector3; scale: number } | undefined
  if (fit) {
    fit.offset.copy(centre).negate()
    fit.scale = scale
  }

  return geometry
}
