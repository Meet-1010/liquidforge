"use client"

import { useEffect, useRef, useState } from "react"
import { LiquidCanvas, type LiquidEngine } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { PresetSelect } from "@/components/look-picker"

/**
 * The object reflects the page it is on.
 *
 * The page is rasterised once into a canvas — the real DOM, with its real
 * type and colour — and every frame the patch of it under the object is
 * copied, mirrored like a reflection, into the panorama the engine wraps
 * around the object. Scroll, and a different part of the page is under the
 * object, so the headline and the photographs slide across the metal.
 *
 * Chrome is trialling a way to draw live HTML straight into a canvas, which
 * would make this a live reflection rather than a snapshot. Until that ships
 * everywhere, the snapshot is taken again whenever the page changes.
 */

const PANORAMA_W = 768
const PANORAMA_H = 384
const RASTER_SCALE = 0.5

const SECTIONS = [
  { tone: "linear-gradient(120deg, #ff6b3d, #ffd23f)", label: "Field recordings", caption: "Coastline, 04:12" },
  { tone: "linear-gradient(200deg, #2d6cdf, #7de2d1)", label: "Studio sessions", caption: "Room B, take 7" },
  { tone: "linear-gradient(160deg, #1f8a4c, #d9f99d)", label: "Open air", caption: "Allotment, dawn" },
]

export default function ReflectPage() {
  return (
    <BetaShell slug="reflect" wide>
      <ReflectDemo />
    </BetaShell>
  )
}

