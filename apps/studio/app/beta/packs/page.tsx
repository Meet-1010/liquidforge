"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { resolvePreset } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { LazyPreview } from "@/components/lazy-preview"
import { saveKey } from "@/lib/pack-client"
import type { Look } from "@/lib/store/types"

interface PackSummary {
  handle: string
  name: string
  looks: number
  uses: number
  cover: { preset: string; look: Look } | null
}

export default function PacksPage() {
  return (
    <BetaShell slug="packs" wide>
      <PacksIndex />
    </BetaShell>
  )
}

function PacksIndex() {
  const [packs, setPacks] = useState<PackSummary[] | null>(null)
  const [handle, setHandle] = useState("")
  const [name, setName] = useState("")
  const [claimed, setClaimed] = useState<{ handle: string; key: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void fetch("/api/packs")
      .then((response) => response.json())
      .then((body) => setPacks(body.packs ?? []))
      .catch(() => setPacks([]))
  }, [])

  const claim = async () => {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/packs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle, name }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      saveKey(body.handle, body.key)
      setClaimed({ handle: body.handle, key: body.key })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That handle couldn't be claimed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-10">
      <section className="rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-5">
        <h2 className="display text-[1.8rem]">Start your pack</h2>
        {claimed ? (
          <div className="mt-3 space-y-3">
            <p className="text-[14px] text-bone/75">
              <span className="font-mono">@{claimed.handle}</span> is yours. This is its edit key — the only way to change the pack. It has been saved in this
              browser; copy it somewhere safe too, because it won&apos;t be shown again.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone">{claimed.key}</code>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard?.writeText(claimed.key).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1600)
                  })
                }
                className="rounded-[var(--radius-pill)] border border-rule px-3 py-2 font-mono text-[11px] text-bone/75 hover:text-bone"
              >
                {copied ? "Copied" : "Copy key"}
              </button>
            </div>
            <Link href={`/beta/packs/${claimed.handle}`} className="inline-block rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[12px] text-ink hover:bg-bone-dim">
              Add your first look →
            </Link>
          </div>
        ) : (
          <form
            className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              void claim()
            }}
          >
            <label className="block">
              <span className="mb-1.5 block font-mono text-[11px] text-bone/55">Handle</span>
              <input
                value={handle}
                maxLength={25}
                placeholder="@yourname"
                onChange={(event) => setHandle(event.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none placeholder:text-bone/25 focus:border-bone"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block font-mono text-[11px] text-bone/55">Pack name</span>
              <input
                value={name}
                maxLength={40}
                placeholder="Sunset chrome"
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none placeholder:text-bone/25 focus:border-bone"
              />
            </label>
            <button type="submit" disabled={busy} className="rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[12px] text-ink hover:bg-bone-dim disabled:opacity-40">
              {busy ? "Claiming…" : "Claim it"}
            </button>
          </form>
        )}
        {error && <p role="alert" className="mt-3 font-mono text-[11px] text-[#ff8a7a]">{error}</p>}
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-bone/35">
          No account: the handle is protected by its key. Packs, their looks and their use counts are public.
        </p>
      </section>

      <section>
        <h2 className="display mb-3 text-[1.8rem]">Packs</h2>
        {packs === null ? (
          <p className="font-mono text-[11px] text-bone/40">Reading packs…</p>
        ) : packs.length === 0 ? (
          <p className="text-[14px] text-bone/60">No packs have looks in them yet. The first one is yours to make.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {packs.map((pack) => (
              <Link key={pack.handle} href={`/beta/packs/${pack.handle}`} className="w-48 overflow-hidden rounded-[var(--radius-md)] border border-rule transition-colors hover:border-rule-bright">
                {pack.cover && <LazyPreview preset={resolvePreset(pack.cover.preset, pack.cover.look)} object={{ type: "shape", shape: "sphere" }} height={130} />}
                <span className="block px-3 py-2">
                  <span className="block truncate text-[14px] text-bone">{pack.name}</span>
                  <span className="block font-mono text-[10px] text-bone/45">
                    @{pack.handle} · {pack.looks} look{pack.looks === 1 ? "" : "s"} · {pack.uses} use{pack.uses === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
