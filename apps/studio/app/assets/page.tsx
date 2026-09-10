"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { configFromPreset, encodeState } from "liquidforge/codegen"
import { fetchSketchfabMetadata, HEAVY_POLYCOUNT, PROVIDERS, searchAssets, TOTAL_ASSETS } from "@/lib/catalog"
import type { AssetResult, ProviderId, SearchOutcome } from "@/lib/catalog"
import { SiteNav } from "@/components/site-nav"
import { Button } from "@/components/ui"

/**
 * Find something to make liquid.
 *
 * Five open catalogues, searched in the browser with no key and no proxy —
 * every one of them serves `Access-Control-Allow-Origin: *`, which is the only
 * reason this page can exist without a backend.
 *
 * The advice on the page is deliberately about **silhouette**. A liquid surface
 * reflects an environment; it has almost no interior detail to spend, so a
 * shape recognisable from its outline survives and a cluttered scene does not.
 * That is a different brief from a texture-mapped viewer, and picking on it is
 * the difference between a good import and a grey blob.
 */

const ALL: ProviderId[] = ["objaverse", "polyhaven", "threejs", "khronos", "sketchfab"]

/** Big enough that scrolling feels continuous, small enough to stay responsive. */
const PAGE = 48

/**
 * The bento rhythm.
 *
 * A uniform grid of 46,000 thumbnails is a spreadsheet. Varying the tile sizes
 * on a fixed repeating pattern — rather than at random — gives the page a shape
 * you can scan without it changing under you as more results load, which is
 * exactly what a random pattern would do on every page append.
 */
const BENTO = [
  "sm:col-span-2 sm:row-span-2",
  "",
  "",
  "sm:row-span-2",
  "",
  "sm:col-span-2",
  "",
  "",
]

