"use client"

import { useEffect, useRef, useState } from "react"
import { LiquidCanvas, type LiquidEngine } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { PresetSelect, WordInput } from "@/components/look-picker"

/**
 * The hand as the cursor.
 *
 * MediaPipe's hand landmarker runs in the browser — its code from jsDelivr,
 * its model from Google's public model storage, the camera frames never
 * leaving the device. Twenty-one points per hand come back each frame. An open
 * hand pushes the surface at its palm; a pinch pulls a strand out of it where
 * the thumb and finger meet. Both go through the pointer the engine already
 * smooths, so the liquid moves the same way it does under a mouse.
 */

const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1"
const MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

type Point = { x: number; y: number; z: number }
interface Landmarker {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => { landmarks: Point[][] }
  close: () => void
}

const BONES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
]

/**
 * One tracker for the page's whole life. Creating two at once — which React's
 * development double-mount does — stalls MediaPipe's loader, and there is no
 * reason to pay for the model twice anyway.
 */
let tracker: Promise<Landmarker> | null = null
function loadTracker(): Promise<Landmarker> {
  tracker ??= (async () => {
    const vision = await import(/* webpackIgnore: true */ `${VISION}/vision_bundle.mjs`)
    const files = await vision.FilesetResolver.forVisionTasks(`${VISION}/wasm`)
    const options = { baseOptions: { modelAssetPath: MODEL, delegate: "GPU" as const }, runningMode: "VIDEO", numHands: 1 }
    // Some GPUs refuse the delegate; the CPU is slower but works everywhere.
    return vision.HandLandmarker.createFromOptions(files, options).catch(() =>
      vision.HandLandmarker.createFromOptions(files, { ...options, baseOptions: { ...options.baseOptions, delegate: "CPU" } }),
    ) as Promise<Landmarker>
  })().catch((cause) => {
    tracker = null
    throw cause
  })
  return tracker
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export default function HandsPage() {
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [word, setWord] = useState("TOUCH")
  const [preset, setPreset] = useState("mercury-3")
  const [started, setStarted] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [showCamera, setShowCamera] = useState(true)
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!started || !engine) return
    let cancelled = false
    let frame = 0
    let landmarker: Landmarker | null = null
    let stream: MediaStream | null = null

    const run = async () => {
      try {
        setStatus("Asking for the camera…")
        const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
        if (cancelled) return acquired.getTracks().forEach((track) => track.stop())
        stream = acquired
        video.current!.srcObject = stream
        await video.current!.play().catch(() => {})

        setStatus("Loading hand tracking (about 20 MB, once)…")
        const loaded = await loadTracker()
        if (cancelled) return
        landmarker = loaded
        setStatus("Show your hand to the camera")
      } catch (cause) {
        const name = cause instanceof DOMException ? cause.name : ""
        setError(
          name === "NotAllowedError"
            ? "Camera access was declined. Allow it for this site in the browser's settings to try again."
            : name === "NotFoundError"
              ? "No camera was found."
              : "Hand tracking couldn't start in this browser.",
        )
        setStarted(false)
        return
      }

      let lastVideoTime = -1
      let lastSeen = 0
      const tick = () => {
        frame = requestAnimationFrame(tick)
        const element = video.current
        if (!landmarker || !element || element.readyState < 2 || element.currentTime === lastVideoTime) return
        lastVideoTime = element.currentTime
        const now = performance.now()
        const hand = landmarker.detectForVideo(element, now).landmarks[0]

        const context = overlay.current?.getContext("2d")
        const canvas = overlay.current
        if (canvas && context) {
          canvas.width = canvas.clientWidth
          canvas.height = canvas.clientHeight
          context.clearRect(0, 0, canvas.width, canvas.height)
        }

        if (!hand) {
          if (lastSeen && now - lastSeen > 400) {
            engine.setPointerOverride(null)
            engine.setPressOverride(null)
            lastSeen = 0
            setStatus("Show your hand to the camera")
          }
          return
        }
        lastSeen = now

        // Mirrored, like a mirror, and stretched a little so the edges of the
        // object are reachable without leaving the camera's view.
        const toScreen = (point: Point) => ({ x: Math.max(-1, Math.min(1, ((1 - point.x) * 2 - 1) * 1.25)), y: Math.max(-1, Math.min(1, -(point.y * 2 - 1) * 1.25)) })
        const size = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y) || 0.1
        const pinch = smoothstep(0.5, 0.18, Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y) / size)

        let target: { x: number; y: number }
        if (pinch > 0.35) {
          target = toScreen({ x: (hand[4].x + hand[8].x) / 2, y: (hand[4].y + hand[8].y) / 2, z: 0 })
          engine.setPressOverride(-1.6 * pinch)
          setStatus("Pinching — pull it out")
        } else {
          const palm = [0, 5, 9, 13, 17].reduce((sum, i) => ({ x: sum.x + hand[i].x / 5, y: sum.y + hand[i].y / 5, z: 0 }), { x: 0, y: 0, z: 0 })
          target = toScreen(palm)
          engine.setPressOverride(0.95)
          setStatus("Open hand — push")
        }
        engine.setPointerOverride(target)

        if (canvas && context) {
          const px = (point: Point) => [((toScreen(point).x + 1) / 2) * canvas.width, ((1 - toScreen(point).y) / 2) * canvas.height] as const
          context.strokeStyle = "rgba(236, 234, 240, 0.35)"
          context.lineWidth = 1.5
          for (const [a, b] of BONES) {
            context.beginPath()
            context.moveTo(...px(hand[a]))
            context.lineTo(...px(hand[b]))
            context.stroke()
          }
          context.fillStyle = pinch > 0.35 ? "#ff5a4f" : "rgba(236, 234, 240, 0.8)"
          const [tx, ty] = [((target.x + 1) / 2) * canvas.width, ((1 - target.y) / 2) * canvas.height]
          context.beginPath()
          context.arc(tx, ty, 5, 0, Math.PI * 2)
          context.fill()
        }
      }
      frame = requestAnimationFrame(tick)
    }
    void run()

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
      engine.setPointerOverride(null)
      engine.setPressOverride(null)
      setStatus("")
    }
  }, [started, engine])

  return (
    <BetaShell slug="hands" wide>
      <div className="relative h-[min(70vh,40rem)] overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink">
        <LiquidCanvas
          object={{ type: "text", value: word.trim() || "TOUCH", depth: 0.55, bevel: 0.03 }}
          preset={preset}
          onEngine={setEngine}
          style={{ position: "absolute", inset: 0, minHeight: 0 }}
        />
        <canvas ref={overlay} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
        <video
          ref={video}
          muted
          playsInline
          aria-label="Your camera"
          className={`absolute bottom-3 right-3 w-36 -scale-x-100 rounded-[var(--radius-sm)] border border-rule object-cover transition-opacity sm:w-44 ${started && showCamera ? "opacity-80" : "opacity-0"}`}
        />
        {started ? (
          <p className="pointer-events-none absolute inset-x-0 top-4 text-center font-mono text-[11px] text-bone/55" aria-live="polite">
            {status}
          </p>
        ) : (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-6">
            <button
              type="button"
              onClick={() => {
                setError(null)
                setStarted(true)
              }}
              className="rounded-[var(--radius-pill)] bg-bone px-5 py-2.5 font-mono text-[12px] text-ink transition-colors hover:bg-bone-dim"
            >
              Use my camera
            </button>
            <p className="max-w-sm text-center font-mono text-[10px] leading-relaxed text-bone/40">
              Hand tracking runs in this browser. The video is never uploaded or saved.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <WordInput value={word} onChange={setWord} />
        <PresetSelect value={preset} onChange={setPreset} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-mono text-[11px] text-bone/60">
            <input type="checkbox" checked={showCamera} onChange={(event) => setShowCamera(event.target.checked)} />
            Show the camera
          </label>
          {started && (
            <button type="button" onClick={() => setStarted(false)} className="rounded-[var(--radius-pill)] border border-rule px-4 py-2 font-mono text-[11px] text-bone/70 hover:text-bone">
              Stop the camera
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-3 font-mono text-[11px] text-[#ff8a7a]">{error}</p>}
      <p className="mt-3 font-mono text-[10px] leading-relaxed text-bone/30">
        Open hand: push. Pinch thumb and finger: pull a strand out. To post it, screen-record — the camera preview can be hidden first.
      </p>
    </BetaShell>
  )
}
