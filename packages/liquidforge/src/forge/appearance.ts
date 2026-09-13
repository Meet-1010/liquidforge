import { Color, SRGBColorSpace } from "three"

/**
 * What an object looked like before it was made liquid.
 *
 * Every other family throws the source's surface away — the pipeline keeps
 * positions and rebuilds normals, and nothing else survives. The `original`
 * family needs the opposite: the model's own textures, its vertex colours, an
 * image's pixels, an SVG's fills. This is the smallest shape that carries all
 * of those through subdivision and decimation to the shader.
 *
 * ## Per-vertex, plus one atlas
 *
 * Six floats ride along with every vertex: a UV, a base colour, and which slot
 * of the atlas that UV reads from (-1 for none). The textures themselves are
 * packed into a single canvas, because a liquid object is one mesh drawn with
 * one material, and a glTF can have a dozen materials each with its own map.
 *
 * Colours are kept as raw sRGB values rather than linearised. The families
 * write their output without a colour-space conversion, so a value that goes in
 * as the texture's own bytes comes out looking like the texture — which is the
 * entire promise of this family.
 */

/** u, v, r, g, b, slot */
export const APPEARANCE_STRIDE = 6

/** Distinct textures one object can carry. The shader loops this many times. */
export const MAX_SLOTS = 16

export interface Appearance {
  /** `APPEARANCE_STRIDE` floats per vertex, aligned with the non-indexed positions. */
  extras: Float32Array
  /** Every texture the object uses, packed. Null when it uses none. */
  atlas: HTMLCanvasElement | null
  /** `[x, y, w, h]` per slot in atlas UV space, `MAX_SLOTS * 4` long. */
  rects: Float32Array
}

const scratch = new Color()

/** A three `Color` (linear internally) as the sRGB bytes it was authored in. */
export function srgbOf(color: Color | undefined | null): [number, number, number] {
  if (!color) return [1, 1, 1]
  scratch.copy(color)
  const out = { r: 1, g: 1, b: 1 }
  scratch.getRGB(out, SRGBColorSpace)
  return [out.r, out.g, out.b]
}

/** glTF vertex colours are linear; bring them into the same space as the rest. */
export function linearToSrgb(value: number): number {
  const v = Math.max(0, Math.min(1, value))
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

/**
 * Pack textures into one square canvas.
 *
 * A plain grid, not a bin packer: the shader addresses a slot as a rectangle
 * and wraps UVs inside it, so every cell being the same size costs some texture
 * resolution on an object with one huge map and several small ones, and buys a
 * packer that cannot get anything wrong. Images are stretched into their cell;
 * UVs are normalised, so the stretch undoes itself on the way back out.
 *
 * Each cell keeps a one-texel gutter filled with the image's own edge, so
 * linear filtering at a cell boundary samples the same texture and not its
 * neighbour's.
 */
export function buildAtlas(images: CanvasImageSource[], maxSize = 2048): {
  atlas: HTMLCanvasElement | null
  rects: Float32Array
} {
  const rects = new Float32Array(MAX_SLOTS * 4)
  const count = Math.min(images.length, MAX_SLOTS)
  if (count === 0 || typeof document === "undefined") return { atlas: null, rects }

  // One map gets the whole canvas; more share it, and a big set steps up to 4K
  // so each cell does not fall below a usable size.
  const size = count > 4 ? Math.min(4096, maxSize * 2) : maxSize
  const grid = Math.ceil(Math.sqrt(count))
  const cell = Math.floor(size / grid)
  const gutter = 2

  const atlas = document.createElement("canvas")
  atlas.width = size
  atlas.height = size
  const ctx = atlas.getContext("2d")
  if (!ctx) return { atlas: null, rects }

  for (let i = 0; i < count; i++) {
    const col = i % grid
    const row = Math.floor(i / grid)
    const x = col * cell
    const y = row * cell
    const inner = cell - gutter * 2
    try {
      // Edge bleed first, then the image over it.
      ctx.drawImage(images[i], x, y, cell, cell)
      ctx.drawImage(images[i], x + gutter, y + gutter, inner, inner)
    } catch {
      // A tainted or undecodable image: leave the cell blank and the slot
      // falls back to the base colour, rather than losing the whole object.
    }
    rects[i * 4] = (x + gutter) / size
    rects[i * 4 + 1] = (y + gutter) / size
    rects[i * 4 + 2] = inner / size
    rects[i * 4 + 3] = inner / size
  }

  return { atlas, rects }
}

/** A flat colour for a source that has no surface of its own. */
export function solidAppearance(vertexCount: number, rgb: [number, number, number]): Appearance {
  const extras = new Float32Array(vertexCount * APPEARANCE_STRIDE)
  for (let v = 0; v < vertexCount; v++) {
    const o = v * APPEARANCE_STRIDE
    extras[o + 2] = rgb[0]
    extras[o + 3] = rgb[1]
    extras[o + 4] = rgb[2]
    extras[o + 5] = -1
  }
  return { extras, atlas: null, rects: new Float32Array(MAX_SLOTS * 4) }
}
