"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { LiquidCanvas, resolvePreset, useReducedMotion, type LiquidEngine, type ObjectSource } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { PresetSelect } from "@/components/look-picker"
import { PourLayer, type PourHandle } from "@/components/pour-layer"

/**
 * The phone as a glass.
 *
 * Which way is down comes from the device's orientation: the gravity vector,
 * turned into the screen's own frame, drives the engine's slosh spring, so the
 * surface runs to the low side and overshoots when you stop. Tip it past about
 * thirty degrees and liquid leaves the object from its lowest edge, falls
 * across the page and pools at the bottom of the screen. On a computer, drag.
 */

const THRESHOLD = 0.5

/** Gravity in the screen's frame (+x right, +y down, +z out of the screen) from a device orientation. */
function gravityFrom(beta: number, gamma: number, screenAngle: number): [number, number, number] {
  const b = (beta * Math.PI) / 180
  const g = (gamma * Math.PI) / 180
  // Down, in the device's frame with +y toward the top of the screen.
  const x = Math.cos(b) * Math.sin(g)
  const up = -Math.sin(b)
  const z = -Math.cos(b) * Math.cos(g)
  // Turned with the screen when the phone is on its side.
  const a = (-screenAngle * Math.PI) / 180
  const sx = x * Math.cos(a) - up * Math.sin(a)
  const sy = x * Math.sin(a) + up * Math.cos(a)
  return [sx, -sy, z]
}

