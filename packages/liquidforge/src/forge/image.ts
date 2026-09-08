import { BufferGeometry, ExtrudeGeometry } from "three"
import { contourBounds, contoursToShapes, traceContours } from "./contour"
import { fitTransform, rasterizeImage, thresholdRaster } from "./raster"
import type { ImageObjectSource } from "../types"

/**
 * Trace a raster image to a silhouette and extrude it.
 *
 * Only the silhouette, unlike glyphforge's image forge, which also has a relief
 * mode that displaces a grid by luminance. A liquid surface has its own relief
 * — the drift, the well, the ripples — and a second displacement fights it: the
 * photograph's bumps read as noise the ripples have to climb over. Logos,
 * icons and marks are what this mode is for, and they only ever needed the
 * outline.
 */
export async function forgeImage(source: ImageObjectSource): Promise<BufferGeometry> {
  const { src, depth = 0.45, threshold = 0.5 } = source
  if (!src) throw new Error("liquidforge: no image chosen yet")

  const resolution = Math.max(64, Math.min(1024, source.resolution ?? 512))
  const raster = await rasterizeImage(src, resolution)
  const { mask, width, height } = thresholdRaster(raster, threshold, "auto")
  const contours = traceContours(mask, width, height)

  if (contours.length === 0) {
    throw new Error(
      "liquidforge: nothing crossed the threshold. Try a different `threshold`, or an image with a clearer silhouette.",
    )
  }

  const bounds = contourBounds(contours)
  const { scale, offset } = fitTransform(bounds, 2)
  const shapes = contoursToShapes(contours, { smoothing: 1.4, scale, offset, flipY: true })
  if (shapes.length === 0) throw new Error("liquidforge: no closed outlines found in image")

  const geometry = new ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.1,
    bevelSize: depth * 0.1,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments: 8,
  })

  geometry.center()
  return geometry
}
