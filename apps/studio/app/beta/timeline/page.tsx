"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  LiquidCanvas,
  applyCheckpointState,
  checkpointAt,
  prepareSequence,
  samplePath,
  type LiquidEngine,
  type ObjectSource,
  type PlacementPath,
  type ShapeKind,
} from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { ClipFrame, ClipPanel, useClipSettings } from "@/components/clip-panel"
import { PresetSelect } from "@/components/look-picker"

/**
 * A timeline instead of a scroll bar.
 *
 * A scroll path already knows how to melt one object into another at a moment:
 * every checkpoint is a point with a time. Here the time is seconds rather than
 * scroll, so a clip can say MELT, then DRIP at two seconds, then become a
 * ferrofluid knot at six — each change morphed, never cut — and the render
 * drives the same state frame by frame.
 */

type Subject = { kind: "word"; value: string } | { kind: "shape"; shape: ShapeKind }

interface Moment {
  id: number
  at: number
  subject: Subject
  preset: string
}

const SHAPES: Array<[ShapeKind, string]> = [
  ["sphere", "Sphere"],
  ["torusknot", "Knot"],
  ["torus", "Ring"],
  ["capsule", "Capsule"],
  ["icosahedron", "Gem"],
  ["rounded-box", "Box"],
]

const INITIAL: Moment[] = [
  { id: 1, at: 0, subject: { kind: "word", value: "MELT" }, preset: "mercury-3" },
  { id: 2, at: 2, subject: { kind: "word", value: "DRIP" }, preset: "aurora-2" },
  { id: 3, at: 4, subject: { kind: "word", value: "FLUX" }, preset: "magma-4" },
  { id: 4, at: 6, subject: { kind: "shape", shape: "torusknot" }, preset: "ferrofluid-1" },
]

function toObject(subject: Subject): ObjectSource {
  return subject.kind === "word"
    ? { type: "text", value: subject.value.trim() || "·", depth: 0.5, bevel: 0.03 }
    : { type: "shape", shape: subject.shape }
}

