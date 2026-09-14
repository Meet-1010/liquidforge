"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { LiquidEngine } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { ClipFrame, ClipPanel, useClipSettings } from "@/components/clip-panel"
import { PresetSelect } from "@/components/look-picker"
import { MeltCanvas } from "@/components/melt-canvas"
import { reliefGeometry, reliefModelUrl } from "@/lib/relief"

/**
 * You, as liquid metal.
 *
 * A frame from the front camera goes through Depth Anything V2 Small, running
 * in this browser with transformers.js — WebGPU where there is one, WebAssembly
 * where there isn't — and the depth map becomes a solid relief the library
 * loads like any model. Take another and the first melts into it. The photo
 * and the depth map never leave the device.
 */

const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js"
const MODEL = "onnx-community/depth-anything-v2-small"

type Estimator = (image: unknown) => Promise<{ depth: { data: Uint8Array; width: number; height: number } }>

let estimator: Promise<{ run: Estimator; fromCanvas: (canvas: HTMLCanvasElement) => Promise<unknown>; device: string }> | null = null
function loadEstimator() {
  estimator ??= (async () => {
    const { pipeline, RawImage } = await import(/* webpackIgnore: true */ TRANSFORMERS)
    const fromCanvas = (canvas: HTMLCanvasElement) => RawImage.fromURL(canvas.toDataURL("image/jpeg", 0.92))
    if ("gpu" in navigator) {
      try {
        return { run: (await pipeline("depth-estimation", MODEL, { device: "webgpu", dtype: "fp16" })) as Estimator, fromCanvas, device: "WebGPU" }
      } catch {
        // No usable adapter after all; WebAssembly below.
      }
    }
    return { run: (await pipeline("depth-estimation", MODEL, { device: "wasm", dtype: "q8" })) as Estimator, fromCanvas, device: "WebAssembly" }
  })().catch((cause) => {
    estimator = null
    throw cause
  })
  return estimator
}

interface Capture {
  id: number
  photo: string
  model: string
}

export default function SelfiePage() {
  return (
    <BetaShell slug="selfie" wide>
      <SelfieDemo />
    </BetaShell>
  )
}

