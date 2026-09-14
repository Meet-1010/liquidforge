"use client"

import { useEffect, useRef, useState } from "react"
import { LiquidCanvas, PRESETS, describeChange, type LiquidEngine } from "liquidforge"
import { configFromPreset, generateCode } from "liquidforge/codegen"
import { BetaShell } from "@/components/beta-shell"
import { CopyButton } from "@/components/ui"
import { interpret, type TalkState } from "@/lib/talk"

interface Turn {
  said: string
  understood: string[]
  change: string
}

type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void
  onend: () => void
  onerror: () => void
  start: () => void
  stop: () => void
}

const EXAMPLES = ["make it gold and slower", "glass, a bit glossier", "turn it into a knot", "ferrofluid, much spikier", "calmer and cooler", "say HELLO", "molten and louder", "undo"]

export default function TalkPage() {
  const [history, setHistory] = useState<TalkState[]>([{ preset: PRESETS["mercury-1"], object: { type: "text", value: "TALK", depth: 0.45, bevel: 0.03 } }])
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState("")
  const [listening, setListening] = useState(false)
  const [speech, setSpeech] = useState(false)
  const recognition = useRef<Recognition | null>(null)
  const [, setEngine] = useState<LiquidEngine | null>(null)
  const state = history[history.length - 1]

  useEffect(() => {
    const Ctor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition
    setSpeech(Boolean(Ctor))
  }, [])

  const say = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (/^\s*(undo|go back|back)\s*$/i.test(trimmed)) {
      if (history.length > 1) {
        setHistory((h) => h.slice(0, -1))
        setTurns((t) => [...t, { said: trimmed, understood: ["undo"], change: "Back to the look before." }])
      }
      return
    }
    const result = interpret(trimmed, state)
    const look = result.understood.length ? describeChange(state.preset, result.state.preset) : ""
    // A new shape alone is not "almost the same"; the understood line already says what changed.
    const change = look === "Almost exactly the same." ? "" : look
    setTurns((t) => [...t, { said: trimmed, understood: result.understood, change }])
    if (result.understood.length) setHistory((h) => [...h, result.state])
  }

  const listen = () => {
    const Ctor = (window as unknown as { SpeechRecognition?: new () => Recognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition
    if (!Ctor) return
    if (listening) {
      recognition.current?.stop()
      return
    }
    const r = new Ctor()
    r.lang = "en-US"
    r.interimResults = false
    r.continuous = false
    r.onresult = (event) => say(event.results[0][0].transcript)
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    recognition.current = r
    setListening(true)
    r.start()
  }

  const base = PRESETS[state.preset.id] ?? PRESETS["mercury-1"]
  const code = generateCode({
    ...configFromPreset(base.id, state.object),
    family: state.preset.family,
    palette: state.preset.palette,
    surface: state.preset.surface,
    shading: state.preset.shading,
    background: state.preset.background,
  })

  return (
    <BetaShell slug="talk" wide>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-rule">
            <LiquidCanvas object={state.object} preset={state.preset} onEngine={setEngine} style={{ height: 460, minHeight: 0 }} />
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              say(input)
              setInput("")
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Say what you want: “gold, slower, a bit glossier”"
              className="min-w-0 flex-1 rounded-[var(--radius-pill)] border border-rule bg-ink-2 px-4 py-2.5 font-mono text-[12px] text-bone outline-none placeholder:text-bone/25 focus:border-bone"
            />
            {speech && (
              <button
                type="button"
                onClick={listen}
                aria-pressed={listening}
                className={`shrink-0 rounded-[var(--radius-pill)] border px-4 py-2 font-mono text-[11px] ${listening ? "border-[#ff5a4f] bg-[#ff5a4f] text-ink" : "border-rule text-bone/70 hover:text-bone"}`}
              >
                {listening ? "Listening…" : "🎙 Speak"}
              </button>
            )}
            <button type="submit" className="shrink-0 rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink hover:bg-bone-dim">
              Apply
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => say(example)} className="rounded-[var(--radius-pill)] border border-rule px-2.5 py-1 font-mono text-[10px] text-bone/55 hover:border-rule-bright hover:text-bone">
                {example}
              </button>
            ))}
          </div>
          {speech && (
            <p className="mt-2 font-mono text-[10px] leading-relaxed text-bone/30">
              Speaking uses your browser&apos;s own speech recognition; in Chrome that is processed by Google.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="max-h-[360px] space-y-2 overflow-y-auto rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-3">
            {turns.length === 0 && <p className="font-mono text-[11px] text-bone/35">Nothing said yet.</p>}
            {turns.map((turn, index) => (
              <div key={index} className="rounded-[var(--radius-md)] bg-ink px-3 py-2">
                <p className="font-mono text-[12px] text-bone/85">&ldquo;{turn.said}&rdquo;</p>
                <p className="mt-1 font-mono text-[10px] text-bone/40">
                  {turn.understood.length ? `Understood: ${turn.understood.join(", ")}` : "Didn't catch anything to change — try a colour, a material, or slower, glossier, louder."}
                </p>
                {turn.change && <p className="mt-1 text-[12px] text-bone/65">{turn.change}</p>}
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink-2">
            <div className="flex items-center justify-between border-b border-rule px-3 py-2">
              <p className="font-mono text-[11px] text-bone/60">The component, as it stands</p>
              <CopyButton text={code} label="Copy" />
            </div>
            <pre className="max-h-64 overflow-auto p-3 font-mono text-[10.5px] leading-relaxed text-bone/70">{code}</pre>
          </div>
        </div>
      </div>
    </BetaShell>
  )
}
