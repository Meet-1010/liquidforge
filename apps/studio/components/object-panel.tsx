"use client"

import { useRef, useState } from "react"
import { SHAPE_KINDS } from "liquidforge"
import type { ObjectSource, ShapeKind } from "liquidforge"
import { extractPalette, recommend } from "liquidforge/recommend"
import { fetchSketchfabMetadata, randomAsset, TOTAL_ASSETS } from "@/lib/catalog"
import type { AssetResult } from "@/lib/catalog"
import { Button, Field, Panel, Segmented, Slider, TextInput } from "./ui"

type Kind = ObjectSource["type"]

const KINDS: Array<{ value: Kind; label: string }> = [
  { value: "text", label: "Text" },
  { value: "shape", label: "Shape" },
  { value: "svg", label: "SVG" },
  { value: "image", label: "Image" },
  { value: "model", label: "Model" },
]

const FONTS = [
  { value: "800 200px system-ui, -apple-system, Segoe UI, sans-serif", label: "Sans, heavy" },
  { value: "900 200px Georgia, 'Times New Roman', serif", label: "Serif, black" },
  { value: "700 200px ui-monospace, SFMono-Regular, Menlo, monospace", label: "Mono" },
  { value: "400 200px Georgia, 'Times New Roman', serif", label: "Serif, regular" },
]

/**
 * What to render.
 *
 * Every branch produces the same thing — one `BufferGeometry`, fitted into a
 * two-unit box — so the material below never has to know which one it came
 * from. That is the whole reason the forge exists.
 */
