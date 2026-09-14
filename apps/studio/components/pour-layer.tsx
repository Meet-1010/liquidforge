"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"

/**
 * Liquid that has left the object: drops that fall across the page and a pool
 * that gathers at the bottom of the screen.
 *
 * Drawn in 2D, over everything, as metaballs — each drop is a soft blob in a
 * low-resolution field, and wherever the field is dense enough it is liquid.
 * Two drops that touch merge, a drop that reaches the pool joins it, and the
 * pool levels out toward whichever side is lower. Coloured from the
 * colourway's own palette with a highlight from the field's slope, so it reads
 * as the same stuff the object is made of.
 */

export interface PourHandle {
  /** In-plane gravity, screen space: +x right, +y down, length 0–1. */
  setGravity: (x: number, y: number) => void
  /** Throw a drop from a point on screen, in CSS pixels, moving at (vx, vy) px/s. */
  drip: (x: number, y: number, vx: number, vy: number, size?: number) => void
  clear: () => void
}

interface Drop {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

const SCALE = 3
const MAX_DROPS = 160

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", "").slice(0, 6), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export const PourLayer = forwardRef<PourHandle, { palette: string[] }>(function PourLayer({ palette }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drops = useRef<Drop[]>([])
  const gravity = useRef({ x: 0, y: 0 })
  const pool = useRef<Float32Array>(new Float32Array(0))
  const flow = useRef<Float32Array>(new Float32Array(0))
  const colours = useRef<Array<[number, number, number]>>([])
  colours.current = (palette.length ? palette : ["#d8dce4", "#6b7280"]).map(hexToRgb)

  useImperativeHandle(ref, () => ({
    setGravity(x, y) {
      gravity.current.x = x
      gravity.current.y = y
    },
    drip(x, y, vx, vy, size = 1) {
      if (drops.current.length >= MAX_DROPS) drops.current.shift()
      drops.current.push({ x, y, vx, vy, r: (7 + Math.random() * 9) * size })
    },
    clear() {
      drops.current = []
      pool.current.fill(0)
      flow.current.fill(0)
    },
  }))

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const field = document.createElement("canvas")
    const fieldContext = field.getContext("2d", { willReadFrequently: true })!
    const context = element.getContext("2d")!
    let frame = 0
    let last = performance.now()
    let image: ImageData | null = null

    const resize = () => {
      const width = Math.ceil(window.innerWidth / SCALE)
      const height = Math.ceil(window.innerHeight / SCALE)
      element.width = field.width = width
      element.height = field.height = height
      image = context.createImageData(width, height)
      const next = new Float32Array(width)
      next.set(pool.current.subarray(0, Math.min(width, pool.current.length)))
      pool.current = next
    }
    resize()
    window.addEventListener("resize", resize)

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const width = field.width
      const height = field.height
      const g = gravity.current
      const levels = pool.current

      // -- drops -------------------------------------------------------------
      const alive: Drop[] = []
      for (const drop of drops.current) {
        drop.vx += g.x * 2400 * dt
        // A little extra pull toward the bottom of the screen, so whatever is thrown
        // sideways still ends up in the pool rather than stuck to a wall.
        drop.vy += (g.y + 0.3) * 2400 * dt
        drop.vx *= 0.995
        drop.x += drop.vx * dt
        drop.y += drop.vy * dt
        const px = drop.x / SCALE
        const floor = height - levels[Math.max(0, Math.min(width - 1, Math.round(px)))]
        if (drop.y / SCALE + drop.r / SCALE >= floor) {
          // Into the pool: its volume spreads over the columns under it.
          const span = Math.max(1, Math.round(drop.r / SCALE))
          const volume = (Math.PI * (drop.r / SCALE) ** 2) / (span * 2 + 1)
          for (let i = -span; i <= span; i++) {
            const column = Math.round(px) + i
            if (column >= 0 && column < width) levels[column] += volume * 0.5
          }
          continue
        }
        if (drop.x < drop.r) {
          drop.x = drop.r
          drop.vx *= -0.2
        } else if (drop.x > window.innerWidth - drop.r) {
          drop.x = window.innerWidth - drop.r
          drop.vx *= -0.2
        }
        if (drop.y < -200) continue
        alive.push(drop)
      }
      drops.current = alive

