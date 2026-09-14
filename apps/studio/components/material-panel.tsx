"use client"

import { COLLECTIONS, PRESETS, presetName } from "liquidforge"
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
