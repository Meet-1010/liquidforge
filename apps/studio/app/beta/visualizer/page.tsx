"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LiquidCanvas, extractPalette, resolvePreset, type LiquidEngine, type ObjectSource } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { ClipFrame, ClipPanel, useClipSettings } from "@/components/clip-panel"
import { PresetSelect, WordInput } from "@/components/look-picker"
import { analyseTrack, demoBeat, findOnsets, lastOnsetIndex, type Onsets, type TrackAnalysis } from "@/lib/beat"

/**
 * A song, as a liquid object.
 *
 * The track is analysed once, ahead of time: every kick becomes a splash, the
 * body of the sound becomes a stream of ripples, and a hard hit makes the
 * surface boil for a moment and settle. Because every frame looks its moment
 * up rather than listening live, the rendered clip lands on the beat exactly —
 * even rendered at a fraction of real time.
 */

interface Reaction {
  ripples: number
  pump: number
  hum: number
}

/** What the surface does at a moment in the track. Remembers the last moment, so each hit fires once. */
function createDriver() {
  let last = Number.NEGATIVE_INFINITY
  return (engine: LiquidEngine, time: number, analysis: TrackAnalysis, onsets: Onsets, reaction: Reaction) => {
    // A loop back to the start, or a jump: fire nothing that was skipped over.
    if (time < last || time - last > 0.25) last = time - 0.0005
    const current = lastOnsetIndex(onsets, time)
    const previous = lastOnsetIndex(onsets, last)
    if (reaction.ripples > 0) {
      for (let i = previous + 1; i <= current; i++) engine.splash(reaction.ripples * onsets.strengths[i])
    }
    last = time

    const index = Math.max(0, Math.min(analysis.low.length - 1, Math.floor(time * analysis.rate)))
    const since = current >= 0 ? time - onsets.times[current] : 99
    const hit = current >= 0 ? onsets.strengths[current] * Math.exp(-since * 9) : 0
    engine.setMutation(Math.min(0.8, reaction.pump * (hit * 0.75 + analysis.low[index] * 0.12)))
    engine.setAudioLevel(analysis.level[index] * reaction.hum)
  }
}

function estimateTempo(onsets: Onsets): number | null {
  const gaps: number[] = []
  for (let i = 1; i < onsets.times.length; i++) gaps.push(onsets.times[i] - onsets.times[i - 1])
  if (gaps.length < 4) return null
  gaps.sort((a, b) => a - b)
  let bpm = 60 / gaps[Math.floor(gaps.length / 2)]
  while (bpm < 80) bpm *= 2
  while (bpm > 180) bpm /= 2
  return Math.round(bpm)
}

