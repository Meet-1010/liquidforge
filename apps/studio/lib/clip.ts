import type { LiquidEngine } from "liquidforge"

/**
 * Clips made to be posted: the right shape, with sound, and better than the
 * screen can draw live.
 *
 * Every post-worthy experiment in the beta ends in one of these. The engine
 * renders each frame at an exact time; this composes the frames — downscaled
 * from a larger render for supersampling, averaged over sub-frames for motion
 * blur, stamped with the mark if asked — and encodes them to H.264 with an AAC
 * soundtrack in an MP4 that Reels, TikTok and Shorts take as-is.
 */

export interface ClipFormat {
  id: string
  label: string
  width: number
  height: number
  /** Where each app's own interface covers the video, as fractions: [top, right, bottom, left]. */
  safe: [number, number, number, number]
}

export const CLIP_FORMATS: ClipFormat[] = [
  { id: "story", label: "9:16 · Reels, TikTok, Shorts", width: 1080, height: 1920, safe: [0.12, 0.16, 0.24, 0.05] },
  { id: "portrait", label: "4:5 · Instagram feed", width: 1080, height: 1350, safe: [0.05, 0.05, 0.08, 0.05] },
  { id: "square", label: "1:1 · Feed, LinkedIn", width: 1080, height: 1080, safe: [0.05, 0.05, 0.05, 0.05] },
  { id: "landscape", label: "16:9 · YouTube, X", width: 1920, height: 1080, safe: [0.04, 0.04, 0.1, 0.04] },
]

export interface ClipOptions {
  seconds: number
  fps?: 30 | 60
  format: ClipFormat
  /** Optional soundtrack, trimmed to the clip from `audioOffset` seconds in. */
  audio?: AudioBuffer | null
  audioOffset?: number
  /** Render at this multiple of the output size and scale down. @default 1 */
  supersample?: 1 | 2
  /** Sub-frames averaged per frame. 1 is no blur. @default 1 */
  motionBlur?: 1 | 3 | 5
  /** Stamp the Liquidforge mark in the corner. */
  mark?: boolean
  /** Drive the look before every step: a timeline, a beat, a morph. */
  beforeStep?: (frame: number, subframe: number, seconds: number) => void
  scriptedPointer?: boolean
  preroll?: boolean
  onProgress?: (fraction: number) => void
}

let markImage: HTMLImageElement | null = null
async function loadMark(): Promise<HTMLImageElement> {
  if (markImage) return markImage
  const image = new Image()
  image.src = "/icon.svg"
  await image.decode()
  markImage = image
  return image
}

function drawMark(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number, safe: ClipFormat["safe"]) {
  const size = Math.round(Math.min(width, height) * 0.055)
  const pad = Math.round(Math.min(width, height) * 0.035)
  // Inside the safe area, so an app's buttons never sit on top of it.
  const x = Math.round(width * (1 - safe[1])) - pad - size * 4.2
  const y = Math.round(height * (1 - safe[2])) - pad - size
  context.save()
  context.globalAlpha = 0.82
  context.drawImage(image, x, y, size, size)
  context.font = `500 ${Math.round(size * 0.46)}px ui-monospace, SFMono-Regular, Menlo, monospace`
  context.fillStyle = "#eceaf0"
  context.textBaseline = "middle"
  context.fillText("liquidforge", x + size * 1.22, y + size / 2)
  context.restore()
}

/** Decode an audio file the user chose. */
export async function decodeAudio(file: Blob): Promise<AudioBuffer> {
  const context = new AudioContext()
  try {
    return await context.decodeAudioData(await file.arrayBuffer())
  } finally {
    void context.close()
  }
}

function trimAudio(buffer: AudioBuffer, offset: number, seconds: number): AudioBuffer {
  const start = Math.max(0, Math.floor(offset * buffer.sampleRate))
  const length = Math.max(1, Math.min(buffer.length - start, Math.floor(seconds * buffer.sampleRate)))
  const out = new AudioBuffer({ length, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate })
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel).subarray(start, start + length)
    // A short fade at both ends, so the loop does not click where it is cut.
    const copy = new Float32Array(data)
    const fade = Math.min(length / 2, Math.floor(buffer.sampleRate * 0.03))
    for (let i = 0; i < fade; i++) {
      copy[i] *= i / fade
      copy[length - 1 - i] *= i / fade
    }
    out.copyToChannel(copy, channel)
  }
  return out
}

export async function recordClip(engine: LiquidEngine, options: ClipOptions): Promise<Blob> {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("This browser can't encode video. Chrome, Edge and Safari 17+ can.")
  }
  const { seconds, fps = 30, format, supersample = 1, motionBlur = 1, mark = false } = options
  const { width, height } = format
  const bitrate = Math.round(width * height * fps * 0.14)

  const { AudioBufferSource, BufferTarget, Mp4OutputFormat, Output, VideoSample, VideoSampleSource, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec } =
    await import("mediabunny")

  const videoCodec = await getFirstEncodableVideoCodec(["avc", "hevc"], { width, height, bitrate })
  if (!videoCodec) throw new Error(`This browser can't encode ${width}×${height} video.`)

  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target })
  const video = new VideoSampleSource({ codec: videoCodec, bitrate, keyFrameInterval: 1 })
  output.addVideoTrack(video, { frameRate: fps })

  let audioSource: InstanceType<typeof AudioBufferSource> | null = null
  if (options.audio) {
    const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], {
      numberOfChannels: options.audio.numberOfChannels,
      sampleRate: options.audio.sampleRate,
    })
    if (audioCodec) {
      audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: 192_000 })
      output.addAudioTrack(audioSource)
    }
  }
  await output.start()

  const composite = document.createElement("canvas")
  composite.width = width
  composite.height = height
  const context = composite.getContext("2d", { alpha: false })!
  context.imageSmoothingQuality = "high"
  const logo = mark ? await loadMark() : null

  const total = Math.round(seconds * fps)
  const frameSeconds = 1 / fps
  try {
    await engine.renderFrames(
      {
        seconds,
        fps,
        width: width * supersample,
        height: height * supersample,
        subframes: motionBlur,
        beforeStep: options.beforeStep,
        scriptedPointer: options.scriptedPointer,
        preroll: options.preroll,
      },
      (canvas, index, _us, subframe) => {
        // A running average: the k-th sub-frame drawn at 1/(k+1) opacity leaves
        // every sub-frame weighted equally once the frame is complete.
        context.globalAlpha = 1 / (subframe + 1)
        context.drawImage(canvas, 0, 0, width, height)
        if (subframe < motionBlur - 1) return
        context.globalAlpha = 1
        if (logo) drawMark(context, logo, width, height, format.safe)
        const sample = new VideoSample(composite, { timestamp: index * frameSeconds, duration: frameSeconds })
        return video.add(sample).finally(() => {
          sample.close()
          options.onProgress?.((index + 1) / total)
        })
      },
    )
    if (audioSource && options.audio) {
      await audioSource.add(trimAudio(options.audio, options.audioOffset ?? 0, seconds))
    }
    await output.finalize()
  } catch (error) {
    await output.cancel().catch(() => {})
    throw error
  }
  if (!target.buffer) throw new Error("The encoder finished without writing a file.")
  return new Blob([target.buffer], { type: "video/mp4" })
}