export function ObjectPanel({
  object,
  onChange,
  onBrand,
}: {
  object: ObjectSource
  onChange: (object: ObjectSource) => void
  /** A logo, turned into an object and a colourway in one step. */
  onBrand?: (result: { object: ObjectSource; presetId: string; palette: string[] }) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [rolling, setRolling] = useState(false)
  const [picked, setPicked] = useState<AssetResult | null>(null)
  const [rollError, setRollError] = useState<string | null>(null)

  /**
   * One model at random out of every importable thing in the catalogues.
   *
   * Objaverse is a scraped dataset, so a fair share of it is junk, broken, or
   * compressed in a way this library does not decode. Rather than hand back a
   * failure, this rerolls a few times — a surprise button that surprises you
   * with an error is not one.
   */
  const surprise = async () => {
    setRolling(true)
    setRollError(null)
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const asset = await randomAsset()
          const src = await asset.resolveModelUrl()
          setPicked(asset)
          onChange({ type: "model", src })
          // Objaverse knows only a category up front; the real name, author and
          // licence come from a second request, and the licence is the half
          // that matters.
          if (asset.enrich) {
            void fetchSketchfabMetadata(asset.id).then(
              (meta) => meta && setPicked((current) => (current?.id === asset.id ? { ...current, ...meta } : current)),
            )
          }
          return
        } catch {
          // Try another one.
        }
      }
      setRollError("Five in a row failed to resolve. Try again.")
    } finally {
      setRolling(false)
    }
  }

  const kind = object.type

  const setKind = (next: Kind) => {
    switch (next) {
      case "text":
        return onChange({ type: "text", value: "LIQUID", depth: 0.45, bevel: 0.03 })
      case "shape":
        return onChange({ type: "shape", shape: "sphere", detail: 160 })
      case "svg":
        return onChange({ type: "svg", markup: "", depth: 0.45, bevel: 0.03 })
      case "image":
        return onChange({ type: "image", src: "", depth: 0.45, threshold: 0.5 })
      case "model":
        return onChange({ type: "model", src: "" })
    }
  }

  /**
   * Logo in, brand out.
   *
   * Three things that already existed, joined by one button: trace the logo to
   * a silhouette, pull its palette, and ask the recommender which family suits
   * a brand that colour. Separately they are three screens of work nobody
   * finishes; together they are the only step between "I have a logo" and
   * "that looks like ours".
   */
  const [branding, setBranding] = useState(false)

  const brandFrom = async (src: string) => {
    if (!onBrand) return
    setBranding(true)
    try {
      const palette = await extractPalette(src, { count: 4 })
      const suggestion = recommend({ palette, background: "dark" })
      onBrand({
        object: { type: "image", src, depth: 0.45, threshold: 0.5 },
        presetId: suggestion.preset.id,
        palette,
      })
    } catch {
      // Fall back to the plain silhouette; a failed palette read should not
      // cost someone the import.
      onChange({ type: "image", src, depth: 0.45, threshold: 0.5 })
    } finally {
      setBranding(false)
    }
  }

  const pickFile = (accept: string, apply: (url: string) => void) => {
    const input = fileInput.current
    if (!input) return
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      // An object URL never leaves this browser, so anything forged from one
      // cannot be shared by link. `shareUrl` returns null for those.
      setPending(file.name)
      apply(URL.createObjectURL(file))
      input.value = ""
    }
    input.click()
  }

  return (
    <Panel title="Object">
      <input ref={fileInput} type="file" className="hidden" />

      <Segmented value={kind} options={KINDS} onChange={setKind} />

      {object.type === "text" && (
        <>
          <TextInput
            label="Text"
            value={object.value}
            onChange={(value) => onChange({ ...object, value })}
            placeholder="SHIP IT"
            multiline
          />
          <Field label="Typeface">
            <select
              value={object.font ?? FONTS[0].value}
              onChange={(event) => onChange({ ...object, font: event.target.value })}
              className="w-full appearance-none rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[11px] text-bone/80 outline-none focus:border-bone"
            >
              {FONTS.map((font) => (
                <option key={font.value} value={font.value} className="bg-ink">
                  {font.label}
                </option>
              ))}
            </select>
          </Field>
          <Slider
            label="Depth"
            min={0.05}
            max={1.5}
            step={0.01}
            value={object.depth ?? 0.45}
            onChange={(depth) => onChange({ ...object, depth })}
          />
          <Slider
            label="Bevel"
            min={0}
            max={0.12}
            step={0.005}
            value={object.bevel ?? 0.03}
            onChange={(bevel) => onChange({ ...object, bevel })}
          />
        </>
      )}

      {object.type === "shape" && (
        <>
          <Field label="Shape">
            <select
              value={object.shape}
              onChange={(event) => onChange({ ...object, shape: event.target.value as ShapeKind })}
              className="w-full appearance-none rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[11px] text-bone/80 outline-none focus:border-bone"
            >
              {SHAPE_KINDS.map((shape) => (
                <option key={shape} value={shape} className="bg-ink">
                  {shape}
                </option>
              ))}
            </select>
          </Field>
          <Slider
            label="Detail"
            min={32}
            max={400}
            step={8}
            value={object.detail ?? 160}
            onChange={(detail) => onChange({ ...object, detail })}
            format={(value) => String(Math.round(value))}
          />
        </>
      )}

      {object.type === "svg" && (
        <>
          <TextInput
            label="Markup"
            value={object.markup ?? ""}
            onChange={(markup) => onChange({ ...object, markup, src: undefined })}
            placeholder="<svg viewBox=...>"
            multiline
          />
          <Button onClick={() => pickFile(".svg,image/svg+xml", (url) => onChange({ ...object, src: url, markup: undefined }))}>
            Upload an .svg
          </Button>
          <Slider
            label="Depth"
            min={0.05}
            max={1.5}
            step={0.01}
            value={object.depth ?? 0.45}
            onChange={(depth) => onChange({ ...object, depth })}
          />
        </>
      )}

      {object.type === "image" && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => pickFile("image/*", (src) => onChange({ ...object, src }))}>
              {object.src ? "Replace image" : "Upload a PNG or JPG"}
            </Button>
            {onBrand && (
              <Button
                variant="primary"
                disabled={branding}
                onClick={() => pickFile("image/*", (src) => void brandFrom(src))}
              >
                {branding ? "Reading…" : "Match my brand"}
              </Button>
            )}
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-bone/30">
            Match my brand traces the logo, pulls its colours, and picks the family that suits a
            brand those colours belong to.
          </p>
          <p className="font-mono text-[10px] leading-relaxed text-bone/30">
            The silhouette is traced and extruded. A logo on a transparent background is the
            best case; a photograph has no outline to find.
          </p>
          <Slider
            label="Threshold"
            min={0.05}
            max={0.95}
            step={0.01}
            value={object.threshold ?? 0.5}
            onChange={(threshold) => onChange({ ...object, threshold })}
          />
          <Slider
            label="Depth"
            min={0.05}
            max={1.5}
            step={0.01}
            value={object.depth ?? 0.45}
            onChange={(depth) => onChange({ ...object, depth })}
          />
        </>
      )}

      {object.type === "model" && (
        <>
          <TextInput
            label="URL"
            value={object.src}
            onChange={(src) => onChange({ ...object, src })}
            placeholder="/models/yours.glb"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => pickFile(".glb,.gltf,model/gltf-binary", (src) => onChange({ ...object, src }))}>
              Upload a .glb
            </Button>
            <Button variant="primary" onClick={surprise} disabled={rolling}>
              {rolling ? "Rolling…" : "Surprise me"}
            </Button>
          </div>
          <p className="font-mono text-[10px] text-bone/30">
            One at random out of {TOTAL_ASSETS.toLocaleString()}. Objaverse is a scraped dataset,
            so expect the occasional lump — roll again.
          </p>

          {picked && (
            <div className="rounded-[var(--radius-sm)] border border-rule bg-ink p-2.5">
              <p className="truncate font-mono text-[11px] text-bone/80">{picked.name}</p>
              <p className="truncate font-mono text-[10px] text-muted">
                {picked.author ?? picked.provider}
              </p>
              {/* Shown verbatim and always: a random CC-BY model still has to
                  carry its attribution, and a link is the only honest one. */}
              <p className="truncate font-mono text-[10px] text-bone/35">{picked.license}</p>
              <a
                href={picked.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block font-mono text-[10px] text-muted underline underline-offset-2 hover:text-bone"
              >
                Source
              </a>
            </div>
          )}
          {rollError && <p className="font-mono text-[10px] text-bone/45">{rollError}</p>}
          <p className="font-mono text-[10px] leading-relaxed text-bone/30">
            Every mesh is baked into one surface and materials are dropped. Rigged and
            morph-target models animate, up to about 60k vertices — past that they are posed.
          </p>
        </>
      )}

      {pending && (
        <p className="truncate font-mono text-[10px] text-bone/35">{pending}</p>
      )}
    </Panel>
  )
}
