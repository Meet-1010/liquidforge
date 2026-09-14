"use client"

import { useState } from "react"
import { COLLECTIONS, PRESETS, describeChange, presetName, resolvePreset } from "liquidforge"
import type { LiquidConfig } from "liquidforge/codegen"
import type { MaterialFamily, ShadingOptions, SurfaceOptions } from "liquidforge"
import { Collapsible, Field, PaletteField, Panel, Slider } from "./ui"

const FAMILIES: Array<{ value: MaterialFamily; label: string }> = [
  { value: "mercury", label: "Mercury" },
  { value: "aurora", label: "Aurora" },
  { value: "prism", label: "Prism" },
  { value: "magma", label: "Magma" },
  { value: "pearl", label: "Pearl" },
  { value: "obsidian", label: "Obsidian" },
  { value: "velvet", label: "Velvet" },
  { value: "halo", label: "Halo" },
  { value: "jade", label: "Jade" },
  { value: "plasma", label: "Plasma" },
  { value: "original", label: "Original" },
  { value: "ferrofluid", label: "Ferrofluid" },
]

/**
 * The material.
 *
 * Pick a colourway first, then move numbers. Changing the collection replaces
 * everything — palette, surface, shading — because those are tuned together;
 * changing a single slider afterwards leaves the rest alone and shows up in the
 * exported code as one override rather than twenty.
 */
