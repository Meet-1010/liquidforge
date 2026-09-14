"use client"

import { useState } from "react"
import { LiquidCanvas, type LiquidEngine } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { ClipFrame, ClipPanel, useClipSettings } from "@/components/clip-panel"
import { PresetSelect, WordInput } from "@/components/look-picker"

export default function VerticalPage() {
  const [word, setWord] = useState("DROP")
  const [preset, setPreset] = useState("aurora-2")
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [settings, setSettings] = useClipSettings()
  const [showSafe, setShowSafe] = useState(true)

  return (
    <BetaShell slug="vertical" wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
        <ClipFrame format={settings.format} showSafe={showSafe}>
          <LiquidCanvas
            object={{ type: "text", value: word || "DROP", depth: 0.5, bevel: 0.03 }}
            preset={preset}
            motion={{ autoRotate: 0.15 }}
            onEngine={setEngine}
            style={{ position: "absolute", inset: 0, minHeight: 0 }}
          />
        </ClipFrame>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <WordInput value={word} onChange={setWord} />
            <PresetSelect value={preset} onChange={setPreset} />
          </div>
          <ClipPanel engine={engine} settings={settings} onChange={setSettings} showSafe={showSafe} onShowSafe={setShowSafe} fileName={`liquidforge-${word.toLowerCase() || "drop"}`} />
        </div>
      </div>
    </BetaShell>
  )
}
