"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
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
 * Aspect ratios for results with no picture.
 *
 * Chosen from the id so a given model always gets the same one — a random
 * shape would move the tile every time the layout was recomputed.
 */
const PLACEHOLDER_ASPECTS = [1.25, 0.95, 1.1, 0.8, 1.05]

/**
 * Thumbnails are trimmed renders, so their proportions run from a sliver to a
 * banner. Inside this range a tile keeps the picture's shape; outside it the
 * picture is letterboxed in a tile that is still a sensible size.
 */
const MIN_ASPECT = 0.62
const MAX_ASPECT = 2.2

/** How long one slow thumbnail may hold up the tiles after it. */
const MEASURE_TIMEOUT_MS = 1400

/**
 * Everything in a card that is not the picture — border, inset, the four text
 * lines and the buttons — which is the same height on every card. Measured, not
 * guessed: an estimate that is off accumulates per card and leaves the columns
 * visibly ragged at the bottom.
 */
const CARD_CHROME = 134
/** Border and inset either side of the picture. */
const CARD_INSET = 14
const GAP = 12

/** The number of columns at each breakpoint, as the Tailwind classes this replaced had it. */
function columnsFor(width: number) {
  return width >= 1280 ? 5 : width >= 1024 ? 4 : width >= 640 ? 3 : 2
}

interface Placed {
  asset: AssetResult
  aspect: number
  key: string
}

const aspectCache = new Map<string, Promise<number>>()

/**
 * The shape a tile will have, known before it is put on the page.
 *
 * This is what stops the board moving. A tile that learns its height when its
 * picture arrives changes the height of its column, and every tile under it —
 * and with CSS columns, every tile after it on the page — moves. So the picture
 * is loaded first, off the page, and the tile is placed once with its final
 * proportions. The same request then serves the `<img>` from cache.
 */
function aspectFor(asset: AssetResult): Promise<number> {
  if (!asset.thumbnail) {
    // Objaverse pictures arrive later, from Sketchfab, which renders every
    // thumbnail at 16:9 — so reserve that and the picture fills it exactly.
    if (asset.enrich) return Promise.resolve(16 / 9)
    let hash = 0
    for (const char of asset.id) hash = (hash * 31 + char.charCodeAt(0)) | 0
    return Promise.resolve(PLACEHOLDER_ASPECTS[Math.abs(hash) % PLACEHOLDER_ASPECTS.length])
  }

  const url = asset.thumbnail
  let cached = aspectCache.get(url)
  if (!cached) {
    cached = new Promise<number>((resolve) => {
      const image = new Image()
      image.decoding = "async"
      const timer = setTimeout(() => resolve(1), MEASURE_TIMEOUT_MS)
      image.onload = () => {
        clearTimeout(timer)
        const ratio = image.naturalWidth / image.naturalHeight
        resolve(Number.isFinite(ratio) && ratio > 0 ? Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, ratio)) : 1)
      }
      image.onerror = () => {
        clearTimeout(timer)
        resolve(1)
      }
      image.src = url
    })
    aspectCache.set(url, cached)
  }
  return cached
}

/**
 * Deal tiles into columns, each onto the currently shortest.
 *
 * Greedy and in order, so it is prefix-stable: adding tiles at the end can
 * never change where an earlier tile went. That property is the whole fix —
 * loading the next page only ever adds to the bottom of the columns.
 */
