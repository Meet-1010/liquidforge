import { Box3, BufferGeometry, ExtrudeGeometry, Vector3 } from "three"
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"
import { APPEARANCE_STRIDE, MAX_SLOTS, srgbOf, type Appearance } from "./appearance"
import type { SvgObjectSource } from "../types"

/**
 * Extrude SVG paths into 3D.
 *
 * SVG already carries real outlines, so this skips the tracer entirely and goes
 * straight to `THREE.Shape` through three's own `SVGLoader`.
 */
export async function forgeSvg(
  source: SvgObjectSource,
  options: { appearance?: boolean } = {},
): Promise<BufferGeometry> {
  const { src, markup, depth = 0.45, bevel = 0.03 } = source

  let text = markup
  if (!text && src) {
    const response = await fetch(src)
    if (!response.ok) {
      throw new Error(`liquidforge: could not fetch SVG "${src}" (${response.status})`)
    }
    text = await response.text()
  }
  if (!text) throw new Error("liquidforge: svg source needs `src` or `markup`")

  const parsed = new SVGLoader().parse(text)
  const shapes = parsed.paths.flatMap((path) => SVGLoader.createShapes(path))

  if (shapes.length === 0) throw new Error("liquidforge: no drawable paths in SVG")

  const extrude = {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments: 12,
  }

  let geometry: BufferGeometry
  if (options.appearance) {
    /*
     * One extrusion per path, so each keeps the fill it was drawn with.
     *
     * A single ExtrudeGeometry over every shape is what the other families use
     * and it is cheaper, but it forgets which shape came from which path — and
     * which path is the only thing that knows its colour. Merged afterwards,
     * the result is the same mesh with the colours still attached.
     */
    const parts: BufferGeometry[] = []
    const colours: Array<[number, number, number, number]> = []
    let layer = 0
    for (const path of parsed.paths) {
      const pathShapes = SVGLoader.createShapes(path)
      if (pathShapes.length === 0) continue
      const part = new ExtrudeGeometry(pathShapes, extrude)
      // SVG paints later paths over earlier ones. Extruded at the same depth,
      // two overlapping paths occupy the same faces and z-fight into a torn,
      // interleaved edge — invisible in one colour, glaring in two. A hair of
      // depth per paint layer restores the order the file was drawn in.
      part.translate(0, 0, layer * depth * 0.025)
      layer++
      const [r, g, b] = srgbOf(path.color)
      colours.push([r, g, b, part.getAttribute("position").count])
      parts.push(part)
    }
    const merged = mergeGeometries(parts, false)
    for (const part of parts) part.dispose()
    if (!merged) throw new Error("liquidforge: could not merge the SVG's paths")
    geometry = merged

    const extras = new Float32Array(geometry.getAttribute("position").count * APPEARANCE_STRIDE)
    let v = 0
    for (const [r, g, b, count] of colours) {
      for (let i = 0; i < count; i++, v++) {
        const o = v * APPEARANCE_STRIDE
        extras[o + 2] = r
        extras[o + 3] = g
        extras[o + 4] = b
        extras[o + 5] = -1
      }
    }
    geometry.userData.appearance = {
      extras,
      atlas: null,
      rects: new Float32Array(MAX_SLOTS * 4),
    } satisfies Appearance
  } else {
    geometry = new ExtrudeGeometry(shapes, extrude)
  }

  // SVG's Y axis points down and its user units are arbitrary; normalise to a
  // centred 2-unit box so one camera framing works for every source.
  geometry.scale(1, -1, 1)
  geometry.center()

  const box = new Box3().setFromBufferAttribute(geometry.getAttribute("position") as never)
  const size = box.getSize(new Vector3())
  const longest = Math.max(size.x, size.y) || 1
  geometry.scale(2 / longest, 2 / longest, 1)

  geometry.center()
  return geometry
}
