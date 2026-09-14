"use client"

import { useEffect, useRef, useState } from "react"
import { StreamOverlay, overlayFromParams, type OverlayConfig, type OverlayHandle } from "@/components/stream-overlay"
import { connectTwitch } from "@/lib/twitch"

/**
 * The page OBS loads as a browser source: nothing but the object, on a
 * transparent page, listening to the channel's chat. Not behind the beta door —
 * OBS has no way to press the button.
 */
export default function OverlayPage() {
  const [config, setConfig] = useState<OverlayConfig | null>(null)
  const overlay = useRef<OverlayHandle>(null)

  useEffect(() => {
    // The site's own ground would cover the stream.
    document.documentElement.style.background = "transparent"
    document.body.style.background = "transparent"
    document.querySelectorAll("body > nav, body > header").forEach((element) => ((element as HTMLElement).style.display = "none"))
    setConfig(overlayFromParams(new URLSearchParams(window.location.search)))
  }, [])

  useEffect(() => {
    if (!config?.channel) return
    return connectTwitch(config.channel, (event) => overlay.current?.push(event))
  }, [config])

  if (!config) return null
  return (
    <div className="fixed inset-0 overflow-hidden">
      <StreamOverlay ref={overlay} config={config} />
    </div>
  )
}