export function MaterialPanel({
  config,
  onChange,
}: {
  config: LiquidConfig
  onChange: (config: LiquidConfig) => void
}) {
  const collection = COLLECTIONS.find((entry) => entry.family === config.family)
  const surface = (key: keyof SurfaceOptions) => (value: number) =>
    onChange({ ...config, surface: { ...config.surface, [key]: value } })
  const shading = (key: keyof ShadingOptions) => (value: number) =>
    onChange({ ...config, shading: { ...config.shading, [key]: value } })

  const selectPreset = (id: string) => {
    const preset = PRESETS[id]
    if (!preset) return
    onChange({
      ...config,
      preset: preset.id,
      family: preset.family,
      palette: [...preset.palette],
      surface: { ...preset.surface },
      shading: { ...preset.shading },
      background: preset.background,
    })
  }

  return (
    <>
      <Panel title="Material">
        {/* A grid rather than a segmented control: twelve families do not fit on
            one row, and wrapping a segmented control looks like a mistake. */}
        <div className="grid grid-cols-3 gap-1.5">
          {FAMILIES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => {
                const next = COLLECTIONS.find((collection) => collection.family === entry.value)
                if (next) selectPreset(`${next.name.toLowerCase()}-1`)
              }}
              className={`rounded-[var(--radius-sm)] border px-2 py-1.5 font-mono text-[10px] transition-colors ${
                config.family === entry.value
                  ? "border-bone bg-bone text-ink"
                  : "border-rule text-bone/45 hover:border-rule-bright hover:text-bone"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {collection && (
          <>
            <p className="font-mono text-[10px] leading-relaxed text-bone/30">
              {collection.blurb}
            </p>
            {config.family === "original" && (
              <p className="font-mono text-[10px] leading-relaxed text-bone/45">
                {config.object.type === "model" || config.object.type === "image" || config.object.type === "svg"
                  ? "Keeps this object's own textures and colours; the colourway only sets the light on it."
                  : "Original keeps a model's, image's or SVG's own colours. Text and shapes have none, so they take the first palette colour."}
              </p>
            )}
            <Field label="Colourway" hint={presetName(config.preset)}>
              <div className="grid grid-cols-3 gap-1.5">
                {collection.colourways.map((colourway, index) => {
                  const id = `${collection.name.toLowerCase()}-${index + 1}`
                  const active = config.preset === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => selectPreset(id)}
                      title={colourway.name}
                      aria-label={colourway.name}
                      className={`flex h-8 overflow-hidden rounded-[var(--radius-sm)] border transition-colors ${
                        active ? "border-bone" : "border-rule hover:border-rule-bright"
                      }`}
                    >
                      {colourway.palette.map((colour, i) => (
                        <span key={i} style={{ flex: 1, background: colour }} />
                      ))}
                    </button>
                  )
                })}
              </div>
            </Field>
          </>
        )}

        <PaletteField
          palette={config.palette}
          onChange={(palette) => onChange({ ...config, palette })}
        />
        <TunedFrom config={config} />
        <FromWebsite config={config} onChange={onChange} />
      </Panel>

      <Collapsible title="Surface" hint="how it moves" defaultOpen>
        {config.family === "ferrofluid" && (
          <Slider
            label="Spikes"
            min={0}
            max={0.35}
            step={0.005}
            value={config.surface.spikes ?? 0}
            onChange={surface("spikes")}
          />
        )}
        <Slider
          label="Drift"
          min={0}
          max={0.12}
          step={0.002}
          value={config.surface.noise}
          onChange={surface("noise")}
        />
        <Slider
          label="Dimple"
          min={0}
          max={0.4}
          step={0.005}
          value={config.surface.dimple}
          onChange={surface("dimple")}
        />
        <Slider
          label="Ripple height"
          min={0}
          max={0.25}
          step={0.002}
          value={config.surface.rippleAmp}
          onChange={surface("rippleAmp")}
        />
        <Slider
          label="Ripple speed"
          min={0.1}
          max={2.5}
          step={0.02}
          value={config.surface.rippleSpeed}
          onChange={surface("rippleSpeed")}
        />
        <Slider
          label="Ripple tightness"
          min={10}
          max={120}
          step={1}
          value={config.surface.rippleTightness}
          onChange={surface("rippleTightness")}
          format={(value) => String(Math.round(value))}
        />
        <Slider
          label="Trail spacing"
          min={0.02}
          max={0.4}
          step={0.005}
          value={config.surface.trailSpacing}
          onChange={surface("trailSpacing")}
        />
        <p className="font-mono text-[10px] leading-relaxed text-bone/30">
          Low spacing drops overlapping rings that smear into a tail following the cursor. High
          spacing reads as separate stones dropped in a pond. Both are legitimate; that is why
          it is a slider.
        </p>
        <Slider
          label="Advection"
          min={0}
          max={2}
          step={0.02}
          value={config.surface.advection}
          onChange={surface("advection")}
        />
      </Collapsible>

      <Collapsible title="Shading" hint="how it takes light">
        <Slider
          label="Metalness"
          min={0}
          max={1}
          step={0.01}
          value={config.shading.metalness}
          onChange={shading("metalness")}
        />
        <Slider
          label="Roughness"
          min={0}
          max={1}
          step={0.01}
          value={config.shading.roughness}
          onChange={shading("roughness")}
        />
        <Slider
          label="Fresnel"
          min={0}
          max={1.5}
          step={0.01}
          value={config.shading.fresnel}
          onChange={shading("fresnel")}
        />
        <Slider
          label="Highlight tightness"
          min={2}
          max={120}
          step={1}
          value={config.shading.specPower}
          onChange={shading("specPower")}
          format={(value) => String(Math.round(value))}
        />

        {(config.family === "prism" || config.family === "jade") && (
          <>
            <Slider
              label={config.family === "jade" ? "Translucency" : "Transmission"}
              min={0}
              max={1}
              step={0.01}
              value={config.shading.transmission ?? 0.85}
              onChange={shading("transmission")}
            />
            <Slider
              label="Index of refraction"
              min={1.02}
              max={2.4}
              step={0.01}
              value={config.shading.ior ?? 1.45}
              onChange={shading("ior")}
            />
          </>
        )}

        {(config.family === "aurora" || config.family === "pearl" || config.family === "halo") && (
          <Slider
            label={config.family === "halo" ? "Interference bands" : "Thin film"}
            min={0}
            max={0.6}
            step={0.01}
            value={config.shading.thinFilm ?? 0}
            onChange={shading("thinFilm")}
          />
        )}

        {(config.family === "magma" || config.family === "plasma") && (
          <Slider
            label="Emissive"
            min={0}
            max={4}
            step={0.05}
            value={config.shading.emissive ?? 1.6}
            onChange={shading("emissive")}
          />
        )}
      </Collapsible>
    </>
  )
}

/**
 * What the sliders have done, in a sentence.
 *
 * After a few minutes of tuning it is easy to lose track of how far a look has
 * drifted from the colourway it started as. Saying it plainly — "warmer, and
 * the ripples travel twice as fast" — also tells someone which slider to reach
 * for to get back.
 */
function TunedFrom({ config }: { config: LiquidConfig }) {
  const base = PRESETS[config.preset]
  if (!base) return null
  const current = resolvePreset(config.preset, {
    family: config.family,
    palette: config.palette,
    surface: config.surface,
    shading: config.shading,
    background: config.background,
  })
  const sentence = describeChange(base, current, { limit: 3 })
  if (sentence === "Almost exactly the same.") return null
  return (
    <p className="font-mono text-[10px] leading-relaxed text-bone/45">
      <span className="text-bone/30">Against {base.label} · {presetName(base.id)}: </span>
      {sentence}
    </p>
  )
}

interface SiteReading {
  url: string
  palette: string[]
  background: "light" | "dark" | "mid"
  title?: string
  suggestion: { preset: string; family: MaterialFamily; reason: string }
}

/**
 * Colours from a website.
 *
 * The brief that comes up most is "make it match our site", and the site is the
 * one thing everyone already has the address of. The server reads the colours
 * the site's stylesheets declare — brand tokens and buttons first — and hands
 * back a palette and the colourway closest to it. Nothing is applied until you
 * choose to.
 */
function FromWebsite({ config, onChange }: { config: LiquidConfig; onChange: (config: LiquidConfig) => void }) {
  const [url, setUrl] = useState("")
  const [state, setState] = useState<"idle" | "reading" | "error">("idle")
  const [reading, setReading] = useState<SiteReading | null>(null)
  const [error, setError] = useState<string | null>(null)

  const read = async () => {
    if (!url.trim()) return
    setState("reading")
    setError(null)
    try {
      const response = await fetch(`/api/palette?url=${encodeURIComponent(url.trim())}`)
      const data = (await response.json()) as SiteReading & { error?: string }
      if (!response.ok || data.error) throw new Error(data.error ?? `Failed (${response.status})`)
      setReading(data)
      setState("idle")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setState("error")
    }
  }

  const applyColours = (startFrom?: string) => {
    if (!reading) return
    const base = startFrom ? PRESETS[startFrom] : null
    onChange({
      ...config,
      ...(base
        ? {
            preset: base.id,
            family: base.family,
            surface: { ...base.surface },
            shading: { ...base.shading },
          }
        : {}),
      palette: reading.palette.slice(0, 8),
      background: reading.background,
    })
  }

  return (
    // Not a <Field>: that is a <label>, and a form cannot sit inside one.
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] text-bone/55">Colours from a website</span>
        <span className="font-mono text-[10px] text-bone/30">brand colours, from its CSS</span>
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          void read()
        }}
      >
        <input
          type="text"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="yoursite.com"
          className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-rule bg-ink px-2.5 py-1.5 font-mono text-[11px] text-bone/85 outline-none placeholder:text-bone/25 focus:border-bone"
        />
        <button
          type="submit"
          disabled={state === "reading" || !url.trim()}
          className="shrink-0 rounded-[var(--radius-sm)] border border-rule px-2.5 py-1.5 font-mono text-[10px] text-bone/70 transition-colors hover:border-rule-bright hover:text-bone disabled:opacity-40"
        >
          {state === "reading" ? "Reading…" : "Read"}
        </button>
      </form>
      {error && <p className="mt-1.5 font-mono text-[10px] text-bone/55">{error}</p>}
      {reading && (
        <div className="mt-2 space-y-1.5">
          <div className="flex h-6 overflow-hidden rounded-[var(--radius-sm)] border border-rule">
            {reading.palette.map((colour) => (
              <span key={colour} title={colour} style={{ flex: 1, background: colour }} />
            ))}
          </div>
          <p className="truncate font-mono text-[10px] text-bone/35" title={reading.url}>
            {reading.title ?? reading.url} · {reading.background} page
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => applyColours()}
              className="rounded-[var(--radius-pill)] bg-bone px-2.5 py-1 font-mono text-[10px] text-ink transition-colors hover:bg-bone-dim"
            >
              Use these colours
            </button>
            {PRESETS[reading.suggestion.preset] && reading.suggestion.preset !== config.preset && (
              <button
                type="button"
                onClick={() => applyColours(reading.suggestion.preset)}
                title={reading.suggestion.reason}
                className="rounded-[var(--radius-pill)] border border-rule px-2.5 py-1 font-mono text-[10px] text-bone/70 transition-colors hover:border-rule-bright hover:text-bone"
              >
                …on {PRESETS[reading.suggestion.preset].label}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
