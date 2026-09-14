"use client"

import { useState } from "react"
import { LiquidCanvas, type LiquidEngine } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { ClipFrame, ClipPanel, useClipSettings } from "@/components/clip-panel"
import { PresetSelect } from "@/components/look-picker"
import { CLIP_FORMATS } from "@/lib/clip"

const SHAPES = ["torusknot", "sphere", "capsule", "torus", "icosahedron", "rounded-box"] as const

export default function CinemaPage() {
  const [shape, setShape] = useState<(typeof SHAPES)[number]>("torusknot")
  const [preset, setPreset] = useState("mercury-3")
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [settings, setSettings] = useClipSettings({ format: CLIP_FORMATS[3], supersample: 2, motionBlur: 3, fps: 60, seconds: 5 })
  const [showSafe, setShowSafe] = useState(false)

  return (
    <BetaShell slug="cinema" wide>
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div>
          <ClipFrame format={settings.format} showSafe={showSafe}>
            <LiquidCanvas
              object={{ type: "shape", shape, detail: 220 }}
              preset={preset}
              quality="high"
              motion={{ autoRotate: 0.2 }}
              onEngine={setEngine}
              style={{ position: "absolute", inset: 0, minHeight: 0 }}
            />
          </ClipFrame>
          <p className="mt-3 font-mono text-[11px] leading-relaxed text-bone/40">
            The preview is live and drops detail to keep up. The render does not: it draws every frame at double the size
            and scales it down, averages several instants per frame for real motion blur, and takes as long as it needs.
          </p>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block font-mono text-[11px] text-bone/55">Shape</span>
              <select
                value={shape}
                onChange={(event) => setShape(event.target.value as (typeof SHAPES)[number])}
                className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none focus:border-bone"
              >
                {SHAPES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            <PresetSelect value={preset} onChange={setPreset} />
          </div>
          <ClipPanel engine={engine} settings={settings} onChange={setSettings} showSafe={showSafe} onShowSafe={setShowSafe} fileName={`liquidforge-cinema-${preset}`} />
        </div>
      </div>
    </BetaShell>
  )
}
