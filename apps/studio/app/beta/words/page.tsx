"use client"

import { useEffect, useState } from "react"
import { LiquidCanvas, type LiquidEngine, type ObjectSource } from "liquidforge"
import { searchAssets, type AssetResult } from "@/lib/catalog"
import { BetaShell } from "@/components/beta-shell"
import { ClipFrame, ClipPanel, useClipSettings } from "@/components/clip-panel"
import { PresetSelect } from "@/components/look-picker"

/**
 * Words into an object, for free.
 *
 * Text-to-3D models cost money per generation and a queue to run. For a liquid
 * surface the thing that matters is the silhouette, and the web already has
 * hundreds of thousands of silhouettes with names: open icon sets, served by
 * Iconify's free API with no key, and forty-six thousand open 3D models. Type
 * "octopus" and pick one; the SVG forge extrudes an icon, the model forge loads
 * a model.
 */

interface Icon {
  id: string
  url: string
  set: string
  license: string
}

// Filled, single-colour sets extrude cleanly; outline sets extrude as wireframes.
const PREFERRED = ["game-icons", "mdi", "material-symbols", "ph", "fa6-solid", "fluent", "tabler", "boxicons", "streamline", "fluent-emoji-high-contrast"]
const score = (id: string) => {
  const [set, name] = id.split(":")
  let value = PREFERRED.indexOf(set)
  value = value < 0 ? 40 : value
  if (/(filled|fill|solid|-bold)$/.test(name)) value -= 12
  if (/(outline|line|light|thin|duotone|twotone)/.test(name)) value += 25
  if (/(color|flat|emoji|noto|twemoji|openmoji|logos)/.test(set)) value += 30
  return value
}

export default function WordsPage() {
  const [query, setQuery] = useState("octopus")
  const [icons, setIcons] = useState<Icon[]>([])
  const [models, setModels] = useState<AssetResult[]>([])
  const [loading, setLoading] = useState(false)
  const [object, setObject] = useState<ObjectSource>({ type: "svg", src: "https://api.iconify.design/game-icons/octopus.svg", depth: 0.4 })
  const [credit, setCredit] = useState("Octopus · Game Icons · CC BY 3.0")
  const [preset, setPreset] = useState("mercury-3")
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [settings, setSettings] = useClipSettings({ seconds: 5 })
  const [showSafe, setShowSafe] = useState(false)

  const search = async (words: string) => {
    if (!words.trim()) return
    setLoading(true)
    try {
      const response = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(words.trim())}&limit=96`)
      const data = (await response.json()) as { icons: string[]; collections: Record<string, { name: string; license?: { title?: string } }> }
      const found = [...data.icons]
        .sort((a, b) => score(a) - score(b))
        .slice(0, 24)
        .map((id) => {
          const [set, name] = id.split(":")
          const collection = data.collections[set]
          return { id, url: `https://api.iconify.design/${set}/${name}.svg`, set: collection?.name ?? set, license: collection?.license?.title ?? "see source" }
        })
      setIcons(found)
      const assets = await searchAssets({ query: words.trim(), providers: ["khronos", "polyhaven", "objaverse"], offset: 0, limit: 6 }).catch(() => null)
      setModels((assets?.results ?? []).filter((asset) => asset.importable && asset.thumbnail).slice(0, 6))
    } catch {
      setIcons([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void search("octopus")
  }, [])

  return (
    <BetaShell slug="words" wide>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        <div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void search(query)
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="an octopus, a rocket, a crown…"
              className="min-w-0 flex-1 rounded-[var(--radius-pill)] border border-rule bg-ink-2 px-4 py-2.5 font-mono text-[12px] text-bone outline-none placeholder:text-bone/25 focus:border-bone"
            />
            <button type="submit" className="rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink hover:bg-bone-dim">
              {loading ? "Finding…" : "Find"}
            </button>
          </form>

          <p className="mt-5 mb-2 font-mono text-[11px] text-bone/55">Silhouettes</p>
          <div className="grid grid-cols-6 gap-1.5">
            {icons.map((icon) => (
              <button
                key={icon.id}
                type="button"
                title={`${icon.id} · ${icon.set} · ${icon.license}`}
                onClick={() => {
                  setObject({ type: "svg", src: icon.url, depth: 0.4 })
                  setCredit(`${icon.id.split(":")[1]} · ${icon.set} · ${icon.license}`)
                }}
                className="grid aspect-square place-items-center rounded-[var(--radius-sm)] border border-rule bg-bone p-2 transition-colors hover:border-bone"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={icon.url} alt={icon.id} className="h-full w-full object-contain" loading="lazy" />
              </button>
            ))}
          </div>
          {!loading && icons.length === 0 && <p className="font-mono text-[11px] text-bone/35">No icons for that — try a simpler noun.</p>}

          {models.length > 0 && (
            <>
              <p className="mt-5 mb-2 font-mono text-[11px] text-bone/55">3D models</p>
              <div className="grid grid-cols-3 gap-1.5">
                {models.map((model) => (
                  <button
                    key={`${model.provider}-${model.id}`}
                    type="button"
                    onClick={async () => {
                      setObject({ type: "model", src: await model.resolveModelUrl() })
                      setCredit(`${model.name} · ${model.author ?? model.provider} · ${model.license}`)
                    }}
                    className="overflow-hidden rounded-[var(--radius-sm)] border border-rule text-left transition-colors hover:border-bone"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={model.thumbnail} alt="" className="aspect-video w-full bg-ink-3 object-contain" loading="lazy" />
                    <p className="truncate px-2 py-1 font-mono text-[10px] text-bone/60">{model.name}</p>
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="mt-4 font-mono text-[10px] leading-relaxed text-bone/30">
            Icons come from open sets via Iconify; each carries its own licence, shown on hover. Credit the set when a
            licence asks you to.
          </p>
        </div>

        <div className="space-y-4">
          <ClipFrame format={settings.format} showSafe={showSafe} maxHeight={420}>
            <LiquidCanvas object={object} preset={preset} motion={{ autoRotate: 0.2 }} onEngine={setEngine} style={{ position: "absolute", inset: 0, minHeight: 0 }} />
          </ClipFrame>
          <p className="truncate font-mono text-[10px] text-bone/40" title={credit}>
            {credit}
          </p>
          <PresetSelect value={preset} onChange={setPreset} />
          <ClipPanel engine={engine} settings={settings} onChange={setSettings} showSafe={showSafe} onShowSafe={setShowSafe} fileName={`liquidforge-${query.replace(/\W+/g, "-")}`} />
        </div>
      </div>
    </BetaShell>
  )
}
