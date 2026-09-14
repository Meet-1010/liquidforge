"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { LiquidCanvas, type LiquidEngine } from "liquidforge"
import type { StreamEvent } from "@/lib/twitch"

export interface OverlayConfig {
  channel: string
  word: string
  preset: string
  corner: "tl" | "tr" | "bl" | "br" | "center"
  /** Height of the object's square, as a fraction of the frame's height. */
  size: number
  /** Ripple on every chat message, not only on cheers, subs and raids. */
  chat: boolean
  /** Show who did it under the object for a few seconds. */
  names: boolean
}

export const DEFAULT_OVERLAY: OverlayConfig = { channel: "", word: "LIVE", preset: "aurora-2", corner: "br", size: 0.3, chat: true, names: true }

export function overlayFromParams(params: URLSearchParams): OverlayConfig {
  const corner = params.get("corner")
  return {
    channel: (params.get("channel") ?? "").replace(/[^\w]/g, "").slice(0, 25),
    word: (params.get("word") ?? DEFAULT_OVERLAY.word).slice(0, 12),
    preset: params.get("preset") ?? DEFAULT_OVERLAY.preset,
    corner: corner === "tl" || corner === "tr" || corner === "bl" || corner === "br" || corner === "center" ? corner : DEFAULT_OVERLAY.corner,
    size: Math.max(0.12, Math.min(0.8, Number(params.get("size")) || DEFAULT_OVERLAY.size)),
    chat: params.get("chat") !== "0",
    names: params.get("names") !== "0",
  }
}

export function overlayParams(config: OverlayConfig): string {
  const params = new URLSearchParams({ channel: config.channel, word: config.word, preset: config.preset, corner: config.corner, size: String(config.size) })
  if (!config.chat) params.set("chat", "0")
  if (!config.names) params.set("names", "0")
  return params.toString()
}

export interface OverlayHandle {
  push: (event: StreamEvent) => void
}

const PLACE: Record<OverlayConfig["corner"], React.CSSProperties> = {
  tl: { top: "3%", left: "2%" },
  tr: { top: "3%", right: "2%" },
  bl: { bottom: "3%", left: "2%" },
  br: { bottom: "3%", right: "2%" },
  center: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
}

function caption(event: StreamEvent): string | null {
  if (event.kind === "raid") return `${event.user} is raiding with ${event.viewers.toLocaleString()}`
  if (event.kind === "sub") return event.gifts ? `${event.user} gifted ${event.gifts} sub${event.gifts === 1 ? "" : "s"}` : `${event.user} subscribed${event.months && event.months > 1 ? ` · ${event.months} months` : ""}`
  if (event.kind === "chat" && event.bits) return `${event.user} cheered ${event.bits.toLocaleString()} bits`
  return null
}

/**
 * The object in the corner of a stream, and what each event does to it: chat
 * is a ripple somewhere on the surface, cheers and subs are splashes sized to
 * the gift, and a raid erupts and boils for a couple of seconds.
 */
export const StreamOverlay = forwardRef<OverlayHandle, { config: OverlayConfig; framed?: boolean }>(function StreamOverlay({ config, framed = false }, ref) {
  const engine = useRef<LiquidEngine | null>(null)
  const boilUntil = useRef(0)
  const lastChatRipple = useRef(0)
  const [shown, setShown] = useState<{ text: string; id: number } | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      push(event) {
        const live = engine.current
        if (!live) return
        const now = performance.now()
        if (event.kind === "chat" && !event.bits) {
          // A busy chat is a steady drizzle, not a boil: at most a dozen rings a second.
          if (!config.chat || now - lastChatRipple.current < 80) return
          lastChatRipple.current = now
          live.rippleAt((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, 1)
          return
        }
        if (event.kind === "chat") live.splash(Math.min(2, 0.6 + Math.log10(event.bits ?? 1) * 0.45))
        if (event.kind === "sub") live.splash(Math.min(2, event.gifts ? 1 + event.gifts * 0.1 : 1.2))
        if (event.kind === "raid") {
          live.splash(2)
          boilUntil.current = now + 2600
        }
        const text = caption(event)
        if (text && config.names) setShown({ text, id: now })
      },
    }),
    [config.chat, config.names],
  )

  useEffect(() => {
    if (!shown) return
    const timer = setTimeout(() => setShown(null), 4200)
    return () => clearTimeout(timer)
  }, [shown])

  useEffect(() => {
    let frame = 0
    let boiling = false
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      const live = engine.current
      if (!live) return
      const left = boilUntil.current - now
      if (left > 0) {
        boiling = true
        live.setMutation(0.55 * Math.min(1, left / 1200))
      } else if (boiling) {
        boiling = false
        live.setMutation(0)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div className="pointer-events-none absolute" style={{ ...PLACE[config.corner], height: `${config.size * 100}%`, aspectRatio: "1 / 1" }}>
      <LiquidCanvas
        object={{ type: "text", value: config.word.trim() || "LIVE", depth: 0.5, bevel: 0.03 }}
        preset={config.preset}
        transparent
        onEngine={(value) => (engine.current = value)}
        style={{ position: "absolute", inset: 0, minHeight: 0, background: "transparent" }}
      />
      {shown && (
        <p
          key={shown.id}
          className="absolute inset-x-0 bottom-[4%] animate-[melt-copy_0.5s_ease-out_both] text-center font-mono font-medium text-white"
          style={{ fontSize: framed ? "clamp(9px, 1.4cqh, 14px)" : "2.2vh", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
        >
          {shown.text}
        </p>
      )}
    </div>
  )
})