      // -- the pool: shallow water, so it runs to the low side and sloshes back ----
      let total = 0
      for (let i = 0; i < width; i++) total += levels[i]
      if (total > 0.5) {
        if (flow.current.length !== width + 1) flow.current = new Float32Array(width + 1)
        const velocity = flow.current
        const steps = 4
        const step = dt / steps
        for (let n = 0; n < steps; n++) {
          // Velocity on the faces between columns: pushed by the difference in
          // level and by the tilt, damped, and zero at the two walls.
          for (let i = 1; i < width; i++) {
            velocity[i] += (-(levels[i] - levels[i - 1]) * 220 + g.x * 900) * step
            velocity[i] *= 1 - 1.6 * step
            const limit = 0.45 / step
            if (velocity[i] > limit) velocity[i] = limit
            else if (velocity[i] < -limit) velocity[i] = -limit
          }
          for (let i = 1; i < width; i++) {
            const upstream = velocity[i] > 0 ? levels[i - 1] : levels[i]
            let moved = velocity[i] * upstream * step
            if (moved > 0) moved = Math.min(moved, levels[i - 1] * 0.5)
            else moved = Math.max(moved, -levels[i] * 0.5)
            levels[i - 1] -= moved
            levels[i] += moved
          }
        }
        for (let i = 0; i < width; i++) levels[i] = Math.max(0, levels[i] * (1 - 0.02 * dt) - 0.03 * dt)
      }

      if (alive.length === 0 && total <= 0.5) {
        context.clearRect(0, 0, width, height)
        return
      }

      // -- the field -----------------------------------------------------------
      fieldContext.clearRect(0, 0, width, height)
      fieldContext.globalCompositeOperation = "lighter"
      for (const drop of alive) {
        const x = drop.x / SCALE
        const y = drop.y / SCALE
        const r = (drop.r / SCALE) * 2.1
        // Stretched along its velocity, so a falling drop reads as falling.
        const speed = Math.hypot(drop.vx, drop.vy)
        const stretch = 1 + Math.min(1.2, speed / 1400)
        fieldContext.save()
        fieldContext.translate(x, y)
        fieldContext.rotate(Math.atan2(drop.vy, drop.vx))
        fieldContext.scale(stretch, 1 / Math.sqrt(stretch))
        const blob = fieldContext.createRadialGradient(0, 0, 0, 0, 0, r)
        blob.addColorStop(0, "rgba(255,255,255,1)")
        blob.addColorStop(0.45, "rgba(255,255,255,0.55)")
        blob.addColorStop(1, "rgba(255,255,255,0)")
        fieldContext.fillStyle = blob
        fieldContext.fillRect(-r, -r, r * 2, r * 2)
        fieldContext.restore()
      }
      if (total > 0.5) {
        fieldContext.filter = "blur(3px)"
        fieldContext.fillStyle = "rgba(255,255,255,1)"
        fieldContext.beginPath()
        fieldContext.moveTo(-4, height + 4)
        for (let i = 0; i < width; i++) fieldContext.lineTo(i, height - levels[i] + 1)
        fieldContext.lineTo(width + 4, height + 4)
        fieldContext.closePath()
        fieldContext.fill()
        fieldContext.filter = "none"
      }
      fieldContext.globalCompositeOperation = "source-over"

      // -- shade it --------------------------------------------------------------
      // Thickness picks the colour — the palette's darkest at a thin rim, its
      // lightest where the liquid is deep — and the slope of the field, lit from
      // the upper left, adds the highlight that makes it read as wet.
      const source = fieldContext.getImageData(0, 0, width, height).data
      const out = image!.data
      const stops = colours.current
      const lightest = stops.reduce((best, colour) => (colour[0] + colour[1] + colour[2] > best[0] + best[1] + best[2] ? colour : best), stops[0])
      const darkest = stops.reduce((best, colour) => (colour[0] + colour[1] + colour[2] < best[0] + best[1] + best[2] ? colour : best), stops[0])
      const middle = stops[Math.floor(stops.length / 2)]
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = (y * width + x) * 4
          const a = source[i + 3] / 255
          if (a < 0.4) {
            out[i + 3] = 0
            continue
          }
          const dx = (source[i + 7] - source[i - 1]) / 255
          const dy = (source[i + width * 4 + 3] - source[i - width * 4 + 3]) / 255
          // In the pool the field is solid, so depth is measured down from its
          // surface instead: a bright skin on top, darkening below like a deep reflection.
          const below = y - (height - levels[x])
          const depth = below > -1 && levels[x] > 2 ? Math.max(0, 1 - below / 22) : Math.min(1, (a - 0.4) / 0.5)
          const facing = Math.max(0, -dx * 0.6 - dy * 0.8)
          const spec = Math.min(1, facing * facing * 9)
          const rim = Math.min(1, Math.hypot(dx, dy) * 2.2)
          for (let c = 0; c < 3; c++) {
            const body = depth < 0.5 ? darkest[c] + (middle[c] - darkest[c]) * depth * 2 : middle[c] + (lightest[c] - middle[c]) * (depth - 0.5) * 2
            const shaded = body * (1 - rim * 0.45)
            out[i + c] = Math.min(255, shaded + spec * (255 - shaded))
          }
          out[i + 3] = Math.round(255 * Math.min(1, (a - 0.4) / 0.06))
        }
      }
      context.putImageData(image!, 0, 0)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-40 h-full w-full" style={{ imageRendering: "auto" }} />
})
