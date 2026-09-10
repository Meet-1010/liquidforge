"use client"

import { useEffect, useMemo, useState } from "react"
import { downloadBlob, exportModel, forgeGeometry, resolvePreset } from "liquidforge"
import {
  encodeState,
  generateCode,
  shareUrl,
  SHOWCASE_LAYOUTS,
  type LiquidConfig,
  type ShowcaseLayout,
} from "liquidforge/codegen"
import { canSubmit, communityEntry, postToCommunity, submitUrl } from "@/lib/community"
import { Button, CopyButton, Field, Segmented, TextInput, Toggle } from "./ui"

type Tab = "code" | "preset" | "share"

/**
 * Three ways out.
 *
 * The component, for the common case. The preset as JSON, for anyone keeping
 * their looks in a design system rather than in JSX. And the `.glb`, because
 * the object forged here is real geometry and should not be trapped in this
 * page — the liquid surface is a shader and does not travel, but the mesh does.
 */
export function ExportModal({
  config,
  onClose,
}: {
  config: LiquidConfig
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>("code")
  const [layout, setLayout] = useState<ShowcaseLayout>("hero")
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [link, setLink] = useState("")
  const [posting, setPosting] = useState(false)
  const [posted, setPosted] = useState<{ ok: boolean; message: string } | null>(null)
  /**
   * Whether the snippet paints its own ground.
   *
   * Off is the "drop it into the page I already have" answer, and it is asked
   * for far more often than the default implies — a hero handed to someone
   * whose layout already has a background should composite over it, not fight
   * it with a second one.
   */
  const [withBackground, setWithBackground] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const code = useMemo(() => {
    if (tab === "preset") {
      const preset = resolvePreset(config.preset, {
        family: config.family,
        palette: config.palette,
        surface: config.surface,
        shading: config.shading,
        background: config.background,
      })
      return JSON.stringify({ ...preset, id: `${preset.id}-custom` }, null, 2)
    }
    return generateCode(config, { showcase: layout, background: withBackground })
  }, [config, tab, layout, withBackground])

  const origin = typeof window === "undefined" ? "" : window.location.origin
  const share = origin ? shareUrl(config, `${origin}/studio`) : null
  const meta = SHOWCASE_LAYOUTS.find((entry) => entry.id === layout)
  const postable = canSubmit(config)

  const download = async () => {
    setExporting(true)
    setError(null)
    try {
      const geometry = await forgeGeometry(config.object)
      const blob = await exportModel(geometry, { name: "liquidforge-object" })
      downloadBlob(blob, "liquidforge-object.glb")
      geometry.dispose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/80 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-rule bg-ink-2"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-bone/45">Export</h2>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </header>

        <div className="space-y-3 border-b border-rule px-4 py-3">
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "code", label: "Component" },
              { value: "preset", label: "Preset JSON" },
              { value: "share", label: "Post it" },
            ]}
          />

          {tab === "code" && (
            <>
              {/* Eight ways to put it on a page. A hero is the obvious one and
                  usually not the one people actually need. */}
              <Field label="Where it goes" hint={meta?.blurb}>
                <div className="grid grid-cols-4 gap-1.5">
                  {SHOWCASE_LAYOUTS.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setLayout(entry.id)}
                      className={`rounded-[var(--radius-sm)] border px-2 py-1.5 font-mono text-[10px] transition-colors ${
                        layout === entry.id
                          ? "border-bone bg-bone text-ink"
                          : "border-rule text-bone/45 hover:border-rule-bright hover:text-bone"
                      }`}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Toggle
                label="Paint the background"
                checked={withBackground}
                onChange={setWithBackground}
              />
              <p className="px-2 font-mono text-[10px] leading-relaxed text-bone/30">
                {withBackground
                  ? "A finished section — it paints its own ground."
                  : "Just the surface, composited over whatever your page already has."}
              </p>
              {meta?.caveat && (
                <p className="px-2 font-mono text-[10px] leading-relaxed text-bone/35">
                  {meta.caveat}
                </p>
              )}
            </>
          )}
        </div>

        {tab === "share" ? (
          <div className="flex-1 space-y-3 overflow-auto p-4">
            <p className="font-mono text-[11px] leading-relaxed text-bone-dim">
              This posts straight to the gallery — no fork, no pull request, no waiting on
              anyone to copy JSON.
            </p>
            <p className="font-mono text-[10px] leading-relaxed text-bone/35">
              It does not appear the instant you press it. Posts land as pending and go up once
              they have been looked at, because a gallery that publishes unreviewed strangers is
              a gallery that eventually hosts something someone has to apologise for.
            </p>

            <TextInput label="Title" value={title} onChange={setTitle} placeholder="Oil knot" />
            <TextInput label="Your name" value={author} onChange={setAuthor} placeholder="Jane Doe" />
            <TextInput
              label="Link (optional)"
              value={link}
              onChange={setLink}
              placeholder="https://your-site.com"
            />

            {!postable && (
              <p className="font-mono text-[10px] leading-relaxed text-bone/45">
                This object came from a file on your machine, so it cannot travel in an entry.
                Host the .glb somewhere and point the URL field at it, or use a forged object.
              </p>
            )}

            <pre className="overflow-auto rounded-[var(--radius-sm)] border border-rule bg-ink p-3 font-mono text-[10px] leading-relaxed text-bone/60">
              {JSON.stringify(communityEntry(config, { title, author, url: link }), null, 2)}
            </pre>
          </div>
        ) : (
          <pre className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-bone/75">
            {code}
          </pre>
        )}

        <footer className="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-3">
          {tab === "share" ? (
            <>
              <Button
                variant="primary"
                disabled={!postable || !title.trim() || posting || posted?.ok}
                onClick={async () => {
                  setPosting(true)
                  setPosted(await postToCommunity(config, { title, author, url: link }))
                  setPosting(false)
                }}
              >
                {posting ? "Posting…" : posted?.ok ? "Posted" : "Post to community"}
              </Button>
              {/* The pull-request route stays, for anyone who would rather do
                  it that way and for a deployment with no database behind it. */}
              <a
                href={submitUrl(config, { title, author, url: link }, origin)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-[var(--radius-pill)] border border-rule bg-ink-2 px-3.5 py-2 font-mono text-[11px] text-bone/75 transition-colors hover:border-rule-bright hover:text-bone"
              >
                Open a PR instead
              </a>
              {posted && (
                <span
                  className={`font-mono text-[10px] ${posted.ok ? "text-bone/60" : "text-bone/45"}`}
                >
                  {posted.message}
                </span>
              )}
              {!posted && !title.trim() && (
                <span className="font-mono text-[10px] text-bone/30">Give it a title first</span>
              )}
            </>
          ) : (
            <>
              <CopyButton text={code} label="Copy" variant="primary" />
              {share ? (
                <>
                  <CopyButton text={share} label="Copy link" />
                  <a
                    href={`/showcase?c=${encodeState(config)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-[var(--radius-pill)] border border-rule bg-ink-2 px-3.5 py-2 font-mono text-[11px] text-bone/75 transition-colors hover:border-rule-bright hover:text-bone"
                  >
                    See it on a page
                  </a>
                </>
              ) : (
                <span className="font-mono text-[10px] text-bone/30">
                  An uploaded file can&apos;t travel in a link
                </span>
              )}
              <Button onClick={download} disabled={exporting}>
                {exporting ? "Exporting…" : "Download .glb"}
              </Button>
              {error && <span className="font-mono text-[10px] text-bone/45">{error}</span>}
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
