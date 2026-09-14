"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { resolvePreset, type ObjectSource } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { PresetSelect, WordInput } from "@/components/look-picker"
import { bakeLiquid } from "@/lib/bake"

/**
 * The liquid, on your desk.
 *
 * The look is baked into a looping GLB — rippling surface as morph targets, a
 * real metal, glass or iridescent material from the colourway's numbers — and
 * shown in Google's <model-viewer>, which opens it in AR: WebXR on Android,
 * Quick Look on iPhone. Everything is made on this device.
 */

const VIEWER = "https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer.min.js"

const SHAPES: Array<[string, ObjectSource | null]> = [
  ["Your word", null],
  ["Drop", { type: "shape", shape: "sphere" }],
  ["Knot", { type: "shape", shape: "torusknot" }],
  ["Ring", { type: "shape", shape: "torus" }],
]

export default function DeskPage() {
  return (
    <BetaShell slug="desk" wide>
      <DeskDemo />
    </BetaShell>
  )
}

function DeskDemo() {
  const [word, setWord] = useState("HI")
  const [shape, setShape] = useState(2)
  const [preset, setPreset] = useState("aurora-2")
  const [files, setFiles] = useState<{ glb: string; usdz: string; kb: number } | null>(null)
  const [baking, setBaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewerReady, setViewerReady] = useState(false)
  const made = useRef<string[]>([])

  useEffect(() => {
    if (customElements.get("model-viewer")) return setViewerReady(true)
    const script = document.createElement("script")
    script.type = "module"
    script.src = VIEWER
    script.onload = () => setViewerReady(true)
    script.onerror = () => setError("The 3D viewer couldn't be loaded.")
    document.head.appendChild(script)
  }, [])

  useEffect(() => () => made.current.forEach((url) => URL.revokeObjectURL(url)), [])

  const object = useMemo<ObjectSource>(() => SHAPES[shape][1] ?? { type: "text", value: word.trim() || "HI", depth: 0.5, bevel: 0.04 }, [shape, word])

  const bake = async () => {
    setBaking(true)
    setError(null)
    try {
      const { glb, usdz } = await bakeLiquid(object, resolvePreset(preset))
      const next = { glb: URL.createObjectURL(glb), usdz: URL.createObjectURL(usdz), kb: Math.round(glb.size / 1024) }
      made.current.push(next.glb, next.usdz)
      setFiles(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That object couldn't be baked.")
    } finally {
      setBaking(false)
    }
  }

  // A first bake on arrival, so the page opens with something on it.
  useEffect(() => {
    void bake()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = (url: string, name: string) => {
    const link = document.createElement("a")
    link.href = url
    link.download = name
    link.click()
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="relative h-[min(70vh,38rem)] overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-[radial-gradient(circle_at_50%_40%,#2a2d36,#0a0a0d)]">
        {files && viewerReady ? (
          <model-viewer
            key={files.glb}
            src={files.glb}
            ios-src={files.usdz}
            alt="The baked liquid object"
            ar
            ar-modes="webxr quick-look"
            ar-scale="auto"
            autoplay
            auto-rotate
            camera-controls
            shadow-intensity="1"
            exposure="1.1"
            style={{ width: "100%", height: "100%", background: "transparent" }}
          >
            <button
              slot="ar-button"
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-[var(--radius-pill)] bg-bone px-5 py-2.5 font-mono text-[12px] text-ink"
            >
              Put it on my desk
            </button>
          </model-viewer>
        ) : (
          <p className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-bone/45">{baking ? "Baking the loop…" : "Loading the viewer…"}</p>
        )}
      </div>

      <div className="space-y-4 rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4">
        <div>
          <p className="mb-1.5 font-mono text-[11px] text-bone/55">Object</p>
          <div className="flex flex-wrap gap-1.5">
            {SHAPES.map(([label], index) => (
              <button
                key={label}
                type="button"
                onClick={() => setShape(index)}
                className={`rounded-[var(--radius-pill)] border px-2.5 py-1 font-mono text-[10px] ${shape === index ? "border-bone bg-bone text-ink" : "border-rule text-bone/60 hover:text-bone"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {SHAPES[shape][1] === null && <WordInput value={word} onChange={setWord} max={8} />}
        <PresetSelect value={preset} onChange={setPreset} />
        <button
          type="button"
          disabled={baking}
          onClick={() => void bake()}
          className="w-full rounded-[var(--radius-pill)] bg-bone px-4 py-2.5 font-mono text-[12px] text-ink transition-colors hover:bg-bone-dim disabled:opacity-40"
        >
          {baking ? "Baking…" : "Bake it"}
        </button>
        {files && (
          <div className="space-y-2 border-t border-rule pt-3">
            <p className="font-mono text-[10px] text-bone/45">{files.kb} KB · a three-second loop</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => save(files.glb, "liquidforge.glb")} className="flex-1 rounded-[var(--radius-pill)] border border-rule px-3 py-2 font-mono text-[11px] text-bone/75 hover:text-bone">
                Download GLB
              </button>
              <button type="button" onClick={() => save(files.usdz, "liquidforge.usdz")} className="flex-1 rounded-[var(--radius-pill)] border border-rule px-3 py-2 font-mono text-[11px] text-bone/75 hover:text-bone">
                Download USDZ
              </button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="font-mono text-[11px] text-[#ff8a7a]">{error}</p>}
        <p className="font-mono text-[10px] leading-relaxed text-bone/30">
          On a phone, tap “Put it on my desk” and point at a table. Android plays the ripple; iPhone&apos;s Quick Look shows it still, in a simpler material.
        </p>
      </div>
    </div>
  )
}
