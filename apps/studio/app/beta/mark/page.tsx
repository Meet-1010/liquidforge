"use client"

import { useState } from "react"
import { LiquidCanvas, type LiquidEngine } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { ClipFrame, ClipPanel, useClipSettings } from "@/components/clip-panel"
import { CopyButton } from "@/components/ui"
import { CLIP_FORMATS } from "@/lib/clip"

const SITE = "https://liquidforge-pi.vercel.app"

export default function MarkPage() {
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [settings, setSettings] = useClipSettings({ format: CLIP_FORMATS[2], mark: true, seconds: 5 })
  const [showSafe, setShowSafe] = useState(false)
  const [tone, setTone] = useState<"dark" | "light">("dark")

  const colours = tone === "dark" ? { bg: "#0b0b0f", fg: "#eceaf0", border: "#2a2a31" } : { bg: "#ffffff", fg: "#16161a", border: "#dcd9d2" }
  const badge = `<a href="${SITE}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px 5px 6px;border-radius:999px;border:1px solid ${colours.border};background:${colours.bg};color:${colours.fg};font:500 11px/1 ui-monospace,Menlo,monospace;text-decoration:none">
  <img src="${SITE}/icon.svg" width="16" height="16" alt="" style="border-radius:4px">made with liquidforge
</a>`

  return (
    <BetaShell slug="mark" wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <ClipFrame format={settings.format} showSafe={showSafe} maxHeight={460}>
            <LiquidCanvas object={{ type: "shape", shape: "torus", detail: 200 }} preset="halo-5" onEngine={setEngine} style={{ position: "absolute", inset: 0, minHeight: 0 }} />
            {settings.mark && (
              <div className="pointer-events-none absolute right-[6%] bottom-[6%] flex items-center gap-1.5 opacity-80">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon.svg" alt="" width={20} height={20} />
                <span className="font-mono text-[11px] text-bone">liquidforge</span>
              </div>
            )}
          </ClipFrame>

          <div className="rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[12px] text-bone">A badge for your site</p>
              <div className="flex gap-1.5">
                {(["dark", "light"] as const).map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => setTone(entry)}
                    className={`rounded-[var(--radius-pill)] border px-2.5 py-1 font-mono text-[10px] ${tone === entry ? "border-bone bg-bone text-ink" : "border-rule text-bone/60"}`}
                  >
                    {entry}
                  </button>
                ))}
              </div>
            </div>
            <div className="my-4 grid place-items-center rounded-[var(--radius-md)] py-6" style={{ background: tone === "dark" ? "#16161b" : "#f4f2ee" }}>
              <div dangerouslySetInnerHTML={{ __html: badge }} />
            </div>
            <pre className="overflow-x-auto rounded-[var(--radius-sm)] border border-rule bg-ink p-3 font-mono text-[10.5px] leading-relaxed text-bone/70">{badge}</pre>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] text-bone/35">Optional, free, and removable — nothing is locked behind it.</p>
              <CopyButton text={badge} label="Copy badge" />
            </div>
          </div>
        </div>
        <ClipPanel engine={engine} settings={settings} onChange={setSettings} showSafe={showSafe} onShowSafe={setShowSafe} fileName="liquidforge-marked" />
      </div>
    </BetaShell>
  )
}