export default function PourPage() {
  const [preset, setPreset] = useState("mercury-3")
  const [shape, setShape] = useState<"sphere" | "word">("sphere")
  const [amount, setAmount] = useState(0.16)
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [source, setSource] = useState<"drag" | "device">("drag")
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [hasOrientation, setHasOrientation] = useState(false)
  const reducedMotion = useReducedMotion()
  const hero = useRef<HTMLDivElement>(null)
  const pour = useRef<PourHandle>(null)
  const wanted = useRef<[number, number, number]>([0, 0, -1])
  const drag = useRef<{ x: number; y: number } | null>(null)

  const palette = useMemo(() => resolvePreset(preset).palette, [preset])
  const object = useMemo<ObjectSource>(() => (shape === "sphere" ? { type: "shape", shape: "sphere" } : { type: "text", value: "POUR", depth: 0.6, bevel: 0.04 }), [shape])

  useEffect(() => setHasOrientation(typeof window !== "undefined" && "DeviceOrientationEvent" in window), [])

  // -- tilt from the phone ---------------------------------------------------------
  useEffect(() => {
    if (source !== "device") return
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return
      wanted.current = gravityFrom(event.beta, event.gamma, screen.orientation?.angle ?? 0)
    }
    window.addEventListener("deviceorientation", onOrientation)
    return () => window.removeEventListener("deviceorientation", onOrientation)
  }, [source])

  const useDevice = async () => {
    setDeviceError(null)
    const Orientation = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> }
    try {
      // iOS asks first, and only in answer to a tap.
      if (typeof Orientation.requestPermission === "function" && (await Orientation.requestPermission()) !== "granted") {
        setDeviceError("Motion access was declined. It can be allowed again in Safari's settings for this site.")
        return
      }
      setSource("device")
    } catch {
      setDeviceError("This device doesn't report its tilt.")
    }
  }

  // -- tilt from the keyboard ------------------------------------------------------
  useEffect(() => {
    const held = new Set<string>()
    const apply = () => {
      if (source !== "drag" || drag.current) return
      const x = (held.has("ArrowRight") ? 1 : 0) - (held.has("ArrowLeft") ? 1 : 0)
      const y = (held.has("ArrowDown") ? 1 : 0) - (held.has("ArrowUp") ? 1 : 0)
      const length = Math.hypot(x, y) || 1
      wanted.current = x || y ? [(x / length) * 0.85, (y / length) * 0.85, -0.5] : [0, 0, -1]
    }
    const down = (event: KeyboardEvent) => {
      if (!event.key.startsWith("Arrow") || !hero.current?.matches(":focus-within, :hover")) return
      event.preventDefault()
      held.add(event.key)
      apply()
    }
    const up = (event: KeyboardEvent) => {
      held.delete(event.key)
      apply()
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [source])

  // -- every frame: slosh, and drips past the threshold --------------------------
  useEffect(() => {
    if (!engine) return
    let frame = 0
    let last = performance.now()
    let owed = 0
    const current: [number, number, number] = [0, 0, -1]
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const target = wanted.current
      for (let i = 0; i < 3; i++) current[i] += (target[i] - current[i]) * Math.min(1, dt * 10)
      const [x, y, z] = current
      engine.setGravity(x, -y, z, amount)
      pour.current?.setGravity(x, y)

      const tilt = Math.hypot(x, y)
      const rect = hero.current?.getBoundingClientRect()
      if (reducedMotion || !rect || tilt < THRESHOLD || rect.bottom < 0 || rect.top > window.innerHeight) return
      owed += (tilt - THRESHOLD) * 70 * dt
      const dirX = x / tilt
      const dirY = y / tilt
      const radius = Math.min(rect.width, rect.height) * 0.26
      while (owed >= 1) {
        owed -= 1
        const spread = (Math.random() - 0.5) * 0.9
        const ex = dirX * Math.cos(spread) - dirY * Math.sin(spread)
        const ey = dirX * Math.sin(spread) + dirY * Math.cos(spread)
        pour.current?.drip(rect.left + rect.width / 2 + ex * radius, rect.top + rect.height / 2 + ey * radius, ex * 180, ey * 180, 0.7 + tilt * 0.5)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      engine.setGravity(0, 0, -1, 0)
    }
  }, [engine, amount, reducedMotion])

  return (
    <BetaShell slug="pour" wide>
      <PourLayer ref={pour} palette={palette} />
      <div
        ref={hero}
        tabIndex={0}
        aria-label="The liquid. Drag, or use the arrow keys, to tilt it."
        className="relative h-[min(68vh,38rem)] cursor-grab touch-none overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink outline-none focus-visible:border-bone active:cursor-grabbing"
        onPointerDown={(event) => {
          if (source !== "drag") return
          drag.current = { x: event.clientX, y: event.clientY }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          const x = Math.max(-1, Math.min(1, (event.clientX - drag.current.x) / 220))
          const y = Math.max(-1, Math.min(1, (event.clientY - drag.current.y) / 220))
          const planar = Math.min(0.97, Math.hypot(x, y))
          const scale = Math.hypot(x, y) > 0 ? planar / Math.hypot(x, y) : 0
          wanted.current = [x * scale, y * scale, -Math.sqrt(1 - planar * planar)]
        }}
        onPointerUp={() => {
          drag.current = null
          if (source === "drag") wanted.current = [0, 0, -1]
        }}
      >
        <LiquidCanvas object={object} preset={preset} onEngine={setEngine} motion={{ draggable: false }} style={{ position: "absolute", inset: 0, minHeight: 0 }} />
        <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center font-mono text-[11px] text-bone/40">
          {source === "device" ? "Tilt your phone. Further than you think." : "Drag to tilt it — push past a third of the way and it pours."}
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end">
        <div>
          <p className="mb-1.5 font-mono text-[11px] text-bone/55">Object</p>
          <div className="flex gap-1.5">
            {(["sphere", "word"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setShape(value)}
                className={`rounded-[var(--radius-pill)] border px-2.5 py-1 font-mono text-[10px] ${shape === value ? "border-bone bg-bone text-ink" : "border-rule text-bone/60 hover:text-bone"}`}
              >
                {value === "sphere" ? "A drop" : "POUR"}
              </button>
            ))}
          </div>
        </div>
        <PresetSelect value={preset} onChange={setPreset} />
        <label className="block">
          <span className="mb-1 flex justify-between font-mono text-[11px] text-bone/55">
            Slosh <span className="text-bone/30 tabular-nums">{amount.toFixed(2)}</span>
          </span>
          <input type="range" min={0.04} max={0.3} step={0.01} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
        </label>
        <div className="flex flex-wrap gap-2">
          {hasOrientation && source === "drag" && (
            <button type="button" onClick={useDevice} className="rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim">
              Use my phone&apos;s tilt
            </button>
          )}
          <button type="button" onClick={() => pour.current?.clear()} className="rounded-[var(--radius-pill)] border border-rule px-4 py-2 font-mono text-[11px] text-bone/70 hover:text-bone">
            Mop up
          </button>
        </div>
      </div>
      {deviceError && <p role="alert" className="mt-3 font-mono text-[11px] text-[#ff8a7a]">{deviceError}</p>}
    </BetaShell>
  )
}
