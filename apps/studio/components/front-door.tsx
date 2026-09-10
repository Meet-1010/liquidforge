"use client"

import { useState } from "react"
import { PRESETS } from "liquidforge"
import { recommend } from "liquidforge/recommend"
import { configFromPreset, type LiquidConfig } from "liquidforge/codegen"

/**
 * One question, at the top of the rail.
 *
 * The Studio has sixty-five controls before you touch anything, and a
 * first-time visitor's actual question is not "what should the index of
 * refraction be" — it is "what do I do here". The recommender that answers that
 * has existed since the MCP server was written; it was just buried inside the
 * object panel behind a logo upload, which is a narrower door than it deserves.
 *
 * The bet is Stripe's: most people never open the rail, because a good default
 * meant they never had to. The rail is still right there for everyone else, and
 * nothing has been removed to make room for this.
 */
export function FrontDoor({
  onPick,
  dismissed,
  onDismiss,
}: {
  onPick: (config: LiquidConfig, reason: string) => void
  dismissed: boolean
  onDismiss: () => void
}) {
  const [text, setText] = useState("")
  const [reason, setReason] = useState<string | null>(null)

  if (dismissed) return null

  const go = () => {
    const description = text.trim()
    if (!description) return
    const suggestion = recommend({ description, background: "dark" })
    const picked = PRESETS[suggestion.preset.id] ?? suggestion.preset
    setReason(suggestion.reason)
    onPick(configFromPreset(picked.id), suggestion.reason)
  }

  return (
    <div className="border-b border-rule px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor="front-door"
          className="font-mono text-[10px] tracking-[0.14em] text-bone/40 uppercase"
        >
          What is it for?
        </label>
        <button
          type="button"
          onClick={onDismiss}
          className="font-mono text-[10px] text-bone/30 transition-colors hover:text-bone/60"
        >
          skip
        </button>
      </div>

      <div className="mt-2.5 flex gap-2">
        <input
          id="front-door"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && go()}
          placeholder="fintech dashboard, needs to feel trustworthy"
          className="min-w-0 flex-1 rounded border border-rule bg-ink-2 px-2.5 py-2 font-mono text-[12px] text-bone placeholder:text-bone/25 focus:border-rule-bright focus:outline-none"
        />
        <button
          type="button"
          onClick={go}
          disabled={!text.trim()}
          className="shrink-0 rounded-[var(--radius-pill)] bg-bone px-3.5 py-2 font-mono text-[11px] text-ink transition-opacity disabled:opacity-30"
        >
          Forge
        </button>
      </div>

      <p className="mt-2.5 font-mono text-[10px] leading-relaxed text-bone/30">
        {reason ??
          "Describe the site in your own words and this picks the material, the colourway and the motion. Everything below stays adjustable."}
      </p>
    </div>
  )
}
