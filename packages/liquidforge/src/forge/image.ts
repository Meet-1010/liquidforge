import { Box3, BufferGeometry, ExtrudeGeometry, Vector3 } from "three"
import { contourBounds, contoursToShapes, traceContours } from "./contour"
import { fitTransform, loadImage, rasterizeImage, thresholdRaster } from "./raster"
import { APPEARANCE_STRIDE, buildAtlas, type Appearance } from "./appearance"
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
export async function forgeImage(
  source: ImageObjectSource,
  options: { appearance?: boolean } = {},
): Promise<BufferGeometry> {
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

  // Where the traced pixels ended up before centring, so each vertex can be
  // walked back to the pixel it came from.
  const centre = new Box3().setFromBufferAttribute(geometry.getAttribute("position") as never).getCenter(new Vector3())
  geometry.center()

  if (options.appearance) {
    /*
     * The image's own pixels, mapped straight back onto its silhouette.
     *
     * `contoursToShapes` placed each traced pixel at (px * scale + offset.x,
     * -py * scale + offset.y), and `center()` then shifted everything by
     * -centre. Inverting both gives the source pixel for every vertex, so the
     * front face shows the picture exactly where it was drawn, and the side
     * walls pick up the colour at the edge they were extruded from.
     */
    const image = await loadImage(src)
    const { atlas, rects } = buildAtlas([image])
    const position = geometry.getAttribute("position")
    const extras = new Float32Array(position.count * APPEARANCE_STRIDE)
    for (let v = 0; v < position.count; v++) {
      const o = v * APPEARANCE_STRIDE
      const px = (position.getX(v) + centre.x - offset.x) / scale
      const py = -(position.getY(v) + centre.y - offset.y) / scale
      extras[o] = Math.min(1, Math.max(0, px / width))
      extras[o + 1] = Math.min(1, Math.max(0, py / height))
      extras[o + 2] = 1
      extras[o + 3] = 1
      extras[o + 4] = 1
      extras[o + 5] = atlas ? 0 : -1
    }
    geometry.userData.appearance = { extras, atlas, rects } satisfies Appearance
  }

  return geometry
}
