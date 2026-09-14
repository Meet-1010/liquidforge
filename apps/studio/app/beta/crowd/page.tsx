"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { LiquidCanvas, type LiquidEngine } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { PresetSelect } from "@/components/look-picker"

/**
 * One surface, everyone on the page disturbing it.
 *
 * Browsers find each other through public Nostr relays and then talk
 * directly, so there is no server holding the crowd — nothing to pay for, and
 * nothing that stops working when traffic spreads across serverless
 * instances. Each person sends where their pointer is, twenty times a second,
 * and every other browser drops a ring there with `rippleAt`. How much the
 * liquid moves is how many people are here.
 */

type Touch = [x: number, y: number, pressed: 0 | 1]

interface Remote {
  x: number
  y: number
  pressed: boolean
  seen: number
  hue: number
  /** A position has arrived that has not become a ring yet. */
  fresh: boolean
}

const APP_ID = "liquidforge-crowd-v1"
const SEND_EVERY_MS = 50
/** Rings per frame across the whole crowd, so a thousand cursors cannot bury the surface. */
const RIPPLE_BUDGET = 10

function hueFor(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return hash % 360
}

export default function CrowdPage() {
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [preset, setPreset] = useState("mercury-1")
  const [joined, setJoined] = useState(false)
  const [status, setStatus] = useState<"idle" | "joining" | "live">("idle")
  const [count, setCount] = useState(1)
  const [room, setRoom] = useState("launch")
  const host = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const remotes = useRef(new Map<string, Remote>())
  const send = useRef<((touch: Touch) => void) | null>(null)
  const local = useRef<{ x: number; y: number; pressed: boolean; dirty: boolean; lastSent: number }>({ x: 0, y: 0, pressed: false, dirty: false, lastSent: 0 })

  useEffect(() => {
    const named = new URLSearchParams(window.location.search).get("room")
    if (named) setRoom(named.replace(/[^\w-]/g, "").slice(0, 40) || "launch")
  }, [])

  // -- the room ----------------------------------------------------------------
  useEffect(() => {
    if (!joined) return
    let cancelled = false
    let leave: (() => void) | null = null
    setStatus("joining")

    void import("trystero").then(({ joinRoom }) => {
      if (cancelled) return
      const joinedRoom = joinRoom({ appId: APP_ID }, room)
      const touch = joinedRoom.makeAction<Touch>("touch")
      const refresh = () => setCount(Object.keys(joinedRoom.getPeers()).length + 1)

      joinedRoom.onPeerJoin = (peerId) => {
        remotes.current.set(peerId, { x: 0, y: 0, pressed: false, seen: 0, hue: hueFor(peerId), fresh: false })
        refresh()
        setStatus("live")
      }
      joinedRoom.onPeerLeave = (peerId) => {
        remotes.current.delete(peerId)
        refresh()
      }
      touch.onMessage = (data, { peerId }) => {
        if (!Array.isArray(data) || data.length !== 3) return
        const [x, y, pressed] = data
        if (typeof x !== "number" || typeof y !== "number" || Math.abs(x) > 1.5 || Math.abs(y) > 1.5) return
        const remote = remotes.current.get(peerId) ?? { x, y, pressed: false, seen: 0, hue: hueFor(peerId), fresh: false }
        Object.assign(remote, { x, y, pressed: pressed === 1, seen: performance.now(), fresh: true })
        remotes.current.set(peerId, remote)
      }
      send.current = (value) => void touch.send(value).catch(() => {})
      setStatus("live")
      leave = () => void joinedRoom.leave()
    })

    return () => {
      cancelled = true
      send.current = null
      leave?.()
      remotes.current.clear()
      setCount(1)
      setStatus("idle")
    }
  }, [joined, room])

  // -- every frame: rings for the crowd, dots for their cursors ------------------
  useEffect(() => {
    if (!engine) return
    let frame = 0
    let turn = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)

      const mine = local.current
      if (send.current && mine.dirty && now - mine.lastSent > SEND_EVERY_MS) {
        send.current([Math.round(mine.x * 1000) / 1000, Math.round(mine.y * 1000) / 1000, mine.pressed ? 1 : 0])
        mine.dirty = false
        mine.lastSent = now
      }

      const active = [...remotes.current.values()].filter((remote) => now - remote.seen < 2500)
      // One ring per position received, and round-robin through the crowd so
      // every cursor gets its turn at the budget when there are more than fit.
      const fresh = active.filter((remote) => remote.fresh)
      const share = Math.min(fresh.length, RIPPLE_BUDGET)
      for (let i = 0; i < share; i++) {
        const remote = fresh[(turn + i) % fresh.length]
        engine.rippleAt(remote.x, remote.y, remote.pressed ? 1.6 : 0.7)
        remote.fresh = false
      }
      turn = (turn + share) % Math.max(1, fresh.length)

      const dots = layer.current
      if (dots) {
        const wanted = active.slice(0, 60)
        while (dots.children.length < wanted.length) {
          const dot = document.createElement("span")
          dot.className = "absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-black/30 transition-opacity"
          dots.appendChild(dot)
        }
        ;[...dots.children].forEach((child, i) => {
          const dot = child as HTMLSpanElement
          const remote = wanted[i]
          if (!remote) {
            dot.style.opacity = "0"
            return
          }
          dot.style.opacity = String(Math.max(0, 1 - (now - remote.seen) / 2500))
          dot.style.left = `${((remote.x + 1) / 2) * 100}%`
          dot.style.top = `${((1 - remote.y) / 2) * 100}%`
          dot.style.background = `hsl(${remote.hue} 90% 65%)`
          dot.style.transform = `translate(-50%, -50%) scale(${remote.pressed ? 1.8 : 1})`
        })
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [engine])

  const track = useCallback((event: React.PointerEvent<HTMLDivElement>, pressed?: boolean) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const mine = local.current
    mine.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mine.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    if (pressed !== undefined) mine.pressed = pressed
    mine.dirty = true
  }, [])

  const shareLink = typeof window === "undefined" ? "" : `${window.location.origin}/beta/crowd?room=${room}`
  const [copied, setCopied] = useState(false)

  return (
    <BetaShell slug="crowd" wide>
      <div
        ref={host}
        className="relative h-[min(70vh,40rem)] overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink"
        onPointerMove={(event) => track(event)}
        onPointerDown={(event) => track(event, true)}
        onPointerUp={(event) => track(event, false)}
        onPointerLeave={(event) => track(event, false)}
      >
        <LiquidCanvas
          object={{ type: "shape", shape: "sphere" }}
          preset={preset}
          onEngine={setEngine}
          style={{ position: "absolute", inset: 0, minHeight: 0 }}
        />
        <div ref={layer} aria-hidden className="pointer-events-none absolute inset-0" />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 p-6 text-center">
          <p className="display text-[clamp(1.6rem,4.5vw,3rem)] leading-none tabular-nums" aria-live="polite">
            {status === "live" ? `${count.toLocaleString()} ${count === 1 ? "person is" : "people are"} touching this` : "One surface, everyone on it"}
          </p>
          <p className="font-mono text-[11px] text-bone/45">
            {status === "live"
              ? count === 1
                ? "Just you so far — send the link to someone and move your cursor together."
                : "Every coloured dot is somebody else, somewhere, right now."
              : status === "joining"
                ? "Finding the others…"
                : "Join to see — and ripple — everyone else here."}
          </p>
        </div>

        {!joined && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-6">
            <button
              type="button"
              onClick={() => setJoined(true)}
              className="rounded-[var(--radius-pill)] bg-bone px-5 py-2.5 font-mono text-[12px] text-ink transition-colors hover:bg-bone-dim"
            >
              Join the crowd
            </button>
            <p className="max-w-md text-center font-mono text-[10px] leading-relaxed text-bone/40">
              Joining connects your browser directly to the others in this room, as a video call does — which shares your IP address
              with them. Only your cursor position is sent.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className="mb-1.5 block font-mono text-[11px] text-bone/55">Room</span>
          <input
            type="text"
            value={room}
            maxLength={40}
            disabled={joined}
            onChange={(event) => setRoom(event.target.value.replace(/[^\w-]/g, "") || "launch")}
            className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none focus:border-bone disabled:opacity-50"
          />
        </label>
        <PresetSelect value={preset} onChange={setPreset} />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(shareLink).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            })
          }}
          className="rounded-[var(--radius-pill)] border border-rule px-4 py-2 font-mono text-[11px] text-bone/75 transition-colors hover:border-rule-bright hover:text-bone"
        >
          {copied ? "Copied" : "Copy the room link"}
        </button>
      </div>
      <p className="mt-3 font-mono text-[10px] leading-relaxed text-bone/30">
        Everyone with the same room name shares a surface. On your own launch, name the room after it and put the link in the post.
      </p>
    </BetaShell>
  )
}