export default function TimelinePage() {
  const [moments, setMoments] = useState<Moment[]>(INITIAL)
  const [transition, setTransition] = useState(0.9)
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [settings, setSettings] = useClipSettings({ seconds: 8 })
  const [showSafe, setShowSafe] = useState(false)
  const [playing, setPlaying] = useState(true)
  const [readyEpoch, setReadyEpoch] = useState(0)
  const duration = settings.seconds

  const sorted = useMemo(() => [...moments].sort((a, b) => a.at - b.at), [moments])
  const first = sorted[0]
  const baseObject = useMemo(() => toObject(first.subject), [first.subject])
  const base = useMemo(() => ({ object: baseObject, preset: first.preset }), [baseObject, first.preset])

  // Moments after the end of the clip are kept, but play no part until the clip is long enough.
  const path = useMemo<PlacementPath>(() => {
    const points: PlacementPath["points"] = [{ x: 0.5, y: 0.5, at: 0 }]
    let object = JSON.stringify(baseObject)
    let preset = first.preset
    let last = 0
    for (const moment of sorted.slice(1)) {
      if (moment.at >= duration) break
      // Two moments at the same instant would give the melt nowhere to happen.
      const at = Math.max(last + 0.02, moment.at / duration)
      last = at
      const next = toObject(moment.subject)
      const nextKey = JSON.stringify(next)
      points.push({
        x: 0.5,
        y: 0.5,
        at: Math.min(0.999, at),
        ...(nextKey !== object ? { object: next } : {}),
        ...(moment.preset !== preset ? { preset: moment.preset } : {}),
      })
      object = nextKey
      preset = moment.preset
    }
    points.push({ x: 0.5, y: 0.5, at: 1 })
    return { points, smooth: false }
  }, [sorted, baseObject, first.preset, duration])
  const sampled = useMemo(() => samplePath(path), [path])
  const morphWindow = transition / 2 / duration
  const pathKey = JSON.stringify(path)

  // Every object on the timeline is forged and warmed before it is needed, so
  // the first play is as smooth as the tenth.
  useEffect(() => {
    if (!engine || readyEpoch === 0) return
    let cancelled = false
    void prepareSequence(engine, base, path.points.filter((point) => point.object || point.preset), { isCancelled: () => cancelled, prune: true }).then(() => {
      if (!cancelled) lastKey.current = ""
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, readyEpoch, pathKey])

  // -- preview ---------------------------------------------------------------
  const clock = useRef({ startedAt: 0, position: 0 })
  const lastKey = useRef("")
  const busy = useRef(false)
  const playhead = useRef<HTMLDivElement>(null)
  const readout = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (playing) clock.current.startedAt = performance.now() - clock.current.position * 1000
  }, [playing])

  useEffect(() => {
    if (!engine) return
    let frame = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (busy.current) return
      if (playing) clock.current.position = ((now - clock.current.startedAt) / 1000) % duration
      const seconds = Math.min(clock.current.position, duration)
      const state = checkpointAt(path, sampled, seconds / duration, base, morphWindow)
      lastKey.current = applyCheckpointState(engine, state, base, { lastKey: lastKey.current })
      if (playhead.current) playhead.current.style.left = `${(seconds / duration) * 100}%`
      if (readout.current) readout.current.textContent = `${seconds.toFixed(1)}s`
    }
    lastKey.current = ""
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [engine, playing, path, sampled, base, morphWindow, duration])

  // -- render ----------------------------------------------------------------
  // Written fresh at every step: the preview may have moved the engine between
  // two frames, so a cached key could skip a write the frame needs.
  const drive = useCallback(
    (_frame: number, _sub: number, seconds: number) => {
      if (!engine) return
      applyCheckpointState(engine, checkpointAt(path, sampled, Math.min(1, seconds / duration), base, morphWindow), base)
    },
    [engine, path, sampled, base, morphWindow, duration],
  )

  // -- editing ---------------------------------------------------------------
  const update = (id: number, patch: Partial<Moment>) => setMoments((list) => list.map((moment) => (moment.id === id ? { ...moment, ...patch } : moment)))
  const remove = (id: number) => setMoments((list) => list.filter((moment) => moment.id !== id))
  const add = () =>
    setMoments((list) => {
      const last = Math.max(...list.map((moment) => moment.at))
      const at = Math.round(Math.min(duration - 0.5, last + Math.max(1, (duration - last) / 2)) * 10) / 10
      return [...list, { id: Math.max(...list.map((moment) => moment.id)) + 1, at: Math.max(0.5, at), subject: { kind: "shape", shape: "sphere" }, preset: "pearl-1" }]
    })

  const bar = useRef<HTMLDivElement>(null)
  const dragging = useRef<number | "scrub" | null>(null)
  const secondsAt = (clientX: number) => {
    const rect = bar.current!.getBoundingClientRect()
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration))
  }
  const onBarMove = (clientX: number) => {
    const target = dragging.current
    if (target === null) return
    const seconds = secondsAt(clientX)
    if (target === "scrub") {
      clock.current.position = Math.min(seconds, duration - 0.001)
    } else {
      update(target, { at: Math.round(Math.max(0.1, Math.min(duration - 0.1, seconds)) * 20) / 20 })
    }
  }

  return (
    <BetaShell slug="timeline" wide>
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-5">
          <ClipFrame format={settings.format} showSafe={showSafe}>
            <LiquidCanvas
              object={baseObject}
              preset={first.preset}
              motion={{ autoRotate: 0 }}
              onEngine={setEngine}
              onReady={() => {
                lastKey.current = ""
                setReadyEpoch((epoch) => epoch + 1)
              }}
              style={{ position: "absolute", inset: 0, minHeight: 0 }}
            />
          </ClipFrame>

          <div className="rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4">
            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPlaying((value) => !value)}
                className="w-16 rounded-[var(--radius-pill)] border border-rule px-2.5 py-1 font-mono text-[10px] text-bone/75 transition-colors hover:border-rule-bright hover:text-bone"
              >
                {playing ? "Pause" : "Play"}
              </button>
              <span ref={readout} className="w-12 font-mono text-[11px] text-bone/60 tabular-nums">
                0.0s
              </span>
              <span className="font-mono text-[10px] text-bone/30">of {duration}s · drag a dot to move a moment</span>
            </div>

            <div
              ref={bar}
              className="relative h-10 cursor-pointer touch-none select-none"
              onPointerDown={(event) => {
                dragging.current = "scrub"
                setPlaying(false)
                event.currentTarget.setPointerCapture(event.pointerId)
                onBarMove(event.clientX)
              }}
              onPointerMove={(event) => onBarMove(event.clientX)}
              onPointerUp={() => (dragging.current = null)}
              onPointerCancel={() => (dragging.current = null)}
            >
              <div className="absolute inset-x-0 top-1/2 h-px bg-rule-bright" />
              {Array.from({ length: duration + 1 }, (_, second) => (
                <div key={second} className="absolute top-[70%] h-2 w-px bg-rule" style={{ left: `${(second / duration) * 100}%` }} />
              ))}
              {sorted.map((moment, index) => {
                const inside = moment.at < duration
                const half = (transition / 2 / duration) * 100
                const left = (Math.min(moment.at, duration) / duration) * 100
                return (
                  <div key={moment.id}>
                    {index > 0 && inside && (
                      <div
                        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-bone/15"
                        style={{ left: `${Math.max(0, left - half)}%`, width: `${half * 2}%` }}
                      />
                    )}
                    <button
                      type="button"
                      aria-label={`Moment at ${moment.at}s`}
                      disabled={index === 0}
                      onPointerDown={(event) => {
                        if (index === 0) return
                        event.stopPropagation()
                        dragging.current = moment.id
                        bar.current?.setPointerCapture(event.pointerId)
                      }}
                      className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
                        inside ? "border-bone bg-ink" : "border-bone/25 bg-ink"
                      } ${index === 0 ? "cursor-default" : "cursor-grab"}`}
                      style={{ left: `${left}%` }}
                    />
                  </div>
                )
              })}
              <div ref={playhead} className="pointer-events-none absolute inset-y-0 w-px bg-[#ff5a4f]" style={{ left: 0 }} />
            </div>

            <label className="mt-3 block max-w-xs">
              <span className="mb-1 flex justify-between font-mono text-[10px] text-bone/45">
                Each melt takes <span>{transition.toFixed(1)}s</span>
              </span>
              <input type="range" min={0.3} max={2} step={0.1} value={transition} onChange={(event) => setTransition(Number(event.target.value))} />
            </label>
          </div>

          <ol className="space-y-2">
            {sorted.map((moment, index) => (
              <li key={moment.id} className="grid grid-cols-[4.5rem_1fr] items-end gap-3 rounded-[var(--radius-md)] border border-rule bg-ink-2 p-3 sm:grid-cols-[4.5rem_8rem_1fr_1fr_auto]">
                <label className="block">
                  <span className="mb-1.5 block font-mono text-[11px] text-bone/55">At</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.1}
                    disabled={index === 0}
                    value={moment.at}
                    onChange={(event) => update(moment.id, { at: Math.max(0.1, Number(event.target.value) || 0) })}
                    className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-2 py-2 font-mono text-[12px] text-bone/85 tabular-nums outline-none focus:border-bone disabled:opacity-50"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block font-mono text-[11px] text-bone/55">Becomes</span>
                  <select
                    value={moment.subject.kind === "word" ? "word" : moment.subject.shape}
                    onChange={(event) =>
                      update(moment.id, {
                        subject: event.target.value === "word" ? { kind: "word", value: "LIQUID" } : { kind: "shape", shape: event.target.value as ShapeKind },
                      })
                    }
                    className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-2 py-2 font-mono text-[12px] text-bone/85 outline-none focus:border-bone"
                  >
                    <option value="word">A word</option>
                    {SHAPES.map(([shape, label]) => (
                      <option key={shape} value={shape}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {moment.subject.kind === "word" ? (
                  <label className="col-span-2 block sm:col-span-1">
                    <span className="mb-1.5 block font-mono text-[11px] text-bone/55">Word</span>
                    <input
                      type="text"
                      maxLength={12}
                      value={moment.subject.value}
                      onChange={(event) => update(moment.id, { subject: { kind: "word", value: event.target.value } })}
                      className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none focus:border-bone"
                    />
                  </label>
                ) : (
                  <div className="hidden sm:block" />
                )}
                <div className="col-span-2 sm:col-span-1">
                  <PresetSelect value={moment.preset} onChange={(preset) => update(moment.id, { preset })} />
                </div>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => remove(moment.id)}
                  className="col-span-2 justify-self-start pb-2 font-mono text-[10px] text-bone/40 hover:text-bone disabled:invisible sm:col-span-1"
                >
                  Remove
                </button>
                {moment.at >= duration && <p className="col-span-full font-mono text-[10px] text-bone/35">After the end of the clip — make the clip longer to include it.</p>}
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={moments.length >= 8}
            onClick={add}
            className="rounded-[var(--radius-pill)] border border-rule px-3 py-1.5 font-mono text-[11px] text-bone/70 transition-colors hover:border-rule-bright hover:text-bone disabled:opacity-40"
          >
            Add a moment
          </button>
        </div>

        <div className="space-y-4">
          <ClipPanel
            engine={engine}
            settings={settings}
            onChange={setSettings}
            showSafe={showSafe}
            onShowSafe={setShowSafe}
            fileName="liquidforge-timeline"
            drive={drive}
            preroll={false}
            onBusy={(value) => {
              busy.current = value
              lastKey.current = ""
            }}
          />
        </div>
      </div>
    </BetaShell>
  )
}
