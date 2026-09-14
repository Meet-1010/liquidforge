"use client"

import { useEffect, useRef, useState } from "react"
import { BetaShell } from "@/components/beta-shell"
import { PresetSelect, WordInput } from "@/components/look-picker"
import { DEFAULT_OVERLAY, StreamOverlay, overlayParams, type OverlayConfig, type OverlayHandle } from "@/components/stream-overlay"
import { connectTwitch, type ChatStatus, type StreamEvent } from "@/lib/twitch"

const CORNERS: Array<[OverlayConfig["corner"], string]> = [
  ["tl", "Top left"],
  ["tr", "Top right"],
  ["bl", "Bottom left"],
  ["br", "Bottom right"],
  ["center", "Centre"],
]

const SAMPLES: Array<[string, StreamEvent]> = [
  ["Chat message", { kind: "chat", user: "viewer", text: "gg" }],
  ["Cheer 500 bits", { kind: "chat", user: "nightowl", text: "Cheer500", bits: 500 }],
  ["Sub", { kind: "sub", user: "mira_plays", months: 1 }],
  ["Gift 10 subs", { kind: "sub", user: "bigheart", gifts: 10 }],
  ["Raid", { kind: "raid", user: "ForgeFriday", viewers: 240 }],
]

export default function StreamPage() {
  const [config, setConfig] = useState<OverlayConfig>(DEFAULT_OVERLAY)
  const [status, setStatus] = useState<ChatStatus | null>(null)
  const [messages, setMessages] = useState(0)
  const [copied, setCopied] = useState(false)
  const overlay = useRef<OverlayHandle>(null)
  const set = (patch: Partial<OverlayConfig>) => setConfig((current) => ({ ...current, ...patch }))

  // The preview listens to the real channel too, so you can see your own chat land before going live.
  useEffect(() => {
    if (!/^\w{3,25}$/.test(config.channel)) {
      setStatus(null)
      return
    }
    setMessages(0)
    return connectTwitch(
      config.channel,
      (event) => {
        setMessages((count) => count + 1)
        overlay.current?.push(event)
      },
      setStatus,
    )
  }, [config.channel])

  const url = typeof window === "undefined" ? "" : `${window.location.origin}/beta/stream/overlay?${overlayParams(config)}`

  return (
    <BetaShell slug="stream" wide>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-3">
          <div
            className="relative aspect-video overflow-hidden rounded-[var(--radius-lg)] border border-rule"
            style={{
              containerType: "size",
              background:
                "radial-gradient(120% 90% at 20% 80%, #3b2a5c 0%, transparent 60%), radial-gradient(90% 80% at 85% 20%, #1d4a52 0%, transparent 55%), linear-gradient(160deg, #141821, #0a0b10)",
            }}
          >
            <div aria-hidden className="absolute left-[4%] top-[6%] font-mono text-[clamp(9px,1.6cqh,13px)] text-white/35">
              your game or camera here
            </div>
            <StreamOverlay ref={overlay} config={config} framed />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map(([label, event]) => (
              <button
                key={label}
                type="button"
                onClick={() => overlay.current?.push(event)}
                className="rounded-[var(--radius-pill)] border border-rule px-2.5 py-1 font-mono text-[10px] text-bone/70 transition-colors hover:border-rule-bright hover:text-bone"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4">
          <label className="block">
            <span className="mb-1.5 block font-mono text-[11px] text-bone/55">Twitch channel</span>
            <input
              type="text"
              value={config.channel}
              placeholder="yourchannel"
              maxLength={25}
              onChange={(event) => set({ channel: event.target.value.replace(/[^\w]/g, "") })}
              className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none placeholder:text-bone/25 focus:border-bone"
            />
            <span className="mt-1 block font-mono text-[10px] text-bone/35">
              {status === "live"
                ? `Reading chat · ${messages} event${messages === 1 ? "" : "s"} so far`
                : status === "connecting"
                  ? "Connecting…"
                  : status === "offline"
                    ? "Reconnecting…"
                    : status === "error"
                      ? "That isn't a valid channel name."
                      : "Read anonymously — no login, nothing to authorise."}
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <WordInput value={config.word} onChange={(word) => set({ word })} max={12} />
            <PresetSelect value={config.preset} onChange={(preset) => set({ preset })} />
          </div>
          <div>
            <p className="mb-1.5 font-mono text-[11px] text-bone/55">Position</p>
            <div className="flex flex-wrap gap-1.5">
              {CORNERS.map(([corner, label]) => (
                <button
                  key={corner}
                  type="button"
                  onClick={() => set({ corner })}
                  className={`rounded-[var(--radius-pill)] border px-2.5 py-1 font-mono text-[10px] ${
                    config.corner === corner ? "border-bone bg-bone text-ink" : "border-rule text-bone/60 hover:text-bone"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 flex justify-between font-mono text-[11px] text-bone/55">
              Size <span className="text-bone/30 tabular-nums">{Math.round(config.size * 100)}% of the height</span>
            </span>
            <input type="range" min={0.15} max={0.7} step={0.01} value={config.size} onChange={(event) => set({ size: Number(event.target.value) })} />
          </label>
          <label className="flex items-center gap-2 font-mono text-[11px] text-bone/60">
            <input type="checkbox" checked={config.chat} onChange={(event) => set({ chat: event.target.checked })} />
            Ripple on every chat message
          </label>
          <label className="flex items-center gap-2 font-mono text-[11px] text-bone/60">
            <input type="checkbox" checked={config.names} onChange={(event) => set({ names: event.target.checked })} />
            Show who subbed, cheered or raided
          </label>

          <div className="border-t border-rule pt-4">
            <p className="mb-1.5 font-mono text-[11px] text-bone/55">In OBS: Sources → + → Browser, then paste</p>
            <div className="break-all rounded-[var(--radius-sm)] border border-rule bg-ink p-2 font-mono text-[10px] leading-relaxed text-bone/70">{url}</div>
            <button
              type="button"
              disabled={!config.channel}
              onClick={() =>
                void navigator.clipboard?.writeText(url).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                })
              }
              className="mt-2 w-full rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim disabled:opacity-40"
            >
              {copied ? "Copied" : config.channel ? "Copy the browser source URL" : "Enter your channel first"}
            </button>
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-bone/30">Set the source to 1920 × 1080. The page is transparent, so only the object shows.</p>
          </div>
        </div>
      </div>
    </BetaShell>
  )
}
