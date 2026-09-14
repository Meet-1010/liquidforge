"use client"

import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { LiquidCanvas, resolvePreset, steer, type ObjectSource } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { LazyPreview } from "@/components/lazy-preview"
import { PresetSelect } from "@/components/look-picker"
import { codeFor, presetForLook, readKey, saveKey, type PackLook } from "@/lib/pack-client"

interface Pack {
  handle: string
  name: string
  looks: PackLook[]
  canEdit?: boolean
}

const SAMPLES: Array<[string, ObjectSource]> = [
  ["Sphere", { type: "shape", shape: "sphere" }],
  ["Knot", { type: "shape", shape: "torusknot" }],
  ["Word", { type: "text", value: "LIQUID", depth: 0.45, bevel: 0.03 }],
]

export default function PackPage() {
  return (
    <BetaShell slug="packs" wide>
      <PackView />
    </BetaShell>
  )
}

function PackView() {
  const params = useParams<{ handle: string }>()
  const handle = decodeURIComponent(params.handle ?? "").replace(/^@/, "").toLowerCase()
  const [pack, setPack] = useState<Pack | null>(null)
  const [missing, setMissing] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState("")
  const [sample, setSample] = useState(0)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (withKey: string | null) => {
      const response = await fetch(`/api/packs/${handle}`, withKey ? { headers: { authorization: `Bearer ${withKey}` } } : undefined)
      if (response.status === 404) return setMissing(true)
      const body = (await response.json()) as Pack
      setPack(body)
      return body
    },
    [handle],
  )

  useEffect(() => {
    const stored = readKey(handle)
    void load(stored).then((body) => {
      if (stored && body?.canEdit) setKey(stored)
    })
  }, [handle, load])

  const take = async (entry: PackLook, target: "react" | "html") => {
    await navigator.clipboard?.writeText(codeFor(entry, SAMPLES[sample][1], target))
    setCopied(`${entry.slug}:${target}`)
    setTimeout(() => setCopied(null), 1600)
    // The credit: one use each time a look's code is taken.
    void fetch(`/api/packs/${handle}/${entry.slug}`, { method: "POST" }).then(() => load(key))
  }

  // -- the editor -------------------------------------------------------------------
  const [title, setTitle] = useState("")
  const [base, setBase] = useState("mercury-3")
  const [energy, setEnergy] = useState(0)
  const [warmth, setWarmth] = useState(0)
  const [palette, setPalette] = useState<string[] | null>(null)
  const draft = useMemo(() => {
    const steered = steer(resolvePreset(base), { energy, warmth })
    return palette ? { ...steered, palette } : steered
  }, [base, energy, warmth, palette])
  useEffect(() => setPalette(null), [base, energy, warmth])

  const save = async () => {
    if (!key) return
    setError(null)
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32)
    const response = await fetch(`/api/packs/${handle}/${slug || "look"}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ title, preset: base, look: { family: draft.family, palette: draft.palette, surface: draft.surface, shading: draft.shading, background: draft.background } }),
    })
    const body = await response.json()
    if (!response.ok) return setError(body.error ?? "That look couldn't be saved.")
    setTitle("")
    void load(key)
  }

  const remove = async (slug: string) => {
    if (!key) return
    await fetch(`/api/packs/${handle}/${slug}`, { method: "DELETE", headers: { authorization: `Bearer ${key}` } })
    void load(key)
  }

  if (missing) return <p className="text-[14px] text-bone/60">No pack has the handle @{handle}.</p>
  if (!pack) return <p className="font-mono text-[11px] text-bone/40">Reading the pack…</p>
  const total = pack.looks.reduce((sum, entry) => sum + entry.uses, 0)

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[12px] text-bone/50">@{pack.handle}</p>
          <h2 className="display text-[clamp(2rem,5vw,3rem)] leading-none">{pack.name}</h2>
          <p className="mt-2 font-mono text-[11px] text-bone/45">
            {pack.looks.length} look{pack.looks.length === 1 ? "" : "s"} · used {total} time{total === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-1.5">
          {SAMPLES.map(([label], index) => (
            <button
              key={label}
              type="button"
              onClick={() => setSample(index)}
              className={`rounded-[var(--radius-pill)] border px-2.5 py-1 font-mono text-[10px] ${sample === index ? "border-bone bg-bone text-ink" : "border-rule text-bone/60 hover:text-bone"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {pack.looks.length === 0 ? (
        <p className="text-[14px] text-bone/60">No looks in this pack yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pack.looks.map((entry) => (
            <div key={entry.slug} className="overflow-hidden rounded-[var(--radius-md)] border border-rule">
              <LazyPreview key={sample} preset={presetForLook(entry)} object={SAMPLES[sample][1]} height={190} />
              <div className="space-y-2 px-3 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] text-bone">{entry.title}</span>
                  <span className="font-mono text-[10px] text-bone/40">{entry.uses} use{entry.uses === 1 ? "" : "s"}</span>
                </div>
                <p className="font-mono text-[10px] text-bone/35">@{pack.handle}/{entry.slug}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["react", "html"] as const).map((target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => void take(entry, target)}
                      className="rounded-[var(--radius-pill)] border border-rule px-2.5 py-1 font-mono text-[10px] text-bone/75 hover:text-bone"
                    >
                      {copied === `${entry.slug}:${target}` ? "Copied" : target === "react" ? "Copy React" : "Copy HTML"}
                    </button>
                  ))}
                  {key && (
                    <button type="button" onClick={() => void remove(entry.slug)} className="ml-auto font-mono text-[10px] text-bone/35 hover:text-[#ff8a7a]">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {key ? (
        <section className="grid gap-5 rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-5 lg:grid-cols-[1fr_20rem]">
          <div className="relative h-72 overflow-hidden rounded-[var(--radius-md)] border border-rule bg-ink">
            <LiquidCanvas object={SAMPLES[sample][1]} preset={draft} style={{ position: "absolute", inset: 0, minHeight: 0 }} />
          </div>
          <div className="space-y-3">
            <h3 className="display text-[1.5rem]">Add a look</h3>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[11px] text-bone/55">Name</span>
              <input
                value={title}
                maxLength={40}
                placeholder="Sunset"
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none placeholder:text-bone/25 focus:border-bone"
              />
            </label>
            <PresetSelect value={base} onChange={setBase} label="Start from" />
            {([["Calm ↔ loud", energy, setEnergy], ["Cool ↔ warm", warmth, setWarmth]] as const).map(([label, value, set]) => (
              <label key={label} className="block">
                <span className="mb-1 flex justify-between font-mono text-[10px] text-bone/50">
                  {label} <span className="tabular-nums text-bone/30">{value.toFixed(2)}</span>
                </span>
                <input type="range" min={-1} max={1} step={0.05} value={value} onChange={(event) => set(Number(event.target.value))} />
              </label>
            ))}
            <div>
              <p className="mb-1.5 font-mono text-[10px] text-bone/50">Palette</p>
              <div className="flex flex-wrap gap-1.5">
                {draft.palette.map((colour, index) => (
                  <input
                    key={index}
                    type="color"
                    value={colour}
                    aria-label={`Palette colour ${index + 1}`}
                    onChange={(event) => setPalette(draft.palette.map((existing, i) => (i === index ? event.target.value : existing)))}
                    className="h-8 w-8 cursor-pointer rounded-full border border-rule bg-transparent"
                  />
                ))}
              </div>
            </div>
            <button type="button" disabled={title.trim().length < 2} onClick={() => void save()} className="w-full rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[12px] text-ink hover:bg-bone-dim disabled:opacity-40">
              Publish to @{pack.handle}
            </button>
            {error && <p role="alert" className="font-mono text-[11px] text-[#ff8a7a]">{error}</p>}
          </div>
        </section>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const candidate = keyInput.trim()
            void load(candidate).then((body) => {
              if (body?.canEdit) {
                saveKey(handle, candidate)
                setKey(candidate)
              } else setError("That edit key doesn't match this pack.")
            })
          }}
        >
          <label className="block">
            <span className="mb-1.5 block font-mono text-[11px] text-bone/45">Your pack? Enter its edit key to add looks</span>
            <input
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              className="w-72 rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none focus:border-bone"
            />
          </label>
          <button type="submit" className="rounded-[var(--radius-pill)] border border-rule px-3 py-2 font-mono text-[11px] text-bone/75 hover:text-bone">
            Unlock
          </button>
          {error && <p role="alert" className="w-full font-mono text-[11px] text-[#ff8a7a]">{error}</p>}
        </form>
      )}
    </div>
  )
}
