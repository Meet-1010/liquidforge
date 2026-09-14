"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { LiquidCanvas, type LiquidEngine, type ObjectSource } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { ClipFrame, ClipPanel, useClipSettings } from "@/components/clip-panel"
import { PresetSelect } from "@/components/look-picker"

/**
 * Draw with a finger; lift it, and the drawing is liquid.
 *
 * The drawing pad is a transparent canvas. When a stroke ends and nothing new
 * starts for a moment, the pad is handed to the image forge as it is — which
 * already traces a silhouette from alpha and extrudes it — so a signature, a
 * heart or a child's drawing becomes an object you can touch in about a second.
 */

const PAD = 720

export default function DoodlePage() {
  const pad = useRef<HTMLCanvasElement>(null)
  const strokes = useRef<Array<Array<[number, number]>>>([])
  const drawing = useRef(false)
  const [object, setObject] = useState<ObjectSource | null>(null)
  const [preset, setPreset] = useState("mercury-3")
  const [width, setWidth] = useState(34)
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [settings, setSettings] = useClipSettings({ seconds: 5 })
  const [showSafe, setShowSafe] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const redraw = useCallback(() => {
    const canvas = pad.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    context.clearRect(0, 0, PAD, PAD)
    context.lineCap = "round"
    context.lineJoin = "round"
    context.strokeStyle = "#ffffff"
    context.lineWidth = width
    for (const stroke of strokes.current) {
      context.beginPath()
      stroke.forEach(([x, y], i) => (i === 0 ? context.moveTo(x, y) : context.lineTo(x, y)))
      if (stroke.length === 1) context.lineTo(stroke[0][0] + 0.1, stroke[0][1])
      context.stroke()
    }
  }, [width])

  const forge = useCallback(() => {
    if (!pad.current || strokes.current.length === 0) return
    setObject({ type: "image", src: pad.current.toDataURL("image/png"), depth: 0.5, resolution: 384 })
  }, [])

  useEffect(() => {
    redraw()
    if (strokes.current.length) forge()
  }, [redraw, forge])

  const point = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect()
    return [((event.clientX - rect.left) / rect.width) * PAD, ((event.clientY - rect.top) / rect.height) * PAD]
  }

  return (
    <BetaShell slug="doodle" wide>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-[repeating-conic-gradient(#141418_0%_25%,#101013_0%_50%)] [background-size:24px_24px]">
            <canvas
              ref={pad}
              width={PAD}
              height={PAD}
              className="block aspect-square w-full touch-none"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                drawing.current = true
                strokes.current.push([point(event)])
                clearTimeout(timer.current)
                redraw()
              }}
              onPointerMove={(event) => {
                if (!drawing.current) return
                strokes.current[strokes.current.length - 1].push(point(event))
                redraw()
              }}
              onPointerUp={() => {
                drawing.current = false
                clearTimeout(timer.current)
                timer.current = setTimeout(forge, 450)
              }}
            />
            {strokes.current.length === 0 && (
              <p className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-[12px] text-bone/35">Draw anything here</p>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                strokes.current.pop()
                redraw()
                if (strokes.current.length) forge()
                else setObject(null)
              }}
              className="rounded-[var(--radius-pill)] border border-rule px-3 py-1.5 font-mono text-[11px] text-bone/70 hover:border-rule-bright hover:text-bone"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => {
                strokes.current = []
                redraw()
                setObject(null)
              }}
              className="rounded-[var(--radius-pill)] border border-rule px-3 py-1.5 font-mono text-[11px] text-bone/70 hover:border-rule-bright hover:text-bone"
            >
              Clear
            </button>
            <label className="ml-auto flex items-center gap-2 font-mono text-[11px] text-bone/55">
              Brush
              <input type="range" min={14} max={70} value={width} onChange={(event) => setWidth(Number(event.target.value))} className="w-28" />
            </label>
          </div>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-bone/35">
            Thick, connected strokes make the best objects: the outline is what becomes the shape.
          </p>
        </div>

        <div className="space-y-4">
          <ClipFrame format={settings.format} showSafe={showSafe} maxHeight={420}>
            {object ? (
              <LiquidCanvas object={object} preset={preset} motion={{ autoRotate: 0.2, tilt: [0.25, 0] }} onEngine={setEngine} style={{ position: "absolute", inset: 0, minHeight: 0 }} />
            ) : (
              <div className="absolute inset-0 grid place-items-center font-mono text-[12px] text-bone/30">Your drawing appears here</div>
            )}
          </ClipFrame>
          <PresetSelect value={preset} onChange={setPreset} />
          {object && (
            <ClipPanel engine={engine} settings={settings} onChange={setSettings} showSafe={showSafe} onShowSafe={setShowSafe} fileName="liquidforge-doodle" />
          )}
        </div>
      </div>
    </BetaShell>
  )
}
