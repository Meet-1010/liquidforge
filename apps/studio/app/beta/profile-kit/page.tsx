"use client"

import { useState } from "react"
import { LiquidCanvas, downloadBlob, type LiquidEngine } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { PresetSelect, WordInput } from "@/components/look-picker"
import { zip } from "@/lib/zip"

/**
 * Every profile, from a name.
 *
 * People change their banner and announce it. This makes the whole set at
 * once from a single look: each size rendered by the engine at its own
 * proportions — not one image cropped nine ways — so the object is framed for
 * a thin LinkedIn cover and a tall phone wallpaper alike.
 */

interface Size {
  id: string
  label: string
  width: number
  height: number
  /** Area to keep the object inside, as a fraction of each side, for banners that crop on some screens. */
  note?: string
}

const SIZES: Size[] = [
  { id: "x-header", label: "X header", width: 1500, height: 500 },
  { id: "youtube-banner", label: "YouTube banner", width: 2560, height: 1440, note: "keep it in the middle 1546×423" },
  { id: "linkedin-cover", label: "LinkedIn cover", width: 1584, height: 396 },
  { id: "twitch-offline", label: "Twitch offline screen", width: 1920, height: 1080 },
  { id: "twitch-banner", label: "Twitch profile banner", width: 1200, height: 480 },
  { id: "discord-banner", label: "Discord banner", width: 960, height: 540 },
  { id: "avatar", label: "Avatar", width: 1024, height: 1024 },
  { id: "phone-wallpaper", label: "Phone wallpaper", width: 1290, height: 2796 },
  { id: "desktop-wallpaper", label: "Desktop wallpaper", width: 3840, height: 2160 },
]

export default function ProfileKitPage() {
  const [name, setName] = useState("@meet")
  const [preset, setPreset] = useState("halo-5")
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [chosen, setChosen] = useState<string[]>(SIZES.map((size) => size.id))
  const [progress, setProgress] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})

  const word = name.trim().replace(/^@/, "").toUpperCase() || "NAME"

  const make = async (download: boolean) => {
    if (!engine) return
    const files: Array<{ name: string; data: Blob }> = []
    const urls: Record<string, string> = {}
    for (const size of SIZES.filter((entry) => chosen.includes(entry.id))) {
      setProgress(`Rendering ${size.label}…`)
      const blob = await engine.posterBlob(size.width, size.height, "image/png", 1)
      if (!blob) continue
      files.push({ name: `${word.toLowerCase()}-${size.id}-${size.width}x${size.height}.png`, data: blob })
      urls[size.id] = URL.createObjectURL(blob)
    }
    setPreviews((old) => {
      Object.values(old).forEach((url) => URL.revokeObjectURL(url))
      return urls
    })
    if (download && files.length) {
      setProgress("Zipping…")
      downloadBlob(await zip(files), `${word.toLowerCase()}-liquidforge-profile-kit.zip`)
    }
    setProgress(null)
  }

  return (
    <BetaShell slug="profile-kit" wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-rule">
            <LiquidCanvas object={{ type: "text", value: word, depth: 0.45, bevel: 0.03 }} preset={preset} onEngine={setEngine} style={{ height: 360, minHeight: 0 }} />
          </div>
          {Object.keys(previews).length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {SIZES.filter((size) => previews[size.id]).map((size) => (
                <figure key={size.id} className="overflow-hidden rounded-[var(--radius-sm)] border border-rule bg-ink-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previews[size.id]} alt={size.label} className="aspect-video w-full bg-ink object-contain" />
                  <figcaption className="truncate px-2 py-1 font-mono text-[10px] text-bone/55">{size.label}</figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <WordInput label="Name or handle" value={name} onChange={setName} max={16} />
            <PresetSelect value={preset} onChange={setPreset} />
          </div>
          <div className="rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-3">
            {SIZES.map((size) => (
              <label key={size.id} className="flex items-center gap-2 px-1 py-1.5 font-mono text-[11px] text-bone/70">
                <input
                  type="checkbox"
                  checked={chosen.includes(size.id)}
                  onChange={(event) => setChosen((list) => (event.target.checked ? [...list, size.id] : list.filter((id) => id !== size.id)))}
                />
                <span className="flex-1">{size.label}</span>
                <span className="text-bone/35 tabular-nums">
                  {size.width}×{size.height}
                </span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={!engine || progress !== null} onClick={() => make(false)} className="flex-1 rounded-[var(--radius-pill)] border border-rule px-4 py-2.5 font-mono text-[11px] text-bone/75 hover:border-rule-bright hover:text-bone disabled:opacity-40">
              Preview all
            </button>
            <button type="button" disabled={!engine || progress !== null || chosen.length === 0} onClick={() => make(true)} className="flex-1 rounded-[var(--radius-pill)] bg-bone px-4 py-2.5 font-mono text-[11px] text-ink hover:bg-bone-dim disabled:opacity-40">
              Download {chosen.length} as a zip
            </button>
          </div>
          {progress && <p className="font-mono text-[11px] text-bone/55">{progress}</p>}
          <p className="font-mono text-[10px] leading-relaxed text-bone/30">
            Every size is rendered at its own proportions and full resolution. Platforms crop some banners differently
            on phones — keep the name short and it stays in view.
          </p>
        </div>
      </div>
    </BetaShell>
  )
}
