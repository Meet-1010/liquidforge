"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { LiquidCanvas, presetName, resolvePreset } from "liquidforge"
import { configFromPreset, decodeState, type LiquidConfig } from "liquidforge/codegen"
import { canSubmit, postToCommunity } from "@/lib/community"
import { SiteNav } from "@/components/site-nav"
import { Button, TextInput } from "@/components/ui"

/**
 * The composer.
 *
 * A page rather than a tab inside the export dialog, because posting is its own
 * thing and burying it three clicks into a code-export modal is most of why
 * nobody would ever find it. Big preview, three fields, one button — the shape
 * every site people already post to has settled on.
 */
export default function PostPage() {
  return (
    <Suspense fallback={null}>
      <Composer />
    </Suspense>
  )
}

function Composer() {
  const params = useSearchParams()
  const router = useRouter()

  const [config, setConfig] = useState<LiquidConfig | null>(null)
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [link, setLink] = useState("")
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const encoded = params.get("c")
    const decoded = encoded ? decodeState(encoded) : null
    setConfig(decoded ?? configFromPreset("mercury-3"))
    // A remix keeps the name of the thing it came from as a starting point.
    const from = params.get("title")
    if (from) setTitle(from)
  }, [params])

  // Names are the one field worth remembering; a title is different every time.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("liquidforge:author")
      if (saved) setAuthor(saved)
    } catch {
      // Private windows throw on access; posting anonymously is fine.
    }
  }, [])

  if (!config) return null

  const preset = resolvePreset(config.preset, {
    family: config.family,
    palette: config.palette,
    surface: config.surface,
    shading: config.shading,
    background: config.background,
  })

  const parentId = params.get("from") ?? undefined
  const postable = canSubmit(config) && title.trim().length >= 2

  const publish = async () => {
    setPosting(true)
    setError(null)
    try {
      localStorage.setItem("liquidforge:author", author)
    } catch {
      // Not important enough to stop a post over.
    }
    const result = await postToCommunity(config, { title, author, url: link }, parentId)
    if (result.ok) {
      // Straight to the gallery, where it is already there.
      router.push(`/community?new=${encodeURIComponent(result.id ?? "")}`)
      return
    }
    setError(result.message)
    setPosting(false)
  }

  return (
    <>
      <SiteNav />
      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-5 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-rule">
            <LiquidCanvas
              object={config.object}
              preset={preset}
              transparent={config.transparent}
              background={config.backgroundColor}
              style={{ height: 420, minHeight: 0 }}
            />
          </div>
          <p className="mt-3 font-mono text-[11px] text-muted">
            {preset.label} · {presetName(config.preset)} · {config.object.type}
            {parentId && " · remix"}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <p className="label mb-2">{parentId ? "Post a remix" : "Post to the community"}</p>
            <h1 className="display m-0 text-[clamp(1.8rem,4.5vw,2.6rem)]">
              Put it in the gallery.
            </h1>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-bone-dim">
              It goes up straight away. Anyone can open it, turn it, and remix it into something
              of their own.
            </p>
          </div>

          <TextInput label="Title" value={title} onChange={setTitle} placeholder="Oil knot" />
          <TextInput label="Your name" value={author} onChange={setAuthor} placeholder="Optional" />
          <TextInput
            label="Link"
            value={link}
            onChange={setLink}
            placeholder="https://your-site.com — optional"
          />

          {!canSubmit(config) && (
            <p className="font-mono text-[11px] leading-relaxed text-bone/45">
              This object was built from a file on your machine, so it cannot travel in a post.
              Host the .glb somewhere and point the URL at it, or forge the object instead.
            </p>
          )}
          {error && <p className="font-mono text-[11px] text-bone/60">{error}</p>}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button variant="primary" onClick={publish} disabled={!postable || posting}>
              {posting ? "Posting…" : "Post it"}
            </Button>
            <Link
              href={`/studio?c=${params.get("c") ?? ""}`}
              className="font-mono text-[11px] text-muted hover:text-bone"
            >
              Keep tuning
            </Link>
          </div>
        </div>
      </main>
    </>
  )
}
