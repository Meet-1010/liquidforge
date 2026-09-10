"use client"

import { useEffect, useRef, useState } from "react"
import type { Cursor } from "./hub"

/**
 * Everyone else's cursor, and a way to send yours.
 *
 * Positions are normalised against the element rather than the viewport, so two
 * people on very different screens are pointing at the same part of the object
 * rather than the same pixel coordinate.
 */

/** Colours pulled from the collections, so a room looks like the product. */
const COLOURS = [
  "#7fb2ff",
  "#ff6ec7",
  "#d8ff5c",
  "#ffb98a",
  "#7fe3d8",
  "#c9a8ff",
  "#ffd166",
  "#f06ba8",
]

const NAMES = [
  "Cobalt", "Copper", "Acid", "Teal", "Rose", "Gold", "Ink", "Pearl",
  "Ember", "Petrol", "Lagoon", "Orchid", "Quartz", "Basalt", "Iris",
]

/** Enough to look live, few enough not to flood a phone on 4G. */
const SEND_HZ = 20

function identity() {
  const fallback = {
    id: Math.random().toString(36).slice(2, 10),
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
  }
  try {
    const saved = sessionStorage.getItem("liquidforge:me")
    if (saved) return { ...fallback, ...(JSON.parse(saved) as typeof fallback) }
    sessionStorage.setItem("liquidforge:me", JSON.stringify(fallback))
  } catch {
    // Private windows throw; a per-load identity is fine.
  }
  return fallback
}

export interface Presence {
  others: Cursor[]
  me: { id: string; name: string; colour: string } | null
}

export function usePresence(room: string, target: React.RefObject<HTMLElement | null>): Presence {
  const [others, setOthers] = useState<Cursor[]>([])
  const [me, setMe] = useState<Presence["me"]>(null)
  const latest = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const self = identity()
    setMe(self)

    const source = new EventSource(`/api/presence?room=${encodeURIComponent(room)}`)
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type: string; cursors?: Cursor[] }
        if (data.type !== "cursors" || !data.cursors) return
        // Your own cursor is the real one the OS is drawing; a second copy of
        // it lagging 60ms behind is only ever distracting.
        setOthers(data.cursors.filter((cursor) => cursor.id !== self.id))
      } catch {
        // A partial frame; the next tick carries the same state.
      }
    }

    const onMove = (event: PointerEvent) => {
      const element = target.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      latest.current = {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      }
    }

    // Throttled to a fixed rate rather than sent per event: a trackpad fires
    // faster than anyone can see, and every one of those is a request.
    const timer = setInterval(() => {
      const point = latest.current
      if (!point) return
      latest.current = null
      void fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ room, id: self.id, name: self.name, colour: self.colour, ...point }),
      }).catch(() => {})
    }, 1000 / SEND_HZ)

    const leave = () => {
      // keepalive, because the page is going away as this is sent.
      void fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ room, id: self.id, leaving: true }),
      }).catch(() => {})
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pagehide", leave)

    return () => {
      clearInterval(timer)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pagehide", leave)
      source.close()
      leave()
    }
  }, [room, target])

  return { others, me }
}

/**
 * Turn other people's cursors into ripples on the surface.
 *
 * Emitted on distance travelled rather than on every tick, for the same reason
 * the engine's own trail is: the buffer holds a dozen entries, and eight people
 * moving at 20Hz would flush it several times a second and leave nothing on
 * screen long enough to see.
 */
export function useRemoteRipples(
  cursors: Cursor[],
  engine: { rippleAt: (x: number, y: number, amplitude?: number) => void } | null,
): void {
  const last = useRef(new Map<string, { x: number; y: number }>())

  useEffect(() => {
    if (!engine) return
    for (const cursor of cursors) {
      const previous = last.current.get(cursor.id)
      const moved = previous
        ? Math.hypot(cursor.x - previous.x, cursor.y - previous.y)
        : Number.POSITIVE_INFINITY

      if (moved < 0.045) continue
      last.current.set(cursor.id, { x: cursor.x, y: cursor.y })
      if (!previous) continue

      // Normalised element space to normalised device coordinates, which is
      // what the engine's pointer works in.
      engine.rippleAt(cursor.x * 2 - 1, -(cursor.y * 2 - 1), Math.min(1.8, 0.3 + moved * 14))
    }

    // Forget anyone who left, so a returning id starts fresh rather than
    // firing one enormous ripple across the gap.
    const live = new Set(cursors.map((cursor) => cursor.id))
    for (const id of last.current.keys()) if (!live.has(id)) last.current.delete(id)
  }, [cursors, engine])
}
