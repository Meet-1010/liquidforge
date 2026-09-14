import type { LiquidEngine } from "liquidforge"

/**
 * A short looping GIF of a look, made on this device.
 *
 * The engine renders the loop frame by frame — the same closed figure-of-eight
 * a video export uses, so the last frame leads back into the first — and every
 * frame is mapped onto one palette built from all of them. One palette rather
 * than one per frame is both smaller and steadier: per-frame palettes make a
 * smooth gradient shimmer as its colours are chosen differently each frame.
 */
export async function recordGif(
  engine: LiquidEngine,
  options: { width: number; height: number; seconds: number; fps: number; colours?: number; onProgress?: (fraction: number) => void },
): Promise<Uint8Array> {
  const { GIFEncoder, applyPalette, quantize } = await import("gifenc")
  const { width, height, seconds, fps, colours = 192 } = options
  const scratch = document.createElement("canvas")
  scratch.width = width
  scratch.height = height
  const context = scratch.getContext("2d", { willReadFrequently: true })!
  const frames: Uint8ClampedArray[] = []
  const total = Math.round(seconds * fps)

  await engine.renderFrames({ seconds, fps, width: width * 2, height: height * 2 }, (canvas, index) => {
    // Rendered at twice the size and scaled down, so the edges are smooth
    // before the palette has to decide what colour an edge pixel is.
    context.drawImage(canvas, 0, 0, width, height)
    frames.push(context.getImageData(0, 0, width, height).data)
    options.onProgress?.(((index + 1) / total) * 0.8)
  })

  // The palette, from every fourth pixel of every frame.
  const sample = new Uint8ClampedArray(Math.ceil((width * height) / 4) * 4 * frames.length)
  let at = 0
  for (const frame of frames) {
    for (let i = 0; i < frame.length; i += 16) {
      sample[at++] = frame[i]
      sample[at++] = frame[i + 1]
      sample[at++] = frame[i + 2]
      sample[at++] = 255
    }
  }
  const palette = quantize(sample.subarray(0, at), colours)

  const gif = GIFEncoder()
  frames.forEach((frame, index) => {
    gif.writeFrame(applyPalette(frame, palette), width, height, { palette: index === 0 ? palette : undefined, delay: Math.round(1000 / fps) })
    options.onProgress?.(0.8 + ((index + 1) / frames.length) * 0.2)
  })
  gif.finish()
  return gif.bytes()
}
