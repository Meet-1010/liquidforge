"use client"

import { useRef, useState } from "react"
import { SHAPE_KINDS } from "liquidforge"
import type { ObjectSource, ShapeKind } from "liquidforge"
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
}: {
  object: ObjectSource
  onChange: (object: ObjectSource) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<string | null>(null)

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
          <Button onClick={() => pickFile("image/*", (src) => onChange({ ...object, src }))}>
            {object.src ? "Replace image" : "Upload a PNG or JPG"}
          </Button>
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
          <Button onClick={() => pickFile(".glb,.gltf,model/gltf-binary", (src) => onChange({ ...object, src }))}>
            Upload a .glb
          </Button>
          <p className="font-mono text-[10px] leading-relaxed text-bone/30">
            Every mesh is baked into one surface. Materials, skins and animation clips are
            dropped — none of them survive being turned into liquid.
          </p>
        </>
      )}

      {pending && (
        <p className="truncate font-mono text-[10px] text-bone/35">{pending}</p>
      )}
    </Panel>
  )
}
