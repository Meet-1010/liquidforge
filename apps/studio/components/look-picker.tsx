"use client"

import { COLLECTIONS, PRESETS, presetName } from "liquidforge"

/** A colourway, grouped by family. */
export function PresetSelect({ value, onChange, label = "Look" }: { value: string; onChange: (id: string) => void; label?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] text-bone/55">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none focus:border-bone"
      >
        {COLLECTIONS.map((collection) => (
          <optgroup key={collection.name} label={collection.name}>
            {collection.colourways.map((_, index) => {
              const id = `${collection.name.toLowerCase()}-${index + 1}`
              return (
                <option key={id} value={id}>
                  {PRESETS[id]?.label} · {presetName(id)}
                </option>
              )
            })}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

export function WordInput({ value, onChange, label = "Word", max = 14 }: { value: string; onChange: (value: string) => void; label?: string; max?: number }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] text-bone/55">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={max}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none focus:border-bone"
      />
    </label>
  )
}
