"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { BACKGROUND_TONES, LiquidCanvas, downloadBlob, mutatePreset, resolvePreset } from "liquidforge"
import type { LiquidEngine } from "liquidforge"
import { PRESETS } from "liquidforge"
import { configFromPreset, decodeState, encodeState, type LiquidConfig } from "liquidforge/codegen"
import type { Quality } from "liquidforge"
import { ExportModal } from "@/components/export-modal"
import { FrontDoor } from "@/components/front-door"
import { MaterialPanel } from "@/components/material-panel"
import { ObjectPanel } from "@/components/object-panel"
import { SiteNav } from "@/components/site-nav"
import { Button, Collapsible, ColorField, Segmented, Slider, Toggle } from "@/components/ui"

export default function StudioPage() {
  return (
    <Suspense fallback={null}>
      <Studio />
    </Suspense>
  )
}

function Studio() {
  const params = useSearchParams()
  const [config, setConfig] = useState<LiquidConfig>(() => configFromPreset())
  const [exporting, setExporting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSize, setRecordSize] = useState<"1080" | "1440" | "2160">("2160")
  // Once you have answered the question, or skipped it, it stops asking.
  const [doorDone, setDoorDone] = useState(false)
  const engineRef = useRef<LiquidEngine | null>(null)

  /*
   * Undo, which the Studio has needed since the first slider.
   *
   * The whole interaction is dragging things, and until now there was no way
   * back from a drag that went wrong except rebuilding the colourway by hand.
   * Every edit already flows through one `LiquidConfig`, so the history is a
   * stack of those and nothing more.
   */
  const history = useRef<LiquidConfig[]>([])
  const future = useRef<LiquidConfig[]>([])
  const [depth, setDepth] = useState({ back: 0, forward: 0 })

  const commit = useCallback((next: LiquidConfig | ((current: LiquidConfig) => LiquidConfig)) => {
    setConfig((current) => {
      const resolved = typeof next === "function" ? next(current) : next
      // Dragging a slider fires this on every pixel; collapsing identical
      // states keeps one drag from filling the stack with itself.
      if (JSON.stringify(resolved) === JSON.stringify(current)) return current
      history.current = [...history.current, current].slice(-60)
      future.current = []
      setDepth({ back: history.current.length, forward: 0 })
      return resolved
    })
  }, [])

  const undo = useCallback(() => {
    const previous = history.current.pop()
    if (!previous) return
    setConfig((current) => {
      future.current = [current, ...future.current].slice(0, 60)
      return previous
    })
    setDepth({ back: history.current.length, forward: future.current.length + 1 })
  }, [])

  const redo = useCallback(() => {
    const next = future.current.shift()
    if (!next) return
    setConfig((current) => {
      history.current = [...history.current, current]
      return next
    })
    setDepth({ back: history.current.length + 1, forward: future.current.length })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (!meta || event.key.toLowerCase() !== "z") return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo])
  // Bumped to snap the camera back; double clicking the canvas does the same.
  const [resetToken, setResetToken] = useState(0)

  // A shared link carries the whole editor state, so opening one has to land on
  // exactly the look it was made from rather than on the default.
  useEffect(() => {
    const encoded = params.get("c")
    if (!encoded) return
    const decoded = decodeState(encoded)
    if (decoded) setConfig(decoded)
  }, [params])

  const preset = resolvePreset(config.preset, {
    family: config.family,
    palette: config.palette,
    surface: config.surface,
    shading: config.shading,
    background: config.background,
  })

  return (
    <div className="flex h-screen flex-col">
      <SiteNav />

      <div className="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
        {/*
          The rail is now a column: everything scrolls except the one thing
          people came for. "Copy the component" used to sit at the end of a
          1,950px scroll in a 900px window — the most important control in the
          product and the hardest one to reach.
        */}
        <aside className="flex w-full shrink-0 flex-col border-rule lg:w-[340px] lg:border-r">
          <div className="min-h-0 flex-1 overflow-y-auto">
          <FrontDoor
            dismissed={doorDone}
            onDismiss={() => setDoorDone(true)}
            onPick={(next) => {
              commit(next)
              setDoorDone(true)
            }}
          />

          <ObjectPanel
            object={config.object}
            onChange={(object) => commit({ ...config, object })}
            onBrand={({ object, presetId, palette }) => {
              const picked = PRESETS[presetId]
              commit({
                ...configFromPreset(presetId, object),
                // The recommender chose the family; the logo chose the colours.
                palette: palette.length >= 2 ? palette : picked.palette,
              })
            }}
          />

          <MaterialPanel config={config} onChange={commit} />

          <Collapsible title="Scene" hint="motion, quality, layout">
            <Segmented
              label="Quality"
              value={config.quality}
              options={[
                { value: "auto" as Quality, label: "Auto" },
                { value: "high" as Quality, label: "High" },
                { value: "balanced" as Quality, label: "Mid" },
                { value: "low" as Quality, label: "Low" },
              ]}
              onChange={(quality) => commit({ ...config, quality })}
            />
            <p className="font-mono text-[10px] leading-relaxed text-bone/30">
              Auto measures frame times and walks the pixel ratio to suit the machine. The fixed
              tiers are for when you would rather know exactly what a visitor gets.
            </p>
            <Slider
              label="Auto-rotate"
              min={0}
              max={1.2}
              step={0.02}
              value={config.motion.autoRotate ?? 0}
              onChange={(autoRotate) =>
                commit({ ...config, motion: { ...config.motion, autoRotate } })
              }
            />
            <Toggle
              label="Drag to rotate"
              checked={config.motion.draggable ?? true}
              onChange={(draggable) =>
                commit({ ...config, motion: { ...config.motion, draggable } })
              }
            />
            {/* The ground is part of the look, not a fixed property of the
                family: a lacquer that reads on studio grey may be exactly what
                you want on your own near-white page. */}
            <Segmented
              label="Background"
              value={config.transparent ? "transparent" : config.background}
              options={[
                { value: "dark" as const, label: "Dark" },
                { value: "mid" as const, label: "Mid" },
                { value: "light" as const, label: "Light" },
                { value: "transparent" as const, label: "None" },
              ]}
              onChange={(background) =>
                commit({
                  ...config,
                  background: background === "transparent" ? config.background : background,
                  transparent: background === "transparent",
                  backgroundColor: undefined,
                })
              }
            />
            {!config.transparent && (
              <ColorField
                label="Custom ground"
                value={config.backgroundColor ?? BACKGROUND_TONES[config.background] ?? "#050506"}
                onChange={(backgroundColor) => commit({ ...config, backgroundColor })}
              />
            )}
            <Segmented
              label="Layout"
              value={config.layout}
              options={[
                { value: "overlay" as const, label: "Overlay" },
                { value: "split" as const, label: "Split" },
              ]}
              onChange={(layout) => commit({ ...config, layout })}
            />
            <Toggle
              label="Blend the headline"
              checked={config.blend}
              onChange={(blend) => commit({ ...config, blend })}
            />
          </Collapsible>

          {/* The loop is the asset people actually put on a timeline — the
              still cannot carry the one thing that makes this worth using — but
              it is not what most visits are for, so it sits a click away rather
              than beside the button everyone needs. */}
          <Collapsible title="Record a loop" hint="video, for a timeline">
            <Segmented
              label="Loop resolution"
              value={recordSize}
              options={[
                { value: "1080" as const, label: "1080p" },
                { value: "1440" as const, label: "1440p" },
                { value: "2160" as const, label: "4K" },
              ]}
              onChange={setRecordSize}
            />
            <Button
              disabled={recording}
              onClick={async () => {
                const engine = engineRef.current
                if (!engine) return
                setRecording(true)
                try {
                  // Recorded at this size regardless of how big the preview is
                  // on screen — the drawing buffer is resized for the take.
                  const height = Number(recordSize)
                  const blob = await engine.recordLoop({
                    seconds: 4,
                    width: Math.round((height * 16) / 9),
                    height,
                  })
                  downloadBlob(blob, `liquidforge-${config.preset}-${recordSize}p.webm`)
                } finally {
                  setRecording(false)
                }
              }}
            >
              {recording ? "Recording 4s…" : `Record a ${recordSize === "2160" ? "4K" : recordSize + "p"} loop`}
            </Button>
            <p className="font-mono text-[10px] leading-relaxed text-bone/30">
              Four seconds, looping seamlessly, at about 0.12 bits per pixel. 4K is heavy — if it
              drops frames on this machine, take it down a step.
            </p>
          </Collapsible>
          </div>

          <div className="shrink-0 border-t border-rule bg-ink/95 px-4 py-3 backdrop-blur">
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => setExporting(true)}>
                Copy the component
              </Button>
              <a
                href={`/post?c=${encodeState(config)}`}
                className="inline-flex items-center rounded-[var(--radius-pill)] border border-rule bg-ink-2 px-3.5 py-2 font-mono text-[11px] text-bone/75 transition-colors hover:border-rule-bright hover:text-bone"
              >
                Post it
              </a>
            </div>
          </div>
        </aside>

        <main className="relative min-h-[320px] flex-1">
          <LiquidCanvas
            object={config.object}
            preset={preset}
            quality={config.quality}
            motion={config.motion}
            // The Studio is an editor, so it takes the wheel. A hero does not:
            // a page that stops scrolling under the pointer reads as broken.
            controls={{ zoom: true, zoomRange: [0.3, 4], resetToken }}
            transparent={config.transparent}
            background={config.backgroundColor}
            onEngine={(engine) => {
              engineRef.current = engine
            }}
            style={{ height: "100%", minHeight: 0 }}
          />

          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 p-3">
            <p className="font-mono text-[10px] text-bone/25">
              drag to turn · scroll to zoom · ⌘Z to undo
            </p>
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={depth.back === 0}
                className="rounded-[var(--radius-pill)] border border-rule bg-ink/70 px-3 py-1.5 font-mono text-[10px] text-bone/60 backdrop-blur-sm transition-colors hover:border-rule-bright hover:text-bone disabled:opacity-30"
              >
                Undo
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={depth.forward === 0}
                className="rounded-[var(--radius-pill)] border border-rule bg-ink/70 px-3 py-1.5 font-mono text-[10px] text-bone/60 backdrop-blur-sm transition-colors hover:border-rule-bright hover:text-bone disabled:opacity-30"
              >
                Redo
              </button>
              {/* Mutate, not replace: a shuffle that throws away what you had
                  is a shuffle nobody presses twice. */}
              <button
                type="button"
                onClick={() => {
                  const next = mutatePreset(preset, { amount: 0.4 })
                  commit({
                    ...config,
                    palette: next.palette,
                    surface: next.surface,
                    shading: next.shading,
                  })
                }}
                className="rounded-[var(--radius-pill)] border border-rule bg-ink/70 px-3 py-1.5 font-mono text-[10px] text-bone/60 backdrop-blur-sm transition-colors hover:border-rule-bright hover:text-bone"
              >
                Shuffle
              </button>
            </div>
            <button
              type="button"
              onClick={() => setResetToken((token) => token + 1)}
              className="pointer-events-auto rounded-[var(--radius-pill)] border border-rule bg-ink/70 px-3 py-1.5 font-mono text-[10px] text-bone/60 backdrop-blur-sm transition-colors hover:border-rule-bright hover:text-bone"
            >
              Reset view
            </button>
          </div>
        </main>
      </div>

      {exporting && <ExportModal config={config} onClose={() => setExporting(false)} />}
    </div>
  )
}
