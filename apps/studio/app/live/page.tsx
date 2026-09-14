"use client"

import { useEffect, useMemo, useState } from "react"
import { COLLECTIONS, LiquidCanvas, PRESETS, presetName, useLiveNumber, type LiquidData, type LiquidEngine } from "liquidforge"
import { SiteNav } from "@/components/site-nav"
import { CopyButton, Segmented } from "@/components/ui"

/**
 * A hero that follows a number.
 *
 * The point of binding a look to data is that a number becomes something you
 * notice without reading it: a launch page that visibly heats up as sign-ups
 * arrive, a repository whose logo erupts the moment it passes a hundred
 * thousand stars. This page is the three ways to feed it — a slider to feel the
 * mapping, a repository's stars, or any JSON endpoint — and the code for each.
 */

type Source = "manual" | "github" | "json"

const LOUD = "__loud__"

function roundUp(value: number) {
  if (value <= 0) return 100
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (step * magnitude > value) return step * magnitude
  }
  return 10 * magnitude
}

export default function LivePage() {
  const [source, setSource] = useState<Source>("manual")
  const [manual, setManual] = useState(35)
  const [repo, setRepo] = useState("vercel/next.js")
  const [jsonUrl, setJsonUrl] = useState("https://api.github.com/repos/facebook/react")
  const [jsonPath, setJsonPath] = useState("stargazers_count")
  const [to, setTo] = useState("magma-4")
  const [base, setBase] = useState("mercury-3")
  const [word, setWord] = useState("LIVE")
  const [engine, setEngine] = useState<LiquidEngine | null>(null)

  const github = useLiveNumber(source === "github" && /^[\w.-]+\/[\w.-]+$/.test(repo) ? `https://api.github.com/repos/${repo}` : null, {
    path: "stargazers_count",
    every: 60_000,
  })
  const fetched = useLiveNumber(source === "json" && /^https:\/\//.test(jsonUrl) ? jsonUrl : null, { path: jsonPath || undefined, every: 30_000 })

  const value = source === "manual" ? manual : source === "github" ? github : fetched

  // For a live number, frame it: from a little below to the next round figure,
  // with that figure as the milestone.
  const range = useMemo(() => {
    if (source === "manual") return { min: 0, max: 100, milestones: [50, 90] }
    if (value === undefined) return { min: 0, max: 100, milestones: [] }
    const max = roundUp(value)
    return { min: Math.floor(max * 0.6), max, milestones: [max] }
  }, [source, value])

  const data: LiquidData | undefined =
    value === undefined
      ? undefined
      : { value, min: range.min, max: range.max, milestones: range.milestones, ...(to !== LOUD ? { to } : {}) }

  // Before a real milestone arrives, a way to see what one looks like.
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 1200)
    return () => clearTimeout(timer)
  }, [armed])

  const reactCode =
    source === "manual"
      ? `<LiquidHero
  object={{ type: "text", value: "${word}" }}
  preset="${base}"
  data={{ value: signupsToday, min: 0, max: 100, milestones: [50, 90]${to !== LOUD ? `, to: "${to}"` : ""} }}
/>`
      : `import { LiquidHero, useLiveNumber } from "liquidforge"

export function Hero() {
  const value = useLiveNumber(${JSON.stringify(source === "github" ? `https://api.github.com/repos/${repo}` : jsonUrl)}, { path: ${JSON.stringify(source === "github" ? "stargazers_count" : jsonPath)} })
  return (
    <LiquidHero
      object={{ type: "text", value: "${word}" }}
      preset="${base}"
      data={value === undefined ? undefined : { value, min: ${range.min}, max: ${range.max}, milestones: [${range.milestones.join(", ")}]${to !== LOUD ? `, to: "${to}"` : ""} }}
    />
  )
}`

  const elementCode = `<script src="https://cdn.jsdelivr.net/npm/liquidforge@0.1/dist/element.global.js" defer></script>
