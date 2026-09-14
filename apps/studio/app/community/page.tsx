"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { PRESETS, presetName } from "liquidforge"
import { describeChange, litter } from "liquidforge/breed"
import type { ObjectSource } from "liquidforge"
import { LazyPreview } from "@/components/lazy-preview"
import { presetForPost, studioLinkFor } from "@/lib/community"
import { dailyKey, dailyPick } from "@/lib/daily"
import { SteerBar, useFlip, useSteer } from "@/components/steer"
import type { Look } from "@/lib/store/types"
import { SiteNav } from "@/components/site-nav"
import community from "@/data/community.json"

interface Entry {
  id: string
  title: string
  author: string
  url: string
  object: ObjectSource
  preset: string
  /** Set when this grew out of another post. */
  parentId?: string
  /** Set when it was bred from two. */
  secondParentId?: string
  look?: Look
  daily?: string
}

/**
 * The gallery.
 *
 * Every entry is the real material on the real object rather than a screenshot,
 * which is the only honest way to show something whose whole point is that it
 * moves under your cursor. The stills come from one shared context; pointing at
 * a card hands it a live one of its own.
 *
 * The list is a JSON file in the repository on purpose. There is no backend
 * here, and an entry is only ever what you would have pasted into a page — an
 * object and a preset id — so a pull request is the whole submission flow.
 *
 * The Studio's export builds that entry and opens a prefilled issue with it, so
 * from a maker's side it is one button. It still needs a person to merge, which
 * is worth saying plainly rather than implying the gallery is live.
 */
export default function CommunityPage() {
  return (
    <Suspense fallback={null}>
      <Gallery />
    </Suspense>
  )
}

