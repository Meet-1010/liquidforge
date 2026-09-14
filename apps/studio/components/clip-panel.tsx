"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { downloadBlob, type LiquidEngine } from "liquidforge"
import { CLIP_FORMATS, decodeAudio, recordClip, type ClipFormat, type ClipOptions } from "@/lib/clip"

export interface ClipSettings {
  format: ClipFormat
  seconds: number
  fps: 30 | 60
  supersample: 1 | 2
  motionBlur: 1 | 3 | 5
  mark: boolean
  audio: AudioBuffer | null
  audioName: string | null
  audioOffset: number
}

export function useClipSettings(initial: Partial<ClipSettings> = {}) {
  return useState<ClipSettings>({
    format: CLIP_FORMATS[0],
    seconds: 6,
    fps: 30,
    supersample: 1,
    motionBlur: 1,
    mark: false,
    audio: null,
    audioName: null,
    audioOffset: 0,
    ...initial,
  })
}

/** A preview framed to the clip's shape, with each app's interface drawn where it will sit. */
export function ClipFrame({ format, showSafe, children, maxHeight = 560 }: { format: ClipFormat; showSafe: boolean; children: ReactNode; maxHeight?: number }) {
  const [top, right, bottom, left] = format.safe
  return (
    <div className="mx-auto w-full" style={{ maxWidth: (maxHeight * format.width) / format.height }}>
      <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink" style={{ aspectRatio: `${format.width} / ${format.height}` }}>
        {children}
        {showSafe && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 bg-[#ff5a4f]/15" style={{ height: `${top * 100}%` }} />
            <div className="absolute inset-x-0 bottom-0 bg-[#ff5a4f]/15" style={{ height: `${bottom * 100}%` }} />
            <div className="absolute right-0 bg-[#ff5a4f]/15" style={{ top: `${top * 100}%`, bottom: `${bottom * 100}%`, width: `${right * 100}%` }} />
            <div className="absolute left-0 bg-[#ff5a4f]/15" style={{ top: `${top * 100}%`, bottom: `${bottom * 100}%`, width: `${left * 100}%` }} />
            <p className="absolute bottom-1 left-2 font-mono text-[9px] text-[#ffb3ae]">covered by the app</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Every control a post-ready clip needs, and the button that makes it.
 * `extra` lets an experiment add its own options — a timeline, a beat — and
 * `drive` hands it the per-frame hook.
 */
export function ClipPanel({
  engine,
  settings,
  onChange,
  showSafe,
  onShowSafe,
  fileName = "liquidforge-clip",
  drive,
  scriptedPointer,
  preroll,
  extra,
  allowAudio = true,
  onBusy,
}: {
  engine: LiquidEngine | null
  settings: ClipSettings
  onChange: (settings: ClipSettings) => void
  showSafe: boolean
  onShowSafe: (value: boolean) => void
  fileName?: string
  drive?: ClipOptions["beforeStep"]
  scriptedPointer?: boolean
  preroll?: boolean
  extra?: ReactNode
  allowAudio?: boolean
  /** Told when a render starts and ends, so a live preview can stand aside while the engine is recording. */
  onBusy?: (busy: boolean) => void
}) {
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<ClipSettings>) => onChange({ ...settings, ...patch })

  useEffect(() => setDone(null), [settings])

  const record = async () => {
    if (!engine) return
    setProgress(0)
    setError(null)
    setDone(null)
    onBusy?.(true)
    try {
      const blob = await recordClip(engine, {
        seconds: settings.seconds,
        fps: settings.fps,
        format: settings.format,
        audio: settings.audio,
        audioOffset: settings.audioOffset,
        supersample: settings.supersample,
        motionBlur: settings.motionBlur,
        mark: settings.mark,
        beforeStep: drive,
        scriptedPointer,
        preroll,
        onProgress: setProgress,
      })
      const name = `${fileName}-${settings.format.id}.mp4`
      downloadBlob(blob, name)
      setDone(`${name} · ${(blob.size / 1_048_576).toFixed(1)} MB`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setProgress(null)
      onBusy?.(false)
    }
  }

  const chip = (active: boolean) =>
    `rounded-[var(--radius-pill)] border px-2.5 py-1 font-mono text-[10px] transition-colors ${
      active ? "border-bone bg-bone text-ink" : "border-rule text-bone/60 hover:border-rule-bright hover:text-bone"
    }`

  return (
    <div className="space-y-4 rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4">
      <div>
        <p className="mb-2 font-mono text-[11px] text-bone/55">Shape</p>
        <div className="flex flex-wrap gap-1.5">
          {CLIP_FORMATS.map((format) => (
            <button key={format.id} type="button" onClick={() => set({ format })} className={chip(settings.format.id === format.id)}>
              {format.label}
            </button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 font-mono text-[10px] text-bone/45">
          <input type="checkbox" checked={showSafe} onChange={(event) => onShowSafe(event.target.checked)} />
          Show where the app&apos;s buttons will cover it
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 flex justify-between font-mono text-[11px] text-bone/55">
            Length <span className="text-bone/30">{settings.seconds}s</span>
          </span>
          <input type="range" min={2} max={15} step={1} value={settings.seconds} onChange={(event) => set({ seconds: Number(event.target.value) })} />
        </label>
        <div>
          <p className="mb-1 font-mono text-[11px] text-bone/55">Frame rate</p>
          <div className="flex gap-1.5">
            {([30, 60] as const).map((fps) => (
              <button key={fps} type="button" onClick={() => set({ fps })} className={chip(settings.fps === fps)}>
                {fps} fps
              </button>
            ))}
          </div>
        </div>
      </div>

      {allowAudio && (
        <div>
          <p className="mb-2 font-mono text-[11px] text-bone/55">Sound</p>
          <input
            ref={audioInput}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              try {
                set({ audio: await decodeAudio(file), audioName: file.name, audioOffset: 0 })
              } catch {
                setError("That file couldn't be read as audio.")
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => audioInput.current?.click()} className={chip(false)}>
              {settings.audioName ? "Change track" : "Add a track"}
            </button>
            {settings.audioName && (
              <>
                <span className="max-w-[12rem] truncate font-mono text-[10px] text-bone/60">{settings.audioName}</span>
                <button type="button" onClick={() => set({ audio: null, audioName: null })} className="font-mono text-[10px] text-bone/40 hover:text-bone">
                  Remove
                </button>
              </>
            )}
          </div>
          {settings.audio && (
            <label className="mt-2 block">
              <span className="mb-1 flex justify-between font-mono text-[10px] text-bone/45">
                Start the track at <span>{settings.audioOffset.toFixed(1)}s</span>
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0, settings.audio.duration - settings.seconds)}
                step={0.1}
                value={settings.audioOffset}
                onChange={(event) => set({ audioOffset: Number(event.target.value) })}
              />
            </label>
          )}
          <p className="mt-1 font-mono text-[10px] text-bone/30">Only use music you have the rights to post.</p>
        </div>
      )}

      {extra}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 font-mono text-[11px] text-bone/55">Sharpness</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => set({ supersample: 1 })} className={chip(settings.supersample === 1)}>
              Standard
            </button>
            <button type="button" onClick={() => set({ supersample: 2 })} className={chip(settings.supersample === 2)}>
              4× supersampled
            </button>
          </div>
        </div>
        <div>
          <p className="mb-1 font-mono text-[11px] text-bone/55">Motion blur</p>
          <div className="flex gap-1.5">
            {([1, 3, 5] as const).map((value) => (
              <button key={value} type="button" onClick={() => set({ motionBlur: value })} className={chip(settings.motionBlur === value)}>
                {value === 1 ? "None" : value === 3 ? "Film" : "Heavy"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 font-mono text-[11px] text-bone/60">
        <input type="checkbox" checked={settings.mark} onChange={(event) => set({ mark: event.target.checked })} />
        Add the Liquidforge mark
      </label>

      <button
        type="button"
        disabled={!engine || progress !== null}
        onClick={record}
        className="w-full rounded-[var(--radius-pill)] bg-bone px-4 py-2.5 font-mono text-[12px] text-ink transition-colors hover:bg-bone-dim disabled:opacity-40"
      >
        {progress !== null ? `Rendering ${Math.round(progress * 100)}%` : `Render ${settings.seconds}s ${settings.format.id} clip`}
      </button>
      {settings.supersample === 2 || settings.motionBlur > 1 ? (
        <p className="font-mono text-[10px] leading-relaxed text-bone/30">
          Every frame is rendered {settings.supersample * settings.supersample * settings.motionBlur}× over, so this takes longer — the
          result is better than a screen can draw live.
        </p>
      ) : null}
      {done && <p className="font-mono text-[11px] text-bone/60">Downloaded {done}</p>}
      {error && <p role="alert" className="font-mono text-[11px] text-[#ff8a7a]">{error}</p>}
    </div>
  )
}