function SelfieDemo() {
  const [cameraOn, setCameraOn] = useState(false)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [active, setActive] = useState(0)
  const [preset, setPreset] = useState("mercury-1")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [settings, setSettings] = useClipSettings({ seconds: 8 })
  const [showSafe, setShowSafe] = useState(false)
  const [generation, setGeneration] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!cameraOn) return
    let cancelled = false
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then(async (media) => {
        if (cancelled) return media.getTracks().forEach((track) => track.stop())
        stream.current = media
        if (video.current) {
          video.current.srcObject = media
          await video.current.play().catch(() => {})
        }
      })
      .catch((cause) => {
        setError(cause instanceof DOMException && cause.name === "NotAllowedError" ? "Camera access was declined. Allow it for this site to try again." : "No camera could be opened.")
        setCameraOn(false)
      })
    // Start the model download while the person lines up the shot.
    void loadEstimator().catch(() => {})
    return () => {
      cancelled = true
      stream.current?.getTracks().forEach((track) => track.stop())
      stream.current = null
    }
  }, [cameraOn])

  // The models are blob URLs; let them go when the page does.
  const made = useRef<string[]>([])
  useEffect(() => () => made.current.forEach((url) => URL.revokeObjectURL(url)), [])
  // A new selfie is the one shown.
  useEffect(() => setActive(Math.max(0, captures.length - 1)), [captures.length])

  const capture = async () => {
    const element = video.current
    if (!element || element.readyState < 2) return
    setError(null)
    for (let n = 3; n > 0; n--) {
      setCountdown(n)
      await new Promise((resolve) => setTimeout(resolve, 700))
    }
    setCountdown(null)

    // A portrait crop from the middle of the frame, mirrored the way the preview shows it.
    const height = element.videoHeight
    const width = Math.round(height * 0.75)
    const canvas = document.createElement("canvas")
    canvas.width = 480
    canvas.height = 640
    const context = canvas.getContext("2d")!
    context.translate(canvas.width, 0)
    context.scale(-1, 1)
    context.drawImage(element, (element.videoWidth - width) / 2, 0, width, height, 0, 0, canvas.width, canvas.height)
    const photo = canvas.toDataURL("image/jpeg", 0.8)

    try {
      setStatus("Loading the depth model (about 27–50 MB, the first time only)…")
      const depth = await loadEstimator()
      setStatus(`Reading depth on ${depth.device}…`)
      const { depth: map } = await depth.run(await depth.fromCanvas(canvas))
      setStatus("Sculpting…")
      const model = await reliefModelUrl(reliefGeometry(map))
      made.current.push(model)
      setCaptures((list) => [...list, { id: Date.now(), photo, model }].slice(-4))
      setStatus(null)
    } catch (cause) {
      setStatus(null)
      setError(cause instanceof Error ? cause.message : "That selfie couldn't be turned into a relief.")
    }
  }

  const looks = useMemo(() => captures.map((entry) => ({ object: { type: "model" as const, src: entry.model }, preset })), [captures, preset])
  const look = looks[Math.min(active, looks.length - 1)]

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
      <div className="min-w-0 space-y-4">
        <ClipFrame format={settings.format} showSafe={showSafe}>
          {look ? (
            <MeltCanvas key={generation} looks={looks} look={look} duration={1.6} onEngine={setEngine} style={{ position: "absolute", inset: 0, minHeight: 0 }} />
          ) : null}
          <video
            ref={video}
            muted
            playsInline
            aria-label="Your camera"
            className={`absolute object-cover transition-all duration-500 ${
              look ? "bottom-2 right-2 h-24 w-[4.5rem] rounded-[var(--radius-sm)] border border-rule opacity-80" : "inset-0 h-full w-full"
            } -scale-x-100 ${cameraOn ? "" : "opacity-0"}`}
          />
          {!look && cameraOn && (
            <div aria-hidden className="pointer-events-none absolute inset-[18%_22%_28%] rounded-[50%] border-2 border-dashed border-bone/40" />
          )}
          {countdown !== null && <p className="display absolute inset-0 flex items-center justify-center text-[6rem] text-bone">{countdown}</p>}
          {status && <p className="absolute inset-x-0 top-3 px-4 text-center font-mono text-[11px] text-bone/80" aria-live="polite">{status}</p>}
          {!cameraOn && !look && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <button
                type="button"
                onClick={() => setCameraOn(true)}
                className="rounded-[var(--radius-pill)] bg-bone px-5 py-2.5 font-mono text-[12px] text-ink transition-colors hover:bg-bone-dim"
              >
                Open the camera
              </button>
              <p className="max-w-xs font-mono text-[10px] leading-relaxed text-bone/45">
                Depth is read in this browser. Your photo is never uploaded or saved anywhere.
              </p>
            </div>
          )}
        </ClipFrame>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!cameraOn || countdown !== null || status !== null}
            onClick={() => void capture()}
            className="rounded-[var(--radius-pill)] bg-bone px-5 py-2.5 font-mono text-[12px] text-ink transition-colors hover:bg-bone-dim disabled:opacity-40"
          >
            {captures.length ? "Take another — it melts into it" : "Take the selfie"}
          </button>
          {captures.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Selfie ${index + 1}`}
              className={`h-14 w-11 overflow-hidden rounded-[var(--radius-sm)] border-2 ${index === active ? "border-bone" : "border-transparent opacity-60 hover:opacity-100"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={entry.photo} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
          {captures.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setCaptures([])
                setActive(0)
                setGeneration((value) => value + 1)
              }}
              className="font-mono text-[10px] text-bone/40 hover:text-bone"
            >
              Start over
            </button>
          )}
        </div>
        {error && <p role="alert" className="font-mono text-[11px] text-[#ff8a7a]">{error}</p>}
      </div>

      <div className="space-y-4">
        <PresetSelect value={preset} onChange={setPreset} />
        <ClipPanel engine={look ? engine : null} settings={settings} onChange={setSettings} showSafe={showSafe} onShowSafe={setShowSafe} fileName="liquidforge-selfie" />
      </div>
    </div>
  )
}
