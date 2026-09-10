/**
 * Pull a palette out of a picture.
 *
 * A frequency histogram rather than k-means: quantise to a coarse grid, count,
 * then walk the buckets by popularity keeping only colours far enough apart to
 * be distinguishable. It is a few lines instead of an iterative solver, it is
 * deterministic — the same logo always gives the same palette, which matters
 * when someone re-uploads and expects what they had — and for logos, which are
 * flat colour rather than photographs, it is at least as good.
 *
 * Near-white and near-black are dropped: almost every logo sits on one and is
 * outlined in the other, and neither says anything about the brand.
 */
export interface PaletteOptions {
  /** How many colours to return. @default 4 */
  count?: number
  /** Minimum separation in OKLab, so the result is not five of one blue. @default 0.16 */
  spread?: number
  /** Longest edge to sample at. Larger is slower and no more accurate. @default 160 */
  resolution?: number
}

export async function extractPalette(src: string, options: PaletteOptions = {}): Promise<string[]> {
  const { count = 4, spread = 0.16, resolution = 160 } = options
  if (typeof document === "undefined") throw new Error("liquidforge: extractPalette needs a browser")

  const image = await loadImage(src)
  const scale = Math.min(1, resolution / Math.max(image.naturalWidth, image.naturalHeight, 1))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("liquidforge: 2D canvas unavailable")
  context.drawImage(image, 0, 0, width, height)

  const { data } = context.getImageData(0, 0, width, height)
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 200) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    // Skip the page behind the logo and the outline around it.
    if (max > 244 && min > 244) continue
    if (max < 18) continue

    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.n++
    } else {
      buckets.set(key, { r, g, b, n: 1 })
    }
  }

  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((bucket) => [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n] as const)

  const chosen: Array<readonly [number, number, number]> = []
  for (const colour of ranked) {
    if (chosen.length >= count) break
    const lab = oklab(colour)
    if (chosen.every((taken) => distance(oklab(taken), lab) >= spread)) chosen.push(colour)
  }

  // A very flat image can run out of distinguishable colours; pad rather than
  // hand back a palette the shader will not accept.
  while (chosen.length < 2 && ranked.length > 0) chosen.push(ranked[chosen.length] ?? ranked[0])

  return chosen.map(([r, g, b]) => hex(r, g, b))
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    if (!/^(data:|blob:)/.test(src)) image.crossOrigin = "anonymous"
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(new Error("liquidforge: could not read that image. Cross-origin files need CORS."))
    image.src = src
  })
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`

function oklab([r, g, b]: readonly [number, number, number]): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const R = lin(r)
  const G = lin(g)
  const B = lin(b)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const distance = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot((a[0] - b[0]) * 0.6, a[1] - b[1], a[2] - b[2])