function dealColumns(placed: Placed[], count: number, columnWidth: number): Placed[][] {
  const columns: Placed[][] = Array.from({ length: count }, () => [])
  const heights = new Array<number>(count).fill(0)
  for (const tile of placed) {
    let shortest = 0
    for (let i = 1; i < count; i++) if (heights[i] < heights[shortest] - 0.5) shortest = i
    columns[shortest].push(tile)
    heights[shortest] += (columnWidth - CARD_INSET) / tile.aspect + CARD_CHROME + GAP
  }
  return columns
}

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
  const resultsRef = useRef(results)
  resultsRef.current = results
  // Bumped by every new search, so tiles still measuring for the last one are
  // dropped instead of being appended to this one.
  const [generation, setGeneration] = useState(0)

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
        const offset = reset ? 0 : resultsRef.current.length
        const page = await searchAssets({
          query: nextQuery,
          providers: nextProviders,
          offset,
          limit: PAGE,
        })
        setOutcome({ total: page.total, failed: page.failed })
        if (reset) setGeneration((value) => value + 1)
        setResults((current) => (reset ? page.results : [...current, ...page.results]))
        setExhausted(page.results.length < PAGE)
      } catch {
        setOutcome({ total: 0, failed: [] })
        if (reset) {
          setGeneration((value) => value + 1)
          setResults([])
        }
        setExhausted(true)
      } finally {
        setLoading(false)
        pending.current = false
      }
    },
    [],
  )

  // Seed with something on screen rather than an empty page.
  useEffect(() => {
    void run("", ALL, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * Placement: measure each new result's picture, then add it to the board in
   * order, in as few renders as the pictures allow.
   *
   * Tiles go on strictly in result order — a fast thumbnail waits for a slow
   * one ahead of it — so the board reads the same way every time and nothing is
   * ever slotted in above something already placed.
   */
  const [placed, setPlaced] = useState<Placed[]>([])
  const [placedGeneration, setPlacedGeneration] = useState(0)
  const placedRef = useRef<{ generation: number; tiles: Placed[] }>({ generation: 0, tiles: [] })

  useEffect(() => {
    let cancelled = false
    const current = placedRef.current
    const base = current.generation === generation ? current.tiles : []
    const waiting = results.slice(base.length)
    if (waiting.length === 0) {
      if (current.generation !== generation) {
        placedRef.current = { generation, tiles: [] }
        setPlaced([])
        setPlacedGeneration(generation)
      }
      return
    }

    const ready: Array<number | undefined> = new Array(waiting.length)
    let next = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      timer = undefined
      if (cancelled) return
      let end = next
      while (end < waiting.length && ready[end] !== undefined) end++
      if (end === next) return
      const start = placedRef.current.generation === generation ? placedRef.current.tiles : []
      const batch = waiting.slice(next, end).map((asset, i) => ({
        asset,
        aspect: ready[next + i]!,
        key: `${asset.provider}-${asset.id}-${start.length + i}`,
      }))
      next = end
      const tiles = [...start, ...batch]
      placedRef.current = { generation, tiles }
      setPlaced(tiles)
      setPlacedGeneration(generation)
    }

    waiting.forEach((asset, i) => {
      void aspectFor(asset).then((aspect) => {
        ready[i] = aspect
        // Pictures that land within a couple of frames of each other go on in
        // one render. A timer rather than requestAnimationFrame, which never
        // fires in a background tab and would leave the board empty there.
        if (!timer && !cancelled) timer = setTimeout(flush, 32)
      })
    })

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [results, generation])

  // Columns: counted from the viewport like the breakpoints, sized from the
  // board itself.
  const board = useRef<HTMLDivElement>(null)
  const [columnCount, setColumnCount] = useState(3)
  const [columnWidth, setColumnWidth] = useState<number | null>(null)
  useEffect(() => {
    const element = board.current
    if (!element) return
    const measure = () => {
      const count = columnsFor(window.innerWidth)
      setColumnCount(count)
      // Rounded to a coarse step so a scrollbar appearing does not re-deal
      // the board: only the column *count* should ever move tiles.
      const width = (element.clientWidth - GAP * (count - 1)) / count
      setColumnWidth((previous) =>
        previous === null || Math.abs(previous - width) > 40 ? Math.round(width) : previous,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const columns = useMemo(
    () => dealColumns(placed, columnCount, columnWidth ?? 220),
    [placed, columnCount, columnWidth],
  )
  const settling = loading || placedGeneration !== generation || placed.length < results.length

  // Infinite scroll, started well before the bottom so the next page is
  // measured and placed before anyone reaches it. The button below is the
  // fallback for anyone whose browser makes the observer unreliable.
  useEffect(() => {
    const element = sentinel.current
    // Not while the last page is still being placed: the sentinel has not moved
    // down yet, so it would read as "near the bottom" and fetch page after page.
    // Once placing finishes this re-observes, and fires again only if the
    // bottom really is still close.
    if (!element || exhausted || settling || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void run(query, providers, false)
      },
      { rootMargin: "0px 0px 1800px 0px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [exhausted, settling, query, providers, run])

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
  const sendToStudio = useCallback(
    (_asset: AssetResult, url: string) => {
      router.push(
        `/studio?c=${encodeState(configFromPreset("mercury-1", { type: "model", src: url }))}`,
      )
    },
    [router],
  )

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

        {/*
          Masonry, dealt into columns in JavaScript rather than by CSS.

          A grid has to know a tile's height before it places it, so every
          thumbnail was forced into a row-multiple and cropped. CSS columns fixed
          that and broke something worse: they rebalance the whole board on every
          change, so each page that loaded, and each picture that arrived, moved
          tiles people were looking at into other columns. Here a tile is placed
          once, with its final proportions, and never moves again.
        */}
        <div ref={board} className="flex items-start gap-3">
          {columns.map((column, index) => (
            <div key={index} className="flex min-w-0 flex-1 flex-col gap-3">
              {column.map((tile) => (
                <AssetCard key={tile.key} asset={tile.asset} aspect={tile.aspect} onSend={sendToStudio} />
              ))}
              {settling && !exhausted && <SkeletonCard aspect={PLACEHOLDER_ASPECTS[index % 5]} />}
              {settling && placed.length === 0 && <SkeletonCard aspect={PLACEHOLDER_ASPECTS[(index + 2) % 5]} />}
            </div>
          ))}
        </div>

        <div ref={sentinel} className="h-px" aria-hidden />

        <div className="mt-8 flex flex-col items-center gap-3">
          {!settling && !exhausted && (
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

/**
 * One result.
 *
 * Memoised, because appending a page re-renders the board and forty-eight new
 * cards should not cost re-rendering the two thousand already there. Its height
 * is fixed the moment it is placed: the picture's box has the proportions that
 * were measured before placing it, and every line below the picture is exactly
 * one line tall whatever the catalogue does or does not know.
 */
const AssetCard = memo(function AssetCard({
  asset,
  aspect,
  onSend,
}: {
  asset: AssetResult
  aspect: number
  onSend: (asset: AssetResult, url: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [meta, setMeta] = useState<Partial<AssetResult> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState(false)

  // Objaverse knows only a category up front. Enriching on approach rather
  // than up front keeps a broad search from firing thousands of requests, and
  // the margin means the picture is usually there by the time the card is.
  useEffect(() => {
    if (!asset.enrich || meta) return
    const element = ref.current
    if (!element || typeof IntersectionObserver === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observer.disconnect()
        void fetchSketchfabMetadata(asset.id).then((data) => data && setMeta(data))
      },
      { rootMargin: "800px 0px" },
    )
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

  // Warnings share one line. They used to be paragraphs that appeared when a
  // card's metadata arrived, which made the card taller and pushed its column.
  const notes = [
    heavy ? `${Math.round((merged.polycount ?? 0) / 1000)}k tris, clustered on import` : null,
    merged.animated ? "rigged, animation dropped" : null,
  ].filter(Boolean)
  const noteTitle = [
    heavy ? "Clustered down on import, and the cursor probe falls back to the bounding sphere." : null,
    merged.animated ? "Rigged — the animation is dropped when the mesh becomes one surface." : null,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div
      ref={ref}
      className="group relative overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink-2"
    >
      <div
        className="relative m-1.5 overflow-hidden rounded-[var(--radius-md)] bg-ink-3"
        style={{ aspectRatio: aspect }}
      >
        {merged.thumbnail ? (
          /* Contained, not cropped: the box already has the picture's own
             proportions, and where a sliver or banner was clamped, the model's
             silhouette is the thing worth seeing whole. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={merged.thumbnail}
            alt=""
            decoding="async"
            ref={(image) => {
              // Measured before placing, so usually already in cache and
              // complete on mount — show it at once rather than fading from blank.
              if (image?.complete && image.naturalWidth > 0 && !shown) setShown(true)
            }}
            onLoad={() => setShown(true)}
            className={`absolute inset-0 h-full w-full object-contain transition-[opacity,transform] duration-500 group-hover:scale-[1.03] ${
              shown ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          /* Not every Objaverse uid still exists on Sketchfab, so some will
             never have a picture. A tinted initial beats a broken frame. */
          <div className="absolute inset-0 grid place-items-center">
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
        <p
          className={`truncate font-mono text-[10px] ${error ? "text-bone/55" : "text-bone/35"}`}
          title={error ?? (noteTitle || undefined)}
        >
          {error ?? (notes.length > 0 ? notes.join(" · ") : "\u00a0")}
        </p>

        <div className="flex items-center gap-2 pt-1">
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
            <span className="py-1.5 font-mono text-[10px] text-bone/30">Download at source</span>
          )}
          <a
            href={merged.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="-my-2 py-2 pl-2 font-mono text-[10px] text-muted hover:text-bone"
          >
            Source
          </a>
        </div>
      </div>
    </div>
  )
})

/** The shape of a card that is on its way, so the end of the board is never a blank edge. */
function SkeletonCard({ aspect }: { aspect: number }) {
  return (
    <div aria-hidden className="overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink-2">
      <div className="m-1.5 animate-pulse rounded-[var(--radius-md)] bg-ink-3" style={{ aspectRatio: aspect }} />
      <div className="flex flex-col gap-2 px-3 pt-1 pb-3" style={{ height: CARD_CHROME - CARD_INSET }}>
        <div className="h-2.5 w-3/4 rounded-full bg-bone/[0.06]" />
        <div className="h-2 w-1/2 rounded-full bg-bone/[0.04]" />
      </div>
    </div>
  )
}
