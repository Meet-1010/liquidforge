"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { PRESETS, presetName } from "liquidforge"
import { configFromPreset, shareUrl } from "liquidforge/codegen"
import type { ObjectSource } from "liquidforge"
import { LazyPreview } from "@/components/lazy-preview"
import { SiteNav } from "@/components/site-nav"
import community from "@/data/community.json"

interface Entry {
  id: string
  title: string
  author: string
  url: string
  object: ObjectSource
  preset: string
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
  const seed = community.entries as Entry[]
  const [entries, setEntries] = useState<Entry[]>(seed)
  const [live, setLive] = useState(false)

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
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link
              href="/studio"
              className="inline-flex rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim"
            >
              Make one, then post it from the export
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => {
            const preset = PRESETS[entry.preset]
            if (!preset) return null
            const href = shareUrl(configFromPreset(entry.preset, entry.object), "/studio") ?? "/studio"

            return (
              <article
                key={entry.id}
                className="overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-ink-2"
              >
                <div className="m-1.5 overflow-hidden rounded-[var(--radius-md)]">
                  <LazyPreview preset={preset} object={entry.object} height={200} />
                </div>
                <div className="flex items-baseline justify-between gap-2 px-3 pt-1 pb-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-bone/80">{entry.title}</p>
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-[10px] text-muted hover:text-bone"
                    >
                      {entry.author}
                    </a>
                  </div>
                  {/* A link beside the surface, not around it: the preview
                      takes the drag gesture. */}
                  <a href={href} className="shrink-0 font-mono text-[10px] text-muted hover:text-bone">
                    {preset.label} · {presetName(entry.preset)}
                  </a>
                </div>
              </article>
            )
          })}
        </div>
      </main>
    </>
  )
}
