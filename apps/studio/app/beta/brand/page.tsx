"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LiquidCanvas, presetName, resolvePreset, type ObjectSource } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import type { BrandLogo } from "@/lib/brand"

/**
 * Paste a homepage; see it with a liquid hero already in place.
 *
 * One server request reads the page for its colours, logo and typeface and
 * hands back an inert copy of it. The copy is shown in a frame sandboxed so
 * nothing on it can run, the brand's own logo is forged into an object in a
 * colourway made from its own palette, and the object sits over the page's
 * first screen. The address of this page is the before-and-after link.
 */

interface Brand {
  url: string
  palette: string[]
  background: "light" | "dark" | "mid"
  brandColor?: string
  title?: string
  suggestion: { preset: string; family: string; reason: string }
  logo: BrandLogo
  font: { family: string; google: boolean } | null
  page: string
}

const FRAME_WIDTH = 1280
const FRAME_HEIGHT = 820
const PLACES = { right: { left: "58%", top: "10%" }, centre: { left: "31%", top: "16%" }, left: { left: "4%", top: "10%" } } as const

export default function BrandPage() {
  return (
    <BetaShell slug="brand" wide>
      <BrandDemo />
    </BetaShell>
  )
}

function BrandDemo() {
  const [address, setAddress] = useState("")
  const [brand, setBrand] = useState<Brand | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [after, setAfter] = useState(true)
  const [place, setPlace] = useState<keyof typeof PLACES>("right")
  const [size, setSize] = useState(0.38)
  const [copied, setCopied] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.6)

  const read = useCallback(async (value: string) => {
    const url = value.trim()
    if (!url) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/brand?url=${encodeURIComponent(url)}`)
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? "That site couldn't be read.")
      setBrand(body)
      setAfter(true)
      const share = new URL(window.location.href)
      share.searchParams.set("url", url.replace(/^https?:\/\//, "").replace(/\/$/, ""))
      window.history.replaceState(null, "", share)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That site couldn't be read.")
    } finally {
      setLoading(false)
    }
  }, [])

  // A shared link opens straight onto the preview.
  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get("url")
    if (url) {
      setAddress(url)
      void read(url)
    }
  }, [read])

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(() => setScale(element.clientWidth / FRAME_WIDTH))
    observer.observe(element)
    return () => observer.disconnect()
  }, [brand])

  const object = useMemo<ObjectSource | null>(() => {
    if (!brand) return null
    if (brand.logo.kind === "svg") return { type: "svg", markup: brand.logo.markup, depth: 0.5 }
    if (brand.logo.kind === "image") return { type: "image", src: `/api/brand/asset?url=${encodeURIComponent(brand.logo.url)}`, depth: 0.5 }
    const name = (brand.title ?? new URL(brand.url).hostname).split(/[\s|·—–-]/)[0].slice(0, 10)
    return { type: "text", value: name, depth: 0.5, bevel: 0.03 }
  }, [brand])

  const look = useMemo(() => (brand ? { ...resolvePreset(brand.suggestion.preset), palette: brand.palette, background: "transparent" as const } : null), [brand])
  const logoPreview =
    brand?.logo.kind === "svg"
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(brand.logo.markup.includes("xmlns") ? brand.logo.markup : brand.logo.markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"'))}`
      : brand?.logo.kind === "image"
        ? `/api/brand/asset?url=${encodeURIComponent(brand.logo.url)}`
        : null

  return (
    <>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          void read(address)
        }}
      >
        <input
          type="text"
          inputMode="url"
          value={address}
          placeholder="yourcompany.com"
          onChange={(event) => setAddress(event.target.value)}
          className="min-w-0 flex-1 rounded-[var(--radius-pill)] border border-rule bg-ink px-4 py-2.5 font-mono text-[13px] text-bone/85 outline-none placeholder:text-bone/25 focus:border-bone"
        />
        <button
          type="submit"
          disabled={loading || !address.trim()}
          className="rounded-[var(--radius-pill)] bg-bone px-5 py-2.5 font-mono text-[12px] text-ink transition-colors hover:bg-bone-dim disabled:opacity-40"
        >
          {loading ? "Reading the site…" : "Show it on their site"}
        </button>
      </form>
      {error && <p role="alert" className="mt-3 font-mono text-[11px] text-[#ff8a7a]">{error}</p>}
      {!brand && !loading && (
        <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] text-bone/40">
          Try
          {["stripe.com", "linear.app", "vercel.com", "github.com"].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setAddress(example)
                void read(example)
              }}
              className="underline decoration-bone/20 underline-offset-2 hover:text-bone"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {brand && object && look && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4">
            {logoPreview && (
              <span className="flex h-12 min-w-16 items-center justify-center rounded-[var(--radius-sm)] bg-bone px-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoPreview} alt="The logo that was found" className="max-h-8 max-w-40" />
              </span>
            )}
            <span className="flex gap-1">
              {brand.palette.map((colour) => (
                <span key={colour} title={colour} className="h-6 w-6 rounded-full border border-rule" style={{ background: colour }} />
              ))}
            </span>
            <span className="font-mono text-[11px] text-bone/70">
              {presetName(brand.suggestion.preset)} · {brand.suggestion.family}, recoloured in their palette
            </span>
            {brand.font && <span className="font-mono text-[11px] text-bone/45">Headings in {brand.font.family}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-[var(--radius-pill)] border border-rule p-0.5">
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setAfter(value)}
                  className={`rounded-[var(--radius-pill)] px-3 py-1 font-mono text-[11px] ${after === value ? "bg-bone text-ink" : "text-bone/60 hover:text-bone"}`}
                >
                  {value ? "After" : "Before"}
                </button>
              ))}
            </div>
            {(Object.keys(PLACES) as Array<keyof typeof PLACES>).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setPlace(key)}
                className={`rounded-[var(--radius-pill)] border px-2.5 py-1 font-mono text-[10px] capitalize ${place === key ? "border-bone text-bone" : "border-rule text-bone/50 hover:text-bone"}`}
              >
                {key}
              </button>
            ))}
            <label className="flex items-center gap-2 font-mono text-[10px] text-bone/50">
              Size
              <input type="range" min={0.2} max={0.6} step={0.01} value={size} onChange={(event) => setSize(Number(event.target.value))} className="w-28" />
            </label>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard?.writeText(window.location.href).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                })
              }
              className="ml-auto rounded-[var(--radius-pill)] border border-rule px-3 py-1.5 font-mono text-[11px] text-bone/75 hover:text-bone"
            >
              {copied ? "Copied" : "Copy the before-and-after link"}
            </button>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-rule">
            <div className="flex items-center gap-3 border-b border-rule bg-ink-2 px-4 py-2">
              <span aria-hidden className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-bone/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-bone/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-bone/15" />
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-bone/50">{brand.url}</span>
            </div>
            <div ref={frame} className="relative w-full overflow-hidden bg-white" style={{ height: FRAME_HEIGHT * scale }}>
              <iframe
                title={`A copy of ${brand.url} with its scripts removed`}
                sandbox=""
                srcDoc={brand.page}
                className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
                style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT, transform: `scale(${scale})` }}
              />
              <div
                className="absolute aspect-square transition-opacity duration-500"
                style={{ ...PLACES[place], width: `${size * 100}%`, opacity: after ? 1 : 0, maxHeight: "90%" }}
              >
                <LiquidCanvas object={object} preset={look} transparent style={{ position: "absolute", inset: 0, minHeight: 0 }} />
              </div>
            </div>
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-bone/30">
            A copy of the page with its scripts removed, so sites that draw themselves with JavaScript can look sparse here. Their logo and
            colours belong to them — use this to pitch, not to publish.
          </p>
        </div>
      )}
    </>
  )
}
