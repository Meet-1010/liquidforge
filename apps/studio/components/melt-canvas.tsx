"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { LiquidCanvas, applyCheckpointState, backgroundColor, prepareSequence, resolvePreset, useReducedMotion, type LiquidEngine, type ObjectSource } from "liquidforge"

export interface MeltLook {
  object: ObjectSource
  preset: string
}

const same = (a: MeltLook, b: MeltLook) => a.preset === b.preset && JSON.stringify(a.object) === JSON.stringify(b.object)
const side = (look: MeltLook) => ({ object: look.object, objectIndex: -1, preset: look.preset })

function groundOf(look: MeltLook): [number, number, number] {
  const hex = backgroundColor(resolvePreset(look.preset)) ?? "#050506"
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

/** The ground between two looks, mixed in sRGB exactly as the engine mixes the canvas's. */
function groundBetween(from: MeltLook, to: MeltLook | null, t: number): { background: string; dark: boolean } {
  const a = groundOf(from)
  const b = to ? groundOf(to) : a
  const rgb = a.map((value, i) => Math.round(value + (b[i] - value) * t))
  return { background: `rgb(${rgb.join(" ")})`, dark: rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 128 }
}

/**
 * A canvas that melts instead of cutting.
 *
 * Give it every look it may be asked for up front and the one to show now.
 * When `look` changes, the object morphs into the new one over `duration`
 * seconds — shape, colourway and ground together — using the same transition
 * a scroll checkpoint uses, run on a clock. Kept mounted across route changes
 * (in a layout), that is a page transition.
 */
export function MeltCanvas({
  looks,
  look,
  duration = 1.4,
  style,
  onEngine,
  onGround,
}: {
  looks: MeltLook[]
  look: MeltLook
  duration?: number
  style?: CSSProperties
  onEngine?: (engine: LiquidEngine | null) => void
  /** Every frame, the ground the canvas is painted on — for the page around it to match, without a re-render. */
  onGround?: (ground: { background: string; dark: boolean }) => void
}) {
  // The canvas is built once, around whichever look came first; every other
  // look is a prepared form it melts to.
  const [base] = useState(look)
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [readyEpoch, setReadyEpoch] = useState(0)
  const reducedMotion = useReducedMotion()
  const state = useRef<{ from: MeltLook; to: MeltLook | null; startedAt: number; next: MeltLook | null }>({ from: look, to: null, startedAt: 0, next: null })
  const lastKey = useRef("")
  const durationRef = useRef(duration)
  durationRef.current = duration
  const onGroundRef = useRef(onGround)
  onGroundRef.current = onGround

  useEffect(() => {
    if (!engine || readyEpoch === 0) return
    let cancelled = false
    // Every pair in both directions, so any click order finds its morph ready.
    const walk: MeltLook[] = []
    for (let i = 0; i < looks.length; i++) for (let j = i + 1; j < looks.length; j++) walk.push(looks[i], looks[j])
    void prepareSequence(engine, base, walk, { isCancelled: () => cancelled }).then(() => {
      if (!cancelled) lastKey.current = ""
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, readyEpoch, JSON.stringify(looks)])

  // A new look starts a melt, or — while one is running — waits for it to land.
  useEffect(() => {
    const s = state.current
    const current = s.to ?? s.from
    if (same(current, look)) {
      s.next = null
      return
    }
    if (s.to) {
      // Asked to go back where it came from: run the same melt in reverse from where it is.
      if (same(s.from, look)) {
        const elapsed = (performance.now() - s.startedAt) / (durationRef.current * 1000)
        s.from = s.to
        s.to = look
        s.startedAt = performance.now() - Math.max(0, 1 - Math.min(1, elapsed)) * durationRef.current * 1000
        s.next = null
      } else {
        s.next = look
      }
      return
    }
    s.to = look
    s.startedAt = performance.now()
  }, [look])

  useEffect(() => {
    if (!engine) return
    let frame = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      const s = state.current
      if (!s.to) {
        lastKey.current = applyCheckpointState(engine, { from: side(s.from), to: null, t: 0, mutation: 0 }, base, { lastKey: lastKey.current })
        onGroundRef.current?.(groundBetween(s.from, null, 0))
        return
      }
      const length = reducedMotion ? 0.001 : durationRef.current * 1000
      const k = Math.min(1, (now - s.startedAt) / length)
      if (k >= 1) {
        s.from = s.to
        s.to = s.next
        s.next = null
        // A page clicked mid-melt follows straight on from where this one landed.
        s.startedAt = now
        return
      }
      const t = k * k * (3 - 2 * k)
      const changesShape = JSON.stringify(s.from.object) !== JSON.stringify(s.to.object)
      const mutation = Math.sin(Math.PI * t) * (changesShape ? 0.45 : 0.2)
      lastKey.current = applyCheckpointState(engine, { from: side(s.from), to: side(s.to), t, mutation }, base, { lastKey: lastKey.current, reducedMotion })
      onGroundRef.current?.(groundBetween(s.from, s.to, t))
    }
    lastKey.current = ""
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [engine, base, reducedMotion])

  return (
    <LiquidCanvas
      object={base.object}
      preset={base.preset}
      onEngine={(value) => {
        setEngine(value)
        onEngine?.(value)
      }}
      onReady={() => {
        lastKey.current = ""
        setReadyEpoch((epoch) => epoch + 1)
      }}
      style={style}
    />
  )
}