/** Its own component, so its effects run once the beta door has rendered it and the page it snapshots exists. */
function ReflectDemo() {
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [preset, setPreset] = useState("mercury-1")
  const [mix, setMix] = useState(0.85)
  const [headline, setHeadline] = useState("Sound you can see")
  const [ready, setReady] = useState(false)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const site = useRef<HTMLDivElement>(null)
  const objectBox = useRef<HTMLDivElement>(null)
  const raster = useRef<HTMLCanvasElement | null>(null)
  const panorama = useRef<HTMLCanvasElement | null>(null)
  const mixRef = useRef(mix)
  mixRef.current = mix

  // A new width reflows the page, so the snapshot has to be taken again.
  useEffect(() => {
    const element = site.current
    if (!element) return
    let width = element.clientWidth
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return
      width = element.clientWidth
      setLayoutVersion((version) => version + 1)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // -- the snapshot: taken on load, and again whenever the page changes -----------
  useEffect(() => {
    const element = site.current
    if (!element) return
    let cancelled = false
    const timer = setTimeout(async () => {
      await document.fonts.ready
      const { domToCanvas } = await import("modern-screenshot")
      const canvas = await domToCanvas(element, {
        scale: RASTER_SCALE,
        backgroundColor: "#0b0b0e",
        // The object itself stays out of its own reflection.
        filter: (node) => node !== objectBox.current,
      }).catch((cause) => {
        console.warn("liquidforge: the page snapshot failed", cause)
        return null
      })
      if (cancelled || !canvas) return
      raster.current = canvas
      setReady(true)
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [headline, layoutVersion])

  // -- every frame: the patch under the object, into the panorama ------------------
  useEffect(() => {
    if (!engine) return
    panorama.current ??= Object.assign(document.createElement("canvas"), { width: PANORAMA_W, height: PANORAMA_H })
    const target = panorama.current
    const context = target.getContext("2d")!
    let frame = 0
    let last = ""
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const source = raster.current
      const box = objectBox.current?.getBoundingClientRect()
      const page = site.current?.getBoundingClientRect()
      if (!source || !box || !page) return
      // The whole width of the page, at the height of the object: a real
      // reflection would show the room all around it, and the page is the room.
      const width = page.width * RASTER_SCALE
      const height = width / 2
      const cx = width / 2
      const cy = (box.top + box.height / 2 - page.top) * RASTER_SCALE
      const key = `${Math.round(cx)}:${Math.round(cy)}:${Math.round(width)}:${mixRef.current}:${source.width}`
      if (key === last) return
      last = key
      context.fillStyle = "#0b0b0e"
      context.fillRect(0, 0, PANORAMA_W, PANORAMA_H)
      context.save()
      // Mirrored left to right, as a reflection is.
      context.translate(PANORAMA_W, 0)
      context.scale(-1, 1)
      context.drawImage(source, cx - width / 2, cy - height / 2, width, height, 0, 0, PANORAMA_W, PANORAMA_H)
      context.restore()
      engine.setEnvironment(target, mixRef.current)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      engine.setEnvironment(null)
    }
  }, [engine])

  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-[1fr_1fr_1fr] sm:items-end">
        <label className="block">
          <span className="mb-1.5 block font-mono text-[11px] text-bone/55">Headline on the page</span>
          <input
            type="text"
            value={headline}
            maxLength={40}
            onChange={(event) => setHeadline(event.target.value)}
            className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none focus:border-bone"
          />
        </label>
        <PresetSelect value={preset} onChange={setPreset} />
        <label className="block">
          <span className="mb-1 flex justify-between font-mono text-[11px] text-bone/55">
            How much of the page it reflects <span className="text-bone/30 tabular-nums">{Math.round(mix * 100)}%</span>
          </span>
          <input type="range" min={0} max={1} step={0.05} value={mix} onChange={(event) => setMix(Number(event.target.value))} />
        </label>
      </div>
      <p className="mb-4 font-mono text-[10px] text-bone/35" aria-live="polite">
        {ready ? "Scroll the page below — the object stays put and the page slides across it." : "Taking a snapshot of the page…"}
      </p>

      <div ref={site} className="relative overflow-clip rounded-[var(--radius-lg)] border border-rule bg-[#0b0b0e] text-[#f3f1ea]">
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-full md:w-1/2">
          <div ref={objectBox} className="sticky top-[10vh] mx-auto aspect-square w-[min(92%,32rem)]">
            <LiquidCanvas object={{ type: "shape", shape: "sphere" }} preset={preset} transparent onEngine={setEngine} style={{ position: "absolute", inset: 0, minHeight: 0 }} />
          </div>
        </div>

        <header className="px-6 pb-16 pt-10 sm:px-10">
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-[#ffd23f]">Tidewater Audio · Est. 2019</p>
          <h2 className="display mt-6 max-w-[12ch] text-[clamp(3rem,9vw,6.5rem)] leading-[0.92] text-balance">{headline || " "}</h2>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-[#f3f1ea]/70">
            Microphones and preamps built by hand in a converted boathouse. Every unit is tested against the sea.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <span className="rounded-full bg-[#ff6b3d] px-5 py-2.5 text-[13px] font-semibold text-[#0b0b0e]">Shop microphones</span>
            <span className="rounded-full border border-[#f3f1ea]/40 px-5 py-2.5 text-[13px]">Hear the difference</span>
          </div>
        </header>

        {SECTIONS.map((section) => (
          <section key={section.label} className="grid gap-6 px-6 py-12 sm:px-10 md:grid-cols-2">
            <div>
              <div className="aspect-[4/3] w-full rounded-2xl" style={{ background: section.tone }} />
              <p className="mt-3 font-mono text-[11px] text-[#f3f1ea]/50">{section.caption}</p>
            </div>
            <div className="flex flex-col justify-center">
              <h3 className="display text-[clamp(2rem,5vw,3.4rem)] leading-none">{section.label}</h3>
            </div>
          </section>
        ))}

        <footer className="flex flex-wrap items-center justify-between gap-4 bg-[#ffd23f] px-6 py-10 text-[#0b0b0e] sm:px-10">
          <p className="display text-[clamp(1.8rem,4vw,2.8rem)] leading-none">Book a listening room</p>
          <span className="rounded-full bg-[#0b0b0e] px-5 py-2.5 text-[13px] font-semibold text-[#f3f1ea]">Reserve a slot</span>
        </footer>
      </div>
    </>
  )
}