function Gallery() {
  const params = useSearchParams()
  const justPosted = params.get("new")
  const seed = community.entries as Entry[]
  const [entries, setEntries] = useState<Entry[]>(seed)
  const [live, setLive] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  // Up to two posts chosen as parents, oldest first; picking a third lets the
  // oldest go, so choosing never needs an explicit "unselect" first.
  const [parents, setParents] = useState<string[]>([])
  const [breeding, setBreeding] = useState(false)
  const [onlyToday, setOnlyToday] = useState(false)
  const steering = useSteer()
  const grid = useRef<HTMLDivElement>(null)
  // Worked out after mount: the server renders in its own clock, and a prompt
  // that changes during hydration across midnight UTC is a mismatch waiting to
  // happen.
  const [today, setToday] = useState<ReturnType<typeof dailyPick> | null>(null)
  useEffect(() => setToday(dailyPick(dailyKey())), [])
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])
  const pickParent = (id: string) =>
    setParents((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id].slice(-2),
    )

  /** How many posts name each one as their parent. */
  const remixCounts = entriesRemixCounts(entries)

  /*
   * Published posts from the API, with the checked-in JSON as the seed.
   *
   * The seed is not a fallback for a broken API so much as the gallery's
   * starting content: a fresh clone has an empty database and should still
   * show something. Anything published through the backend is appended to it.
   */
  useEffect(() => {
    let cancelled = false
    fetch("/api/community?limit=60")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { posts?: Entry[] } | null) => {
        if (cancelled || !data?.posts?.length) return
        const seen = new Set(seed.map((entry) => entry.id))
        setEntries([...data.posts.filter((post) => !seen.has(post.id)), ...seed])
        setLive(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleEntries = entries.filter((entry) => !onlyToday || (today && entry.daily === today.key))
  useFlip(grid, `${steering.live.energy !== 0 || steering.live.warmth !== 0}|${steering.order(visibleEntries, (entry) => (PRESETS[entry.preset] ? presetForPost(entry) : undefined)).map((entry) => entry.id).join(",")}`)

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-5">
        <header className="mb-10">
          <p className="label mb-3">01 — Community</p>
          <h1 className="display text-[clamp(2.2rem,6vw,3.6rem)]">Made with liquidforge.</h1>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-bone-dim">{community.note}</p>
          {live && (
            <p className="mt-2 font-mono text-[11px] text-bone/35">
              Showing posts from the gallery database as well as the ones in the repository.
            </p>
          )}
          {justPosted && (
            <p className="mt-4 rounded-[var(--radius-sm)] border border-rule bg-ink-2 px-3 py-2 font-mono text-[11px] text-bone/70">
              Posted. It is at the top.
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link
              href="/studio"
              className="inline-flex rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim"
            >
              Make one and post it
            </Link>
            <a
              href="https://github.com/Meet-1010/liquidforge/blob/main/apps/studio/data/community.json"
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-[var(--radius-pill)] border border-rule px-4 py-2 font-mono text-[11px] text-bone/70 transition-colors hover:border-rule-bright hover:text-bone"
            >
              Or open a pull request
            </a>
          </div>
        </header>

        {today && (
          <TodaysObject
            pick={today}
            count={entries.filter((entry) => entry.daily === today.key).length}
            onlyToday={onlyToday}
            onToggle={() => setOnlyToday((value) => !value)}
          />
        )}

        {onlyToday && today && !entries.some((entry) => entry.daily === today.key) && (
          <p className="mb-6 font-mono text-[12px] text-bone/45">
            Nobody has posted today&apos;s yet. The first one is yours.
          </p>
        )}

        <SteerBar state={steering.live} onChange={steering.setLive} count={visibleEntries.length} />

        <div ref={grid} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {steering
            .order(visibleEntries, (entry) => (PRESETS[entry.preset] ? presetForPost(entry) : undefined))
            .map((entry) => {
            if (!PRESETS[entry.preset]) return null
            const own = presetForPost(entry)
            const preset = steering.look(own)
            const href = studioLinkFor(preset, entry.object, entry.preset)
            const parentIndex = parents.indexOf(entry.id)
            const parent = entry.parentId && !entry.secondParentId ? byId.get(entry.parentId) : undefined
            const bredFrom = entry.secondParentId
              ? [entry.parentId, entry.secondParentId].map((id) => (id ? byId.get(id)?.title ?? "a removed post" : null))
              : null

            return (
              <article
                key={entry.id}
                data-flip={entry.id}
                className={`overflow-hidden rounded-[var(--radius-lg)] border bg-ink-2 ${
                  entry.id === justPosted || parentIndex >= 0 ? "border-bone" : "border-rule"
                }`}
              >
                <div className="relative m-1.5 overflow-hidden rounded-[var(--radius-md)]">
                  <LazyPreview preset={preset} object={entry.object} height={200} filter={steering.filter()} />
                  {parentIndex >= 0 && (
                    <span className="pointer-events-none absolute top-2 left-2 rounded-[var(--radius-pill)] bg-bone px-2 py-0.5 font-mono text-[10px] text-ink">
                      Parent {parentIndex === 0 ? "A" : "B"}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline justify-between gap-2 px-3 pt-1 pb-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-bone/80">{entry.title}</p>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="-my-1.5 inline-block py-1.5 font-mono text-[10px] text-muted hover:text-bone"
                    >
                      {entry.author}
                    </a>
                  </div>
                  {/* A link beside the surface, not around it: the preview
                      takes the drag gesture. */}
                  <a href={href} className="-my-2 shrink-0 py-2 font-mono text-[10px] text-muted hover:text-bone">
                    {preset.label} · {presetName(entry.preset)}
                  </a>
                </div>

                {/* Remix carries the parent through, so a post knows what it
                    grew out of and the original can show what came of it. */}
                <div className="flex flex-wrap items-center gap-2 border-t border-rule px-3 py-2">
                  <Link
                    href={studioLinkFor(preset, entry.object, entry.preset, { from: entry.id })}
                    className="inline-flex min-h-8 items-center rounded-[var(--radius-pill)] border border-rule px-3 font-mono text-[10px] text-bone/60 transition-colors hover:border-rule-bright hover:text-bone"
                  >
                    Remix
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      const code = `<iframe src="${location.origin}/embed/${entry.id}" width="100%" height="420" style="border:0;border-radius:16px" loading="lazy"></iframe>`
                      void navigator.clipboard?.writeText(code).catch(() => {})
                      setCopied(entry.id)
                      setTimeout(() => setCopied(null), 1600)
                    }}
                    className="rounded-[var(--radius-pill)] border border-rule px-2.5 py-1 font-mono text-[10px] text-bone/60 transition-colors hover:border-rule-bright hover:text-bone"
                  >
                    {copied === entry.id ? "Copied" : "Embed"}
                  </button>
                  <button
                    type="button"
                    aria-pressed={parentIndex >= 0}
                    onClick={() => pickParent(entry.id)}
                    className={`rounded-[var(--radius-pill)] border px-2.5 py-1 font-mono text-[10px] transition-colors ${
                      parentIndex >= 0
                        ? "border-bone bg-bone text-ink"
                        : "border-rule text-bone/60 hover:border-rule-bright hover:text-bone"
                    }`}
                  >
                    {parentIndex >= 0 ? "Parent" : "Breed"}
                  </button>
                  {remixCounts[entry.id] > 0 && (
                    <span className="font-mono text-[10px] text-muted">
                      {remixCounts[entry.id]} descendant{remixCounts[entry.id] > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {entry.daily && (
                  <p className="truncate border-t border-rule px-3 py-1.5 font-mono text-[10px] text-bone/35">
                    Today&apos;s object · {entry.daily}
                  </p>
                )}
                {parent && PRESETS[parent.preset] && (
                  <p className="border-t border-rule px-3 py-1.5 font-mono text-[10px] leading-relaxed text-bone/45">
                    {describeChange(presetForPost(parent), own, { than: parent.title })}
                  </p>
                )}
                {bredFrom && (
                  <p className="truncate border-t border-rule px-3 py-1.5 font-mono text-[10px] text-bone/35">
                    Bred from {bredFrom[0]} × {bredFrom[1]}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      </main>

      {/* The bar that turns two picks into a litter. Fixed to the bottom so it
          is there wherever in the gallery the second parent was found. */}
      {parents.length > 0 && !breeding && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex max-w-full items-center gap-3 rounded-[var(--radius-pill)] border border-rule-bright bg-ink-2/95 py-1.5 pr-1.5 pl-4 shadow-2xl backdrop-blur">
            <p className="min-w-0 truncate font-mono text-[11px] text-bone/70">
              {parents.length === 1
                ? `${byId.get(parents[0])?.title} — pick a second parent`
                : `${byId.get(parents[0])?.title} × ${byId.get(parents[1])?.title}`}
            </p>
            <button
              type="button"
              onClick={() => setParents([])}
              className="shrink-0 font-mono text-[10px] text-muted hover:text-bone"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={parents.length < 2}
              onClick={() => setBreeding(true)}
              className="shrink-0 rounded-[var(--radius-pill)] bg-bone px-3.5 py-1.5 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim disabled:opacity-35"
            >
              Breed a litter
            </button>
          </div>
        </div>
      )}

      {breeding && parents.length === 2 && byId.get(parents[0]) && byId.get(parents[1]) && (
        <Litter
          a={byId.get(parents[0])!}
          b={byId.get(parents[1])!}
          onClose={() => setBreeding(false)}
        />
      )}
    </>
  )
}

/**
 * The daily prompt, at the top of the gallery.
 *
 * The object is fixed and the look is not — the button opens it in the Studio
 * with a starting colourway, and whatever material it leaves with is the
 * answer. The count and the filter are what make it a shared thing rather than
 * a suggestion: you can see what everyone else did with the same shape.
 */
function TodaysObject({
  pick,
  count,
  onlyToday,
  onToggle,
}: {
  pick: ReturnType<typeof dailyPick>
  count: number
  onlyToday: boolean
  onToggle: () => void
}) {
  const preset = PRESETS[pick.preset]
  if (!preset) return null
  const date = new Date(`${pick.key}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })

  return (
    <section className="mb-8 grid overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="m-1.5 overflow-hidden rounded-[var(--radius-md)]">
        <LazyPreview preset={preset} object={pick.object} height={220} />
      </div>
      <div className="flex flex-col justify-center gap-3 px-4 py-4 sm:px-6">
        <p className="label">Today&apos;s object · {date}</p>
        <h2 className="display m-0 text-[clamp(1.6rem,3.6vw,2.4rem)]">{pick.title}</h2>
        <p className="max-w-md text-[13px] leading-relaxed text-bone-dim">
          Everyone gets the same object today. Give it any material, any colour, any motion, and post
          it — tomorrow there is a new one.
        </p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            href={studioLinkFor(preset, pick.object, pick.preset, { daily: pick.key })}
            className="inline-flex rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim"
          >
            Make today&apos;s
          </Link>
          <button
            type="button"
            aria-pressed={onlyToday}
            onClick={onToggle}
            className={`rounded-[var(--radius-pill)] border px-4 py-2 font-mono text-[11px] transition-colors ${
              onlyToday
                ? "border-bone bg-bone text-ink"
                : "border-rule text-bone/70 hover:border-rule-bright hover:text-bone"
            }`}
          >
            {onlyToday ? "Showing today's" : `See today's${count > 0 ? ` (${count})` : ""}`}
          </button>
        </div>
      </div>
    </section>
  )
}

/**
 * Six children of two posts.
 *
 * Each takes its silhouette whole from one parent and its material family whole
 * from one — independently, so a child can be A's shape in B's material — and
 * every number in between is crossed gene by gene and nudged. The seed makes a
 * litter reproducible: the same two parents and the same seed always give the
 * same six, which is what lets a child be linked to rather than lost.
 */
function Litter({ a, b, onClose }: { a: Entry; b: Entry; onClose: () => void }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [wild, setWild] = useState(false)

  const children = useMemo(
    () =>
      litter(
        { preset: presetForPost(a), object: a.object },
        { preset: presetForPost(b), object: b.object },
        6,
        seed,
        { mutation: wild ? 0.45 : 0.15 },
      ),
    [a, b, seed, wild],
  )

  // Escape closes, as every dialog should; the page behind stops scrolling.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Litter of ${a.title} and ${b.title}`}
      className="fixed inset-0 z-50 overflow-y-auto bg-ink/85 backdrop-blur-sm"
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="mx-auto my-8 max-w-5xl rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="label mb-2">Litter · seed {seed.toString(36)}</p>
            <h2 className="display m-0 text-[clamp(1.5rem,3.5vw,2.2rem)]">
              {a.title} × {b.title}
            </h2>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-bone-dim">
              Shape from one parent, material from one, every number crossed and nudged. Open one in
              the Studio to tune it; post it from there and both parents are credited.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={wild}
              onClick={() => setWild((value) => !value)}
              className={`rounded-[var(--radius-pill)] border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                wild ? "border-bone bg-bone text-ink" : "border-rule text-bone/60 hover:border-rule-bright hover:text-bone"
              }`}
            >
              Wilder mutations
            </button>
            <button
              type="button"
              onClick={() => setSeed((value) => (value + 104729) % 1e9)}
              className="rounded-[var(--radius-pill)] border border-rule px-3 py-1.5 font-mono text-[11px] text-bone/70 transition-colors hover:border-rule-bright hover:text-bone"
            >
              Another litter
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-pill)] border border-rule px-3 py-1.5 font-mono text-[11px] text-bone/70 transition-colors hover:border-rule-bright hover:text-bone"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => {
            const shapeParent = child.lineage.silhouette === "a" ? a : b
            const materialParent = child.lineage.family === "a" ? a : b
            return (
              <article
                key={`${seed}-${wild}-${child.seed}`}
                className="overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink"
              >
                <div className="m-1.5 overflow-hidden rounded-[var(--radius-md)]">
                  <LazyPreview preset={child.preset} object={child.object} height={180} />
                </div>
                <div className="flex items-center justify-between gap-2 px-3 pt-1 pb-3">
                  <p className="min-w-0 truncate font-mono text-[10px] text-bone/55">
                    shape from {shapeParent.title} · {child.preset.family} from {materialParent.title}
                  </p>
                  <Link
                    href={studioLinkFor(child.preset, child.object, materialParent.preset, {
                      from: a.id,
                      with: b.id,
                    })}
                    className="shrink-0 rounded-[var(--radius-pill)] bg-bone px-2.5 py-1 font-mono text-[10px] text-ink transition-colors hover:bg-bone-dim"
                  >
                    Keep
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** How many posts descend from each id, as a remix or as one parent of a cross. */
function entriesRemixCounts(entries: Entry[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const entry of entries) {
    for (const parent of [entry.parentId, entry.secondParentId]) {
      if (parent) counts[parent] = (counts[parent] ?? 0) + 1
    }
  }
  return counts
}
