import type { Point } from "./contour"

export interface RasterMask {
  mask: Uint8Array
  width: number
  height: number
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

/**
 * Rasterise text into an occupancy mask.
 *
 * Waits on `document.fonts.ready` first: with a webfont still loading, the very
 * first `measureText` reports fallback metrics and the mesh comes out in the
 * wrong typeface at the wrong size.
 */
export async function rasterizeText(
  value: string,
  font: string,
  resolution: number,
): Promise<RasterMask & { lineCount: number }> {
  if (typeof document === "undefined") {
    throw new Error("liquidforge: text forging requires a browser environment")
  }
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      // Font loading is best-effort; fall through to whatever is available.
    }
  }

  const lines = value.split("\n").filter((line) => line.length > 0)
  if (lines.length === 0) throw new Error("liquidforge: text source is empty")

  const measureCanvas = createCanvas(8, 8)
  const measureCtx = measureCanvas.getContext("2d")
  if (!measureCtx) throw new Error("liquidforge: 2D canvas unavailable")
  measureCtx.font = font

  const probe = measureCtx.measureText("Mg")
  const ascent = probe.actualBoundingBoxAscent || 0
  const descent = probe.actualBoundingBoxDescent || 0
  const emHeight = ascent + descent || Number.parseFloat(font) || 200
  const lineHeight = emHeight * 1.18

  let textWidth = 0
  for (const line of lines) {
    textWidth = Math.max(textWidth, measureCtx.measureText(line).width)
  }
  const textHeight = lineHeight * lines.length

  // Pad by a couple of cells so contours never touch the border, which would
  // leave open loops that cannot be extruded.
  const pad = Math.max(8, emHeight * 0.12)
  const rawWidth = textWidth + pad * 2
  const rawHeight = textHeight + pad * 2

  const scale = resolution / Math.max(rawWidth, rawHeight)
  const canvas = createCanvas(rawWidth * scale, rawHeight * scale)
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("liquidforge: 2D canvas unavailable")

  ctx.scale(scale, scale)
  ctx.font = font
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#fff"

  lines.forEach((line, i) => {
    const y = pad + lineHeight * (i + 0.5)
    ctx.fillText(line, rawWidth / 2, y)
  })

  return { ...maskFromCanvas(ctx, canvas.width, canvas.height, 0.5), lineCount: lines.length }
}

/**
 * Decoded-image cache.
 *
 * The image is needed twice — once at grid resolution for displacement and
 * once at texture resolution for tones — and decoding a large photo twice is
 * both slow and, for a blob URL, a second full read. Bounded so a Studio
 * session that tries many images does not pin them all in memory.
 */
const imageCache = new Map<string, Promise<HTMLImageElement>>()
const IMAGE_CACHE_LIMIT = 6

/** Load an image, honouring CORS so canvas readback is not tainted. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src)
  if (cached) return cached

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    // Data/blob URLs must not carry a crossOrigin attribute in some browsers.
    if (!/^(data:|blob:)/.test(src)) image.crossOrigin = "anonymous"
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(
        new Error(
          `liquidforge: could not load image "${src.slice(0, 80)}". Cross-origin images need CORS headers.`,
        ),
      )
    image.src = src
  })

  promise.catch(() => imageCache.delete(src))
  imageCache.set(src, promise)
  if (imageCache.size > IMAGE_CACHE_LIMIT) {
    const oldest = imageCache.keys().next().value as string
    imageCache.delete(oldest)
  }
  return promise
}

export interface ImageRaster {
  /** Row-major luminance in [0,1]. */
  luminance: Float32Array
  /** Row-major alpha in [0,1]. */
  alpha: Float32Array
  width: number
  height: number
  /** Source aspect ratio (width / height). */
  aspect: number
}

/** Draw an image into a canvas at `resolution` on its long edge and read it back. */
export async function rasterizeImage(src: string, resolution: number): Promise<ImageRaster> {
  const image = await loadImage(src)
  const aspect = image.naturalWidth / image.naturalHeight || 1
  const width = aspect >= 1 ? resolution : Math.max(2, Math.round(resolution * aspect))
  const height = aspect >= 1 ? Math.max(2, Math.round(resolution / aspect)) : resolution

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("liquidforge: 2D canvas unavailable")
  ctx.drawImage(image, 0, 0, width, height)

  const data = ctx.getImageData(0, 0, width, height).data
  const luminance = new Float32Array(width * height)
  const alpha = new Float32Array(width * height)

  for (let i = 0, p = 0; i < luminance.length; i++, p += 4) {
    luminance[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255
    alpha[i] = data[p + 3] / 255
  }

  return { luminance, alpha, width, height, aspect }
}

function maskFromCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  threshold: number,
): RasterMask {
  const data = ctx.getImageData(0, 0, width, height).data
  const mask = new Uint8Array(width * height)
  const cutoff = threshold * 255
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    mask[i] = data[p + 3] >= cutoff ? 1 : 0
  }
  return { mask, width, height }
}

/** Threshold a raster into an occupancy mask. */
export function thresholdRaster(
  raster: ImageRaster,
  threshold: number,
  channel: "alpha" | "luminance" | "auto" = "auto",
): RasterMask {
  const { luminance, alpha, width, height } = raster
  // A logo exported as a transparent PNG should be cut on alpha; a photo or an
  // opaque JPEG has no alpha to speak of, so fall back to luminance.
  let useAlpha = channel === "alpha"
  if (channel === "auto") {
    let transparentPixels = 0
    for (let i = 0; i < alpha.length; i += 7) if (alpha[i] < 0.9) transparentPixels++
    useAlpha = transparentPixels > alpha.length / 7 / 20
  }

  const mask = new Uint8Array(width * height)
  const source = useAlpha ? alpha : luminance
  for (let i = 0; i < mask.length; i++) mask[i] = source[i] >= threshold ? 1 : 0
  return { mask, width, height }
}

/** Centre-and-fit transform for a traced silhouette, targeting a 2-unit box. */
export function fitTransform(
  bounds: { minX: number; minY: number; width: number; height: number },
  targetSize = 2,
): { scale: number; offset: Point } {
  const longest = Math.max(bounds.width, bounds.height) || 1
  const scale = targetSize / longest
  return {
    scale,
    offset: {
      x: -(bounds.minX + bounds.width / 2) * scale,
      y: (bounds.minY + bounds.height / 2) * scale,
    },
  }
}
