"use client"

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { steer, steerScore, type LiquidPreset } from "liquidforge"

/**
 * Steering a whole gallery at once.
 *
 * Two sliders, calm to loud and cool to warm, that move every card together:
 * each look is pushed along the direction, and the grid re-sorts so the looks
 * already furthest that way rise to the top. Browsing becomes playing — and the
 * answer to "show me something like these, but warmer" is one drag.
 *
 * Painting a hundred stills takes a moment, so a drag is shown at once with a
 * CSS filter that approximates the change, and the real stills are painted
 * when the slider comes to rest.
 */

export interface SteerState {
  energy: number
  warmth: number
}

export function useSteer() {
  const [live, setLive] = useState<SteerState>({ energy: 0, warmth: 0 })
  const [settled, setSettled] = useState<SteerState>({ energy: 0, warmth: 0 })
  useEffect(() => {
    const timer = setTimeout(() => setSettled(live), 320)
    return () => clearTimeout(timer)
  }, [live])

  const active = settled.energy !== 0 || settled.warmth !== 0

  /** The look to render: steered by where the sliders came to rest. */
  const look = (preset: LiquidPreset) => (active ? steer(preset, settled) : preset)

  /** The filter that fakes the part of the drag the stills have not caught up with. */
  const filter = () => {
    const e = live.energy - settled.energy
    const w = live.warmth - settled.warmth
    if (Math.abs(e) < 0.01 && Math.abs(w) < 0.01) return undefined
    const parts = [`saturate(${(1 + e * 0.7).toFixed(2)})`, `contrast(${(1 + e * 0.08).toFixed(2)})`]
    if (w > 0) parts.push(`sepia(${(w * 0.35).toFixed(2)})`, `hue-rotate(${(-w * 8).toFixed(0)}deg)`)
    if (w < 0) parts.push(`hue-rotate(${(-w * 28).toFixed(0)}deg)`)
    return parts.join(" ")
  }

  /**
   * Sort key: how far a look already sits in the direction being steered. Looks
   * furthest that way come first; with the sliders at rest, order is untouched.
   */
  const order = <T,>(items: T[], presetOf: (item: T) => LiquidPreset | undefined): T[] => {
    if (live.energy === 0 && live.warmth === 0) return items
    const scored = items.map((item, index) => {
      const preset = presetOf(item)
      const score = preset ? steerScore(preset) : { energy: 0, warmth: 0 }
      return { item, index, key: score.energy * live.energy + score.warmth * live.warmth }
    })
    return scored.sort((a, b) => b.key - a.key || a.index - b.index).map((entry) => entry.item)
  }

  return { live, setLive, settled, active, look, filter, order, reset: () => setLive({ energy: 0, warmth: 0 }) }
}

/**
 * Animate children to their new places after a re-sort, instead of jumping.
 *
 * First, Last, Invert, Play: remember where every `[data-flip]` child was
 * relative to the container, and after the re-render start each one at its old
 * offset and let it slide home. Positions are relative to the container so a
 * scroll between two sorts does not register as movement.
 */
export function useFlip(container: RefObject<HTMLElement | null>, key: string) {
  const positions = useRef(new Map<string, { x: number; y: number }>())
  useLayoutEffect(() => {
    const element = container.current
    if (!element) return
    const origin = element.getBoundingClientRect()
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    for (const child of element.querySelectorAll<HTMLElement>("[data-flip]")) {
      const id = child.dataset.flip!
      const rect = child.getBoundingClientRect()
      const next = { x: rect.left - origin.left, y: rect.top - origin.top }
      const previous = positions.current.get(id)
      if (previous && !reduce) {
        const dx = previous.x - next.x
        const dy = previous.y - next.y
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          child.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
            duration: 460,
            easing: "cubic-bezier(.2,.8,.2,1)",
          })
        }
      }
      positions.current.set(id, next)
    }
  }, [container, key])
}

export function SteerBar({ state, onChange, count }: { state: SteerState; onChange: (state: SteerState) => void; count: number }) {
  const moved = state.energy !== 0 || state.warmth !== 0
  return (
    <div className="sticky top-14 z-20 mb-8 rounded-[var(--radius-lg)] border border-rule bg-ink-2/90 px-4 py-3 backdrop-blur">
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
        <Axis
          left="Calm"
          right="Loud"
          value={state.energy}
          onChange={(energy) => onChange({ ...state, energy })}
        />
        <Axis
          left="Cool"
          right="Warm"
          value={state.warmth}
          onChange={(warmth) => onChange({ ...state, warmth })}
        />
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <p className="font-mono text-[10px] text-bone/35 tabular-nums">
            {moved ? `Steering all ${count}` : `Drag to steer all ${count}`}
          </p>
          <button
            type="button"
            disabled={!moved}
            onClick={() => onChange({ energy: 0, warmth: 0 })}
            className="rounded-[var(--radius-pill)] border border-rule px-2.5 py-1 font-mono text-[10px] text-bone/70 transition-colors hover:border-rule-bright hover:text-bone disabled:opacity-30"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

function Axis({ left, right, value, onChange }: { left: string; right: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="flex items-center gap-2.5">
      <span className="w-9 shrink-0 text-right font-mono text-[10px] text-bone/45">{left}</span>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.01}
        value={value}
        aria-label={`${left} to ${right}`}
        onChange={(event) => onChange(Number(event.target.value))}
        onDoubleClick={() => onChange(0)}
        className="min-w-0 flex-1"
      />
      <span className="w-9 shrink-0 font-mono text-[10px] text-bone/45">{right}</span>
    </label>
  )
}
