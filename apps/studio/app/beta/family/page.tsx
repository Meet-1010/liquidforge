"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { BetaShell } from "@/components/beta-shell"
import { LazyPreview } from "@/components/lazy-preview"
import { presetForPost } from "@/lib/community"
import type { AncestorNode, DescendantNode } from "@/lib/lineage"
import type { Look } from "@/lib/store/types"
import type { ObjectSource } from "liquidforge"

/**
 * A look's family: who it was bred from, and everything bred from it since.
 * With no post chosen, the lines that grew most this week — and a poster of
 * them, sized for a feed.
 */

interface GalleryPost {
  id: string
  title: string
  author: string
  createdAt: string
  object: ObjectSource
  preset: string
  look?: Look
  parentId?: string
  secondParentId?: string
}

interface Family {
  post: GalleryPost
  ancestors: AncestorNode<GalleryPost>
  descendants: DescendantNode<GalleryPost>
  descendantCount: number
}

function generations<T>(root: T, next: (node: T) => T[]): T[][] {
  const rows: T[][] = []
  let level = next(root)
  while (level.length) {
    rows.push(level)
    level = level.flatMap(next)
  }
  return rows
}

function Card({ post, note, onPick, highlight = false }: { post: GalleryPost; note?: string; onPick?: (id: string) => void; highlight?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onPick?.(post.id)}
      data-line-card
      className={`w-40 shrink-0 overflow-hidden rounded-[var(--radius-md)] border text-left transition-colors ${highlight ? "border-bone" : "border-rule hover:border-rule-bright"}`}
    >
      <LazyPreview preset={presetForPost(post)} object={post.object} height={120} />
      <span className="block px-2.5 py-2">
        <span className="block truncate text-[13px] text-bone">{post.title}</span>
        <span className="block truncate font-mono text-[10px] text-bone/45">{note ?? `by ${post.author}`}</span>
      </span>
    </button>
  )
}

export default function FamilyPage() {
  return (
    <BetaShell slug="family" wide>
      <FamilyDemo />
    </BetaShell>
  )
}

