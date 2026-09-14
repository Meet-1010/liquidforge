"use client"

import { useState } from "react"
import { LiquidCanvas, type LiquidEngine } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { PresetSelect, WordInput } from "@/components/look-picker"
import { recordGif } from "@/lib/gif"

/**
 * Share links that move.
 *
 * The look is rendered into a small looping GIF right here, on this device's
 * GPU — nothing renders on a server — then saved with the look under a short
 * link. Pasted, it unfurls as the GIF — played or still, as the app
 * chooses; opened, it is the live, touchable object.
 */

const SIZES = [
  { width: 600, height: 314, fps: 12, colours: 192 },
  { width: 480, height: 251, fps: 10, colours: 128 },
  { width: 400, height: 209, fps: 10, colours: 96 },
]
const LIMIT = 880_000

export default function LinksPage() {
  const [word, setWord] = useState("HELLO")
  const [title, setTitle] = useState("Touch this")
  const [preset, setPreset] = useState("aurora-2")
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [made, setMade] = useState<{ url: string; gif: string; kb: number } | null>(null)
  const [copied, setCopied] = useState(false)

  const make = async () => {
    if (!engine) return
    setError(null)
    setMade(null)
    setProgress(0)
    try {
      // The smallest size that fits under the limit, trying the sharpest first.
      let bytes: Uint8Array | null = null
      for (const size of SIZES) {
        bytes = await recordGif(engine, { ...size, seconds: 2.5, onProgress: setProgress })
        if (bytes.length <= LIMIT) break
      }
      if (!bytes || bytes.length > LIMIT) throw new Error("That look makes a GIF too large to share. A calmer colourway compresses better.")

      const form = new FormData()
      form.set("gif", new Blob([new Uint8Array(bytes)], { type: "image/gif" }), "link.gif")
      form.set("title", title.trim() || word)
      form.set("preset", preset)
      form.set("object", JSON.stringify({ type: "text", value: word.trim() || "HELLO", depth: 0.5, bevel: 0.03 }))
      const response = await fetch("/api/links", { method: "POST", body: form })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? "The link couldn't be saved.")
      setMade({ url: `${window.location.origin}${body.path}`, gif: `/api/links/${body.id}/gif`, kb: Math.round(bytes.length / 1024) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The link couldn't be made.")
    } finally {
      setProgress(null)
    }
  }

  return (
    <BetaShell slug="links" wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="relative aspect-[1200/628] overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink">
          <LiquidCanvas object={{ type: "text", value: word.trim() || "HELLO", depth: 0.5, bevel: 0.03 }} preset={preset} onEngine={setEngine} style={{ position: "absolute", inset: 0, minHeight: 0 }} />
          <span className="pointer-events-none absolute left-3 top-3 font-mono text-[10px] text-bone/35">the preview a link unfurls as · 1.91 : 1</span>
        </div>

        <div className="space-y-4 rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4">
          <WordInput value={word} onChange={setWord} />
          <label className="block">
            <span className="mb-1.5 block font-mono text-[11px] text-bone/55">Link title</span>
            <input
              type="text"
              maxLength={60}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none focus:border-bone"
            />
          </label>
          <PresetSelect value={preset} onChange={setPreset} />
          <button
            type="button"
            disabled={!engine || progress !== null}
            onClick={make}
            className="w-full rounded-[var(--radius-pill)] bg-bone px-4 py-2.5 font-mono text-[12px] text-ink transition-colors hover:bg-bone-dim disabled:opacity-40"
          >
            {progress !== null ? (progress < 0.8 ? `Rendering ${Math.round((progress / 0.8) * 100)}%` : "Encoding the GIF…") : "Make the moving link"}
          </button>
          <p className="font-mono text-[10px] leading-relaxed text-bone/35">
            Making a link publishes its title, word and GIF at an address anyone with the link can open.
          </p>
          {error && <p role="alert" className="font-mono text-[11px] text-[#ff8a7a]">{error}</p>}
          {made && (
            <div className="space-y-3 border-t border-rule pt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={made.gif} alt="The GIF the link unfurls as" className="w-full rounded-[var(--radius-sm)] border border-rule" />
              <p className="break-all font-mono text-[11px] text-bone/80">{made.url}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard?.writeText(made.url).then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1600)
                    })
                  }
                  className="flex-1 rounded-[var(--radius-pill)] bg-bone px-3 py-2 font-mono text-[11px] text-ink hover:bg-bone-dim"
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
                <a href={made.url} target="_blank" rel="noreferrer" className="rounded-[var(--radius-pill)] border border-rule px-3 py-2 font-mono text-[11px] text-bone/75 hover:text-bone">
                  Open
                </a>
              </div>
              <p className="font-mono text-[10px] text-bone/30">{made.kb} KB · paste it anywhere to see how that app shows it; some play the GIF, some show its first frame.</p>
            </div>
          )}
        </div>
      </div>
    </BetaShell>
  )
}
