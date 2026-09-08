"use client"

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
 * Every entry is a running scene rather than a screenshot, which is the only
 * honest way to show something whose whole point is that it moves under your
 * cursor. It costs a WebGL context per card, so `LazyPreview` mounts what is
 * near the viewport and holds a ceiling on the rest.
 *
 * The list is a JSON file in the repository on purpose. There is no backend
 * here, and an entry is only ever what you would have pasted into a page — an
 * object and a preset id — so a pull request is the whole submission flow.
 */
export default function CommunityPage() {
  const entries = community.entries as Entry[]

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-5">
        <header className="mb-10">
          <p className="label mb-3">01 — Community</p>
          <h1 className="display text-[clamp(2.2rem,6vw,3.6rem)]">Made with liquidforge.</h1>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-bone-dim">{community.note}</p>
          <a
            href="https://github.com/Meet-1010/liquidforge/blob/main/apps/studio/data/community.json"
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex rounded-[var(--radius-pill)] border border-rule px-4 py-2 font-mono text-[11px] text-bone/70 transition-colors hover:border-rule-bright hover:text-bone"
          >
            Add yours
          </a>
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