export default function AssetsPage() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [providers, setProviders] = useState<ProviderId[]>(ALL)
  const [results, setResults] = useState<AssetResult[]>([])
  const [outcome, setOutcome] = useState<Pick<SearchOutcome, "total" | "failed"> | null>(null)
  const [loading, setLoading] = useState(false)
  const [exhausted, setExhausted] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const pending = useRef(false)

  /**
   * One page at a time, appended.
   *
   * `reset` starts a new search; without it this is the next page of the
   * current one. The whole catalogue is reachable this way — the offset walks
   * all 46,207 rather than a first slice, which is what the previous version
   * capped at and could never scroll past.
   */
  const run = useCallback(
    async (nextQuery: string, nextProviders: ProviderId[], reset: boolean) => {
      if (pending.current) return
      pending.current = true
      setLoading(true)
      try {
        const offset = reset ? 0 : results.length
        const page = await searchAssets({
          query: nextQuery,
          providers: nextProviders,
          offset,
          limit: PAGE,
        })
        setOutcome({ total: page.total, failed: page.failed })
        setResults((current) => (reset ? page.results : [...current, ...page.results]))
        setExhausted(page.results.length < PAGE)
      } catch {
        setOutcome({ total: 0, failed: [] })
        if (reset) setResults([])
        setExhausted(true)
      } finally {
        setLoading(false)
        pending.current = false
      }
    },
    [results.length],
  )

  // Seed with something on screen rather than an empty page.
  useEffect(() => {
    void run("", ALL, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Infinite scroll, with the button below as the fallback for anyone whose
  // browser or settings make the observer unreliable.
  useEffect(() => {
    const element = sentinel.current
    if (!element || exhausted || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void run(query, providers, false)
      },
      { rootMargin: "600px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [exhausted, query, providers, run])

  const toggle = (id: ProviderId) => {
    const next = providers.includes(id)
      ? providers.filter((entry) => entry !== id)
      : [...providers, id]
    setProviders(next)
    void run(query, next, true)
  }

  /**
   * Hand a model to the Studio as a share link, so it opens already loaded.
   *
   * Encoded with `encodeState` rather than by hand: the Studio decodes with the
   * matching `decodeState`, and two base64url implementations that disagree by
   * one padding character is a bug nobody enjoys finding.
   */
  const sendToStudio = (asset: AssetResult, url: string) => {
    router.push(
      `/studio?c=${encodeState(configFromPreset("mercury-1", { type: "model", src: url }))}`,
    )
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-5">
        <header className="mb-8">
          <p className="label mb-3">01 — Assets</p>
          <h1 className="display text-[clamp(2.2rem,6vw,3.6rem)]">
            {TOTAL_ASSETS.toLocaleString()} models to melt.
          </h1>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-bone-dim">
            Five open catalogues, searched from your browser — no key, no account, no server.
            Pick something with a <strong className="text-bone">clean silhouette</strong>: the
            liquid surface reflects an environment rather than carrying detail, so an outline you
            can read at a glance survives the treatment and a cluttered scene turns to soup.
          </p>
        </header>

        <form
          className="mb-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run(query, providers, true)
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="skull, helmet, bottle, statue…"
            className="w-full rounded-[var(--radius-pill)] border border-rule bg-ink-2 px-4 py-2.5 font-mono text-[12px] text-bone outline-none placeholder:text-bone/25 focus:border-bone"
          />
          <Button variant="primary" onClick={() => void run(query, providers, true)}>
            Search
          </Button>
        </form>

        <div className="mb-8 flex flex-wrap gap-1.5">
          {PROVIDERS.map((provider) => {
            const on = providers.includes(provider.id)
            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => toggle(provider.id)}
                title={`${provider.blurb} — ${provider.license}`}
                className={`rounded-[var(--radius-pill)] border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                  on
                    ? "border-bone bg-bone text-ink"
                    : "border-rule text-bone/45 hover:border-rule-bright hover:text-bone"
                }`}
              >
                {provider.label}
                <span className={on ? "ml-1.5 text-ink/50" : "ml-1.5 text-bone/25"}>
                  {provider.size}
                </span>
              </button>
            )
          })}
        </div>

        {outcome?.failed.map((failure) => (
          <p key={failure.provider} className="mb-2 font-mono text-[11px] text-bone/35">
            {failure.provider} didn&apos;t answer: {failure.message}
          </p>
        ))}

        {!loading && results.length === 0 && (
          <p className="font-mono text-[12px] text-bone/45">
            Nothing matched. Try a broader word — the Objaverse index is searched by category
            name, so &ldquo;chair&rdquo; finds more than &ldquo;eames lounge chair&rdquo;.
          </p>
        )}

        <div className="grid auto-rows-[168px] grid-cols-2 gap-3 [grid-auto-flow:dense] sm:grid-cols-3 lg:grid-cols-4">
          {results.map((asset, index) => (
            <AssetCard
              key={`${asset.provider}-${asset.id}-${index}`}
              asset={asset}
              onSend={sendToStudio}
              span={BENTO[index % BENTO.length]}
            />
          ))}
        </div>

        <div ref={sentinel} className="h-px" aria-hidden />

        <div className="mt-8 flex flex-col items-center gap-3">
          {loading && <p className="font-mono text-[11px] text-muted">Loading…</p>}
          {!loading && !exhausted && (
            <Button onClick={() => void run(query, providers, false)}>Load more</Button>
          )}
          {outcome && (
            <p className="font-mono text-[11px] text-muted">
              {exhausted
                ? `That is all ${outcome.total.toLocaleString()} of them.`
                : `${results.length.toLocaleString()} of ${outcome.total.toLocaleString()}`}
            </p>
          )}
        </div>
      </main>
    </>
  )
}

function AssetCard({
  asset,
  onSend,
  span,
}: {
  asset: AssetResult
  onSend: (asset: AssetResult, url: string) => void
  /** Which bento cell shape this tile takes. */
  span: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [meta, setMeta] = useState<Partial<AssetResult> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Objaverse knows only a category up front. Enriching on intersection rather
  // than up front keeps a broad search from firing thousands of requests.
  useEffect(() => {
    if (!asset.enrich || meta) return
    const element = ref.current
    if (!element || typeof IntersectionObserver === "undefined") return

    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return
      observer.disconnect()
      void fetchSketchfabMetadata(asset.id).then((data) => data && setMeta(data))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [asset.enrich, asset.id, meta])

  const merged = useMemo(() => ({ ...asset, ...(meta ?? {}) }), [asset, meta])
  const heavy = (merged.polycount ?? 0) > HEAVY_POLYCOUNT

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      onSend(merged, await asset.resolveModelUrl())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resolve a file")
      setBusy(false)
    }
  }

  return (
    <div
      ref={ref}
      className={`group relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink-2 ${span}`}
    >
      <div className="relative m-1.5 flex-1 overflow-hidden rounded-[var(--radius-md)] bg-ink">
        {merged.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={merged.thumbnail}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          /* Not every Objaverse uid still exists on Sketchfab, so some will
             never have a picture. A tinted initial beats a broken frame. */
          <div className="grid h-full place-items-center bg-ink-3">
            <span className="font-mono text-[22px] text-bone/12">
              {merged.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 px-3 pb-3">
        <p className="truncate font-mono text-[11px] text-bone/80" title={merged.name}>
          {merged.name}
        </p>
        <p className="truncate font-mono text-[10px] text-muted">
          {merged.author ?? PROVIDERS.find((p) => p.id === asset.provider)?.label}
        </p>
        {/* Shown verbatim, never inferred — a licence is the one thing it is not
            acceptable to guess at on the user's behalf. */}
        <p className="truncate font-mono text-[10px] text-bone/30" title={merged.license}>
          {merged.license}
        </p>

        {heavy && (
          <p className="font-mono text-[10px] text-bone/35">
            {Math.round((merged.polycount ?? 0) / 1000)}k tris — clustered down on import, and
            the cursor probe falls back to the bounding sphere
          </p>
        )}
        {merged.animated && (
          <p className="font-mono text-[10px] text-bone/35">rigged — the animation is dropped</p>
        )}
        {error && <p className="font-mono text-[10px] text-bone/45">{error}</p>}

        <div className="flex items-center gap-2 pt-1.5">
          {asset.importable ? (
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="rounded-[var(--radius-pill)] bg-bone px-3 py-1.5 font-mono text-[10px] text-ink transition-colors hover:bg-bone-dim disabled:opacity-40"
            >
              {busy ? "Loading…" : "Use it"}
            </button>
          ) : (
            <span className="font-mono text-[10px] text-bone/30">Download at source</span>
          )}
          <a
            href={merged.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] text-muted hover:text-bone"
          >
            Source
          </a>
        </div>
      </div>
    </div>
  )
}
