import type { LiquidEngine } from "liquidforge"

export interface Mp4RecordOptions {
  seconds?: number
  fps?: number
  width: number
  height: number
  /** Called after each frame is handed to the encoder, with 0–1. */
  onProgress?: (fraction: number) => void
}

/**
 * Record a seamless loop as an H.264 MP4.
 *
 * `MediaRecorder` writes WebM in Chrome and Firefox, and a WebM is the file that
 * will not open in Premiere, will not upload to half the places people post, and
 * will not preview in Finder. So instead of capturing the screen in real time,
 * the engine renders each frame at an exact time and WebCodecs encodes it —
 * which also means a 4K take on a slow laptop is simply slower to make, rather
 * than full of dropped frames.
 *
 * Where WebCodecs is missing, it falls back to `MediaRecorder` asking for MP4,
 * which Safari provides. Only if neither can produce MP4 does it say so, rather
 * than quietly handing over a WebM with the wrong extension.
 */
export async function recordMp4(engine: LiquidEngine, options: Mp4RecordOptions): Promise<Blob> {
  const { seconds = 4, fps = 30, width, height, onProgress } = options
  // Same density as the real-time recorder: about 0.12 bits per pixel per frame.
  const bitrate = Math.round(width * height * fps * 0.12)

  if (typeof VideoEncoder === "undefined") {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/mp4")) {
      return engine.recordLoop({ seconds, fps, width, height, bitrate, mimeType: "video/mp4" })
    }
    throw new Error("This browser can't encode MP4. Chrome, Edge and Safari can.")
  }

  // Loaded on click: the muxer is only worth its bytes to people who record.
  const { BufferTarget, Mp4OutputFormat, Output, VideoSample, VideoSampleSource, getFirstEncodableVideoCodec } =
    await import("mediabunny")

  const codec = await getFirstEncodableVideoCodec(["avc", "hevc"], { width, height, bitrate })
  if (!codec) {
    throw new Error(`This browser can't encode ${width}×${height} video. Try a lower resolution.`)
  }

  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target })
  // A keyframe every second, so scrubbing the loop on a timeline is instant.
  const source = new VideoSampleSource({ codec, bitrate, keyFrameInterval: 1 })
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()

  const frameSeconds = 1 / fps
  try {
    const frames = await engine.renderFrames({ seconds, fps, width, height }, (canvas, index) => {
      // Captured before anything is awaited: the WebGL drawing buffer is only
      // guaranteed to hold this frame until the task yields.
      const sample = new VideoSample(canvas, { timestamp: index * frameSeconds, duration: frameSeconds })
      return source.add(sample).finally(() => {
        sample.close()
        onProgress?.((index + 1) / Math.round(seconds * fps))
      })
    })
    if (frames === 0) throw new Error("Nothing was rendered.")
    await output.finalize()
  } catch (error) {
    await output.cancel().catch(() => {})
    throw error
  }

  if (!target.buffer) throw new Error("The encoder finished without writing a file.")
  return new Blob([target.buffer], { type: "video/mp4" })
}