export default function VisualizerPage() {
  const [word, setWord] = useState("BASS")
  const [logo, setLogo] = useState<{ object: ObjectSource; name: string } | null>(null)
  const [preset, setPreset] = useState("ferrofluid-1")
  const [cover, setCover] = useState<{ palette: string[]; name: string } | null>(null)
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [settings, setSettings] = useClipSettings({ seconds: 8 })
  const [showSafe, setShowSafe] = useState(false)
  const [analysis, setAnalysis] = useState<TrackAnalysis | null>(null)
  const [sensitivity, setSensitivity] = useState(1)
  const [reaction, setReaction] = useState<Reaction>({ ripples: 1, pump: 0.35, hum: 0.5 })
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Something to move to before a track is chosen.
  useEffect(() => {
    let cancelled = false
    void demoBeat(16).then((buffer) => {
      if (!cancelled) setSettings((current) => (current.audio ? current : { ...current, audio: buffer, audioName: "Demo beat · made in your browser" }))
    })
    return () => {
      cancelled = true
    }
  }, [setSettings])

  useEffect(() => {
    if (!settings.audio) return setAnalysis(null)
    let cancelled = false
    void analyseTrack(settings.audio).then((result) => {
      if (!cancelled) setAnalysis(result)
    })
    return () => {
      cancelled = true
    }
  }, [settings.audio])

  const onsets = useMemo(() => (analysis ? findOnsets(analysis, sensitivity) : null), [analysis, sensitivity])
  const tempo = onsets ? estimateTempo(onsets) : null

  const object = useMemo<ObjectSource>(() => logo?.object ?? { type: "text", value: word.trim() || "BASS", depth: 0.55, bevel: 0.03 }, [logo, word])
  const look = useMemo(() => (cover ? { ...resolvePreset(preset), palette: cover.palette } : preset), [preset, cover])

  // -- preview ---------------------------------------------------------------
  const player = useRef<{ context: AudioContext; source: AudioBufferSourceNode; startedAt: number; offset: number; length: number } | null>(null)
  const busy = useRef(false)
  const playhead = useRef<HTMLDivElement>(null)

  const stop = useCallback(() => {
    const current = player.current
    player.current = null
    if (current) {
      current.source.stop()
      void current.context.close()
    }
    setPlaying(false)
    engine?.setAudioLevel(null)
    engine?.setMutation(0)
  }, [engine])

  const play = useCallback(() => {
    if (!settings.audio) return
    if (player.current) stop()
    const context = new AudioContext()
    const source = context.createBufferSource()
    const offset = Math.min(settings.audioOffset, Math.max(0, settings.audio.duration - 0.5))
    const length = Math.min(settings.seconds, settings.audio.duration - offset)
    source.buffer = settings.audio
    source.loop = true
    source.loopStart = offset
    source.loopEnd = offset + length
    source.connect(context.destination)
    source.start(0, offset)
    player.current = { context, source, startedAt: context.currentTime, offset, length }
    setPlaying(true)
  }, [settings.audio, settings.audioOffset, settings.seconds, stop])

  // A changed track, start point or length restarts what is playing.
  useEffect(() => {
    if (player.current) play()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.audio, settings.audioOffset, settings.seconds])

  useEffect(() => () => stop(), [stop])

  useEffect(() => {
    if (!engine || !analysis || !onsets) return
    const drive = createDriver()
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const current = player.current
      if (busy.current || !current) return
      const time = current.offset + ((current.context.currentTime - current.startedAt) % current.length)
      drive(engine, time, analysis, onsets, reaction)
      if (playhead.current) playhead.current.style.left = `${(time / analysis.duration) * 100}%`
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [engine, analysis, onsets, reaction])

  // -- render ----------------------------------------------------------------
  const exportDriver = useRef(createDriver())
  const drive = useCallback(
    (frame: number, sub: number, seconds: number) => {
      if (!engine || !analysis || !onsets) return
      if (frame === 0 && sub === 0) exportDriver.current = createDriver()
      exportDriver.current(engine, settings.audioOffset + seconds, analysis, onsets, reaction)
    },
    [engine, analysis, onsets, reaction, settings.audioOffset],
  )

  // -- the track strip -------------------------------------------------------
  const strip = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = strip.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    const width = (canvas.width = 1200)
    const height = (canvas.height = 120)
    context.clearRect(0, 0, width, height)
    if (!analysis || !onsets) return
    const x = (time: number) => (time / analysis.duration) * width

    context.fillStyle = "rgba(236, 234, 240, 0.06)"
    context.fillRect(x(settings.audioOffset), 0, x(settings.seconds), height)

    const columns = width
    for (let column = 0; column < columns; column++) {
      const i = Math.floor((column / columns) * analysis.low.length)
      const level = analysis.level[i]
      const low = analysis.low[i]
      context.fillStyle = "rgba(236, 234, 240, 0.22)"
      context.fillRect(column, height / 2 - level * 40, 1, level * 80)
      context.fillStyle = "rgba(236, 234, 240, 0.55)"
      context.fillRect(column, height / 2 - low * 22, 1, low * 44)
    }
    context.fillStyle = "#ff5a4f"
    for (let i = 0; i < onsets.times.length; i++) context.fillRect(Math.round(x(onsets.times[i])), height - 10, 1, 10 * Math.min(1, onsets.strengths[i]))
  }, [analysis, onsets, settings.audioOffset, settings.seconds])

  // -- inputs ----------------------------------------------------------------
  const logoInput = useRef<HTMLInputElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)

  const chooseLogo = async (file: File) => {
    setError(null)
    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
      setLogo({ object: { type: "svg", markup: await file.text(), depth: 0.5 }, name: file.name })
      return
    }
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    setLogo({ object: { type: "image", src, depth: 0.5, resolution: 384 }, name: file.name })
  }

  const chooseCover = async (file: File) => {
    setError(null)
    const url = URL.createObjectURL(file)
    try {
      setCover({ palette: await extractPalette(url, { count: 4 }), name: file.name })
    } catch {
      setError("That image couldn't be read for colours.")
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const slider = (key: keyof Reaction, label: string, max: number) => (
    <label className="block">
      <span className="mb-1 flex justify-between font-mono text-[10px] text-bone/50">
        {label} <span className="text-bone/30 tabular-nums">{reaction[key].toFixed(2)}</span>
      </span>
      <input type="range" min={0} max={max} step={0.05} value={reaction[key]} onChange={(event) => setReaction({ ...reaction, [key]: Number(event.target.value) })} />
    </label>
  )

  const chip = "rounded-[var(--radius-pill)] border border-rule px-2.5 py-1 font-mono text-[10px] text-bone/70 transition-colors hover:border-rule-bright hover:text-bone"

  return (
    <BetaShell slug="visualizer" wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-5">
          <ClipFrame format={settings.format} showSafe={showSafe}>
            <LiquidCanvas object={object} preset={look} motion={{ autoRotate: 0 }} onEngine={setEngine} style={{ position: "absolute", inset: 0, minHeight: 0 }} />
            {!playing && (
              <button
                type="button"
                onClick={play}
                disabled={!analysis}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim disabled:opacity-40"
              >
                {analysis ? "Play with sound" : "Listening to the track…"}
              </button>
            )}
          </ClipFrame>

          <div className="rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={playing ? stop : play} disabled={!analysis} className={`${chip} w-16 disabled:opacity-40`}>
                {playing ? "Stop" : "Play"}
              </button>
              <span className="min-w-0 truncate font-mono text-[11px] text-bone/60">{settings.audioName ?? "No track"}</span>
              {onsets && (
                <span className="font-mono text-[10px] text-bone/35 tabular-nums">
                  {onsets.times.length} hits{tempo ? ` · about ${tempo} BPM` : ""}
                </span>
              )}
            </div>
            <div
              className="relative cursor-pointer"
              onClick={(event) => {
                if (!analysis) return
                const rect = event.currentTarget.getBoundingClientRect()
                const time = ((event.clientX - rect.left) / rect.width) * analysis.duration
                setSettings({ ...settings, audioOffset: Math.max(0, Math.min(analysis.duration - settings.seconds, Math.round(time * 10) / 10)) })
              }}
            >
              <canvas ref={strip} className="block h-20 w-full rounded-[var(--radius-sm)] bg-ink" aria-label="The track's loudness, with each detected hit marked" />
              <div ref={playhead} className="pointer-events-none absolute inset-y-0 w-px bg-bone" style={{ left: 0, opacity: playing ? 1 : 0 }} />
            </div>
            <p className="mt-2 font-mono text-[10px] text-bone/30">Click the strip to start the clip there. Red ticks are the hits the surface splashes on.</p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {slider("ripples", "Splash on every hit", 2)}
              {slider("pump", "Boil on hard hits", 1)}
              {slider("hum", "Ripple with the sound", 1.5)}
              <label className="block">
                <span className="mb-1 flex justify-between font-mono text-[10px] text-bone/50">
                  Hits to catch <span className="text-bone/30 tabular-nums">{sensitivity.toFixed(2)}</span>
                </span>
                <input type="range" min={0.4} max={2.5} step={0.05} value={sensitivity} onChange={(event) => setSensitivity(Number(event.target.value))} />
              </label>
            </div>
          </div>

          <div className="grid gap-4 rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4 sm:grid-cols-2">
            <div className="space-y-3">
              {logo ? (
                <div>
                  <p className="mb-1.5 font-mono text-[11px] text-bone/55">Object</p>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 truncate font-mono text-[11px] text-bone/75">{logo.name}</span>
                    <button type="button" onClick={() => setLogo(null)} className="font-mono text-[10px] text-bone/40 hover:text-bone">
                      Use a word
                    </button>
                  </div>
                </div>
              ) : (
                <WordInput value={word} onChange={setWord} label="Artist, title or word" />
              )}
              <input ref={logoInput} type="file" accept="image/svg+xml,image/png,image/webp" className="hidden" onChange={(event) => event.target.files?.[0] && void chooseLogo(event.target.files[0])} />
              <button type="button" onClick={() => logoInput.current?.click()} className={chip}>
                {logo ? "Change logo" : "Use a logo instead"}
              </button>
              <p className="font-mono text-[10px] leading-relaxed text-bone/30">SVG, or a PNG with a transparent background.</p>
            </div>
            <div className="space-y-3">
              <PresetSelect value={preset} onChange={setPreset} />
              <input ref={coverInput} type="file" accept="image/*" className="hidden" onChange={(event) => event.target.files?.[0] && void chooseCover(event.target.files[0])} />
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => coverInput.current?.click()} className={chip}>
                  {cover ? "Change cover art" : "Colours from cover art"}
                </button>
                {cover && (
                  <>
                    <span className="flex gap-1">
                      {cover.palette.map((colour) => (
                        <span key={colour} className="h-4 w-4 rounded-full border border-rule" style={{ background: colour }} title={colour} />
                      ))}
                    </span>
                    <button type="button" onClick={() => setCover(null)} className="font-mono text-[10px] text-bone/40 hover:text-bone">
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>
            {error && (
              <p role="alert" className="font-mono text-[11px] text-[#ff8a7a] sm:col-span-2">
                {error}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <ClipPanel
            engine={engine}
            settings={settings}
            onChange={setSettings}
            showSafe={showSafe}
            onShowSafe={setShowSafe}
            fileName={`liquidforge-${(logo?.name.replace(/\.\w+$/, "") ?? word).toLowerCase().replace(/[^a-z0-9]+/g, "-") || "visualizer"}`}
            drive={drive}
            preroll={false}
            onBusy={(value) => {
              busy.current = value
              if (value) stop()
              else {
                engine?.setAudioLevel(null)
                engine?.setMutation(0)
              }
            }}
          />
        </div>
      </div>
    </BetaShell>
  )
}