<liquid-forge
  text="${word}"
  preset="${base}"
  ${source === "manual" ? `value="${manual}"` : `value-src="${source === "github" ? `https://api.github.com/repos/${repo}` : jsonUrl}"\n  value-path="${source === "github" ? "stargazers_count" : jsonPath}"`}
  value-min="${range.min}"
  value-max="${range.max}"
  milestones="${range.milestones.join(",")}"${to !== LOUD ? `\n  value-to="${to}"` : ""}
  style="display:block;height:480px"
></liquid-forge>`

  const colourways = COLLECTIONS.flatMap((collection) =>
    collection.colourways.map((_, index) => `${collection.name.toLowerCase()}-${index + 1}`),
  )
  const label = (id: string) => `${PRESETS[id]?.label ?? id} · ${presetName(id) ?? ""}`

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-5">
        <header className="mb-10 max-w-2xl">
          <p className="label mb-3">01 — Live</p>
          <h1 className="display text-[clamp(2.2rem,6vw,3.6rem)]">A hero that follows a number.</h1>
          <p className="mt-4 text-[13px] leading-relaxed text-bone-dim">
            Bind the look to anything that counts — sign-ups today, stars, a price. As the number climbs, the
            surface moves toward another colourway or simply gets louder, and the moment it passes a milestone
            it erupts. Nobody has to read the number to notice it changed.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-rule">
              <LiquidCanvas
                object={{ type: "text", value: word || "LIVE", depth: 0.45, bevel: 0.03 }}
                preset={base}
                data={data}
                onEngine={setEngine}
                style={{ height: 440, minHeight: 0 }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[12px] text-bone/70 tabular-nums">
                {value === undefined ? "Waiting for the first reading…" : `${Math.round(value).toLocaleString()} `}
                {value !== undefined && (
                  <span className="text-bone/35">
                    on a scale of {range.min.toLocaleString()}–{range.max.toLocaleString()}
                    {range.milestones.length ? ` · milestone ${range.milestones.map((m) => m.toLocaleString()).join(", ")}` : ""}
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  engine?.splash(1.2)
                  setArmed(true)
                }}
                className="rounded-[var(--radius-pill)] border border-rule px-3 py-1.5 font-mono text-[11px] text-bone/70 transition-colors hover:border-rule-bright hover:text-bone"
              >
                {armed ? "Splash!" : "Preview a milestone"}
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <Segmented
              label="Where the number comes from"
              value={source}
              onChange={setSource}
              options={[
                { value: "manual" as const, label: "A slider" },
                { value: "github" as const, label: "GitHub stars" },
                { value: "json" as const, label: "Any JSON" },
              ]}
            />

            {source === "manual" && (
              <label className="block">
                <span className="mb-1.5 flex justify-between font-mono text-[11px] text-bone/55">
                  <span>Value</span>
                  <span className="text-bone/30 tabular-nums">{manual}</span>
                </span>
                <input type="range" min={0} max={100} step={1} value={manual} onChange={(event) => setManual(Number(event.target.value))} />
                <span className="mt-1 block font-mono text-[10px] text-bone/30">Drag past 50 and 90 — those are the milestones.</span>
              </label>
            )}
            {source === "github" && (
              <Text label="Repository" value={repo} onChange={setRepo} placeholder="owner/name" hint="Public repositories; GitHub allows about sixty reads an hour without a token." />
            )}
            {source === "json" && (
              <>
                <Text label="JSON URL" value={jsonUrl} onChange={setJsonUrl} placeholder="https://…" hint="It has to allow cross-origin requests." />
                <Text label="Path to the number" value={jsonPath} onChange={setJsonPath} placeholder="data.count" />
              </>
            )}

            <Text label="Word" value={word} onChange={(v) => setWord(v.slice(0, 12))} />

            <Pick label="Look at the bottom" value={base} onChange={setBase} options={colourways.map((id) => ({ value: id, label: label(id) }))} />
            <Pick
              label="Look at the top"
              value={to}
              onChange={setTo}
              options={[{ value: LOUD, label: "The same, only louder" }, ...colourways.map((id) => ({ value: id, label: label(id) }))]}
            />
          </div>
        </div>

        <section className="mt-12 grid gap-4 lg:grid-cols-2">
          <CodeBlock title="React" code={reactCode} />
          <CodeBlock title="Webflow, Framer or any HTML" code={elementCode} />
        </section>
      </main>
    </>
  )
}

function Text({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] text-bone/55">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none placeholder:text-bone/25 focus:border-bone"
      />
      {hint && <span className="mt-1 block font-mono text-[10px] text-bone/30">{hint}</span>}
    </label>
  )
}

function Pick({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] text-bone/55">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none focus:border-bone"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink-2">
      <div className="flex items-center justify-between border-b border-rule px-4 py-2.5">
        <p className="font-mono text-[11px] text-bone/60">{title}</p>
        <CopyButton text={code} label="Copy" />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-bone/75">{code}</pre>
    </div>
  )
}