function FamilyDemo() {
  const [id, setId] = useState<string | null>(null)
  const [family, setFamily] = useState<Family | null>(null)
  const [week, setWeek] = useState<{ lines: Array<{ post: GalleryPost; recent: number; total: number }>; posts: GalleryPost[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const poster = useRef<HTMLDivElement>(null)

  const pick = useCallback((next: string | null) => {
    setId(next)
    const url = new URL(window.location.href)
    if (next) url.searchParams.set("id", next)
    else url.searchParams.delete("id")
    window.history.replaceState(null, "", url)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id"))
    void fetch("/api/community/family?top=week")
      .then((response) => response.json())
      .then(setWeek)
      .catch(() => setError("The gallery couldn't be read."))
  }, [])

  useEffect(() => {
    if (!id) return setFamily(null)
    setError(null)
    void fetch(`/api/community/family?id=${encodeURIComponent(id)}`)
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error)
        setFamily(body)
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "That family couldn't be read."))
  }, [id])

  const downloadPoster = async () => {
    const cards = [...(poster.current?.querySelectorAll<HTMLCanvasElement>("[data-line-card] canvas") ?? [])]
    if (!week?.lines.length || cards.length === 0) return
    const canvas = document.createElement("canvas")
    canvas.width = 1080
    canvas.height = 1350
    const context = canvas.getContext("2d")!
    context.fillStyle = "#08080a"
    context.fillRect(0, 0, 1080, 1350)
    context.fillStyle = "#eceae5"
    context.font = "400 84px 'Instrument Serif', Georgia, serif"
    context.fillText("Most bred this week", 72, 150)
    context.font = "500 26px ui-monospace, Menlo, monospace"
    context.fillStyle = "rgba(236,234,229,0.5)"
    context.fillText(`liquidforge · week of ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`, 72, 205)
    week.lines.slice(0, 6).forEach((line, index) => {
      const x = 72 + (index % 2) * 480
      const y = 270 + Math.floor(index / 2) * 350
      const still = cards[index]
      if (still) context.drawImage(still, x, y, 456, 240)
      context.fillStyle = "#eceae5"
      context.font = "400 38px 'Instrument Serif', Georgia, serif"
      context.fillText(`${index + 1}. ${line.post.title}`.slice(0, 26), x, y + 290)
      context.font = "500 22px ui-monospace, Menlo, monospace"
      context.fillStyle = "rgba(236,234,229,0.55)"
      context.fillText(`+${line.recent} this week · ${line.total} in all · ${line.post.author}`.slice(0, 40), x, y + 326)
    })
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
    if (!blob) return
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = "liquidforge-most-bred.png"
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 2000)
  }

  if (family) {
    const up = generations(family.ancestors, (node) => node.parents).reverse()
    const down = generations(family.descendants, (node) => node.children)
    return (
      <div className="space-y-6">
        <button type="button" onClick={() => pick(null)} className="font-mono text-[11px] text-bone/50 hover:text-bone">
          ← This week&apos;s lines
        </button>
        {up.map((row, index) => (
          <div key={`up-${index}`}>
            <p className="mb-2 font-mono text-[10px] tracking-[0.12em] text-bone/35 uppercase">{up.length - index === 1 ? "Parents" : `${up.length - index} generations back`}</p>
            <div className="flex gap-3 overflow-x-auto pb-2">{row.map((node) => <Card key={node.post.id} post={node.post} onPick={pick} />)}</div>
          </div>
        ))}
        <div className="rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4">
          <div className="flex flex-wrap items-end gap-5">
            <Card post={family.post} highlight />
            <div className="space-y-2 pb-1">
              <p className="display text-[clamp(1.6rem,4vw,2.4rem)] leading-none">{family.post.title}</p>
              <p className="font-mono text-[11px] text-bone/55">
                {family.descendantCount === 0 ? "No descendants yet." : `${family.descendantCount} descendant${family.descendantCount === 1 ? "" : "s"}`}
                {up.length === 0 ? " · an original, bred from nothing" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/beta/duet?with=${family.post.id}`} className="rounded-[var(--radius-pill)] bg-bone px-3 py-1.5 font-mono text-[11px] text-ink hover:bg-bone-dim">
                  Duet with it
                </Link>
                <Link href="/community" className="rounded-[var(--radius-pill)] border border-rule px-3 py-1.5 font-mono text-[11px] text-bone/75 hover:text-bone">
                  Breed from it in the gallery
                </Link>
              </div>
            </div>
          </div>
        </div>
        {down.map((row, index) => (
          <div key={`down-${index}`}>
            <p className="mb-2 font-mono text-[10px] tracking-[0.12em] text-bone/35 uppercase">{index === 0 ? "Children" : index === 1 ? "Grandchildren" : `${index + 1} generations on`}</p>
            <div className="flex gap-3 overflow-x-auto pb-2">{row.map((node) => <Card key={node.post.id} post={node.post} onPick={pick} />)}</div>
          </div>
        ))}
        {error && <p role="alert" className="font-mono text-[11px] text-[#ff8a7a]">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="display text-[1.8rem]">Most bred this week</h2>
          {week && week.lines.length > 0 && (
            <button type="button" onClick={() => void downloadPoster()} className="rounded-[var(--radius-pill)] border border-rule px-3 py-1.5 font-mono text-[11px] text-bone/75 hover:text-bone">
              Download the poster
            </button>
          )}
        </div>
        {!week ? (
          <p className="font-mono text-[11px] text-bone/40">Reading the gallery…</p>
        ) : week.lines.length === 0 ? (
          <p className="max-w-xl text-[14px] leading-relaxed text-bone/60">
            No look has been bred from this week yet. Cross two posts in the gallery — or remix one — and its line starts here.
          </p>
        ) : (
          <div ref={poster} className="flex gap-3 overflow-x-auto pb-2">
            {week.lines.map((line) => (
              <Card key={line.post.id} post={line.post} note={`+${line.recent} this week · ${line.total} in all`} onPick={pick} />
            ))}
          </div>
        )}
      </section>

      {week && week.posts.length > 0 && (
        <section>
          <h2 className="display mb-3 text-[1.8rem]">Every family</h2>
          <div className="flex flex-wrap gap-3">
            {week.posts.map((post) => (
              <Card key={post.id} post={post} onPick={pick} />
            ))}
          </div>
        </section>
      )}
      {error && <p role="alert" className="font-mono text-[11px] text-[#ff8a7a]">{error}</p>}
    </div>
  )
}
