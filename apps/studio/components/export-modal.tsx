"use client"

import { useEffect, useMemo, useState } from "react"
import { downloadBlob, exportModel, forgeGeometry, resolvePreset } from "liquidforge"
import type { LiquidEngine } from "liquidforge"
import {
  encodeState,
  generateCode,
  generateEmbed,
  type EmbedTarget,
  generatePlacementSetup,
  shareUrl,
  SHOWCASE_LAYOUTS,
  type LiquidConfig,
  type ShowcaseLayout,
} from "liquidforge/codegen"
import { submitUrl } from "@/lib/community"
import { Button, CopyButton, Field, Segmented, Toggle } from "./ui"

type Tab = "code" | "embed" | "place" | "preset" | "share"

/**
 * Five ways out.
 *
 * The component, for the common case. The same surface as an element and a
 * script tag, for Webflow, Framer and every site with no React in it. *Place it*, for the different question —
 * "I already have a site, how do I get this onto it and drag it where I want" —
 * which needs a recipe rather than a snippet. The preset as JSON, for anyone
 * keeping their looks in a design system rather than in JSX. And the `.glb`,
 * because the object forged here is real geometry and should not be trapped in
 * this page — the liquid surface is a shader and does not travel, but the mesh
 * does.
 */
export function ExportModal({
  config,
  engine,
  onClose,
}: {
  config: LiquidConfig
  /** The Studio's live engine, which renders the poster. */
  engine?: LiquidEngine | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>("code")
  const [layout, setLayout] = useState<ShowcaseLayout>("hero")
  /**
   * Whether the snippet paints its own ground.
   *
   * Off is the "drop it into the page I already have" answer, and it is asked
   * for far more often than the default implies — a hero handed to someone
   * whose layout already has a background should composite over it, not fight
   * it with a second one.
   */
  const [withBackground, setWithBackground] = useState(true)
  // Off by default: a poster is one more file to put in `public/`, worth it for
  // a hero above the fold and not for a badge in a footer.
  const [withPoster, setWithPoster] = useState(false)
  const [posterState, setPosterState] = useState<"idle" | "working" | "done">("idle")
  const [framework, setFramework] = useState<"next" | "vite">("next")
  const [embedTarget, setEmbedTarget] = useState<EmbedTarget>("webflow")
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
    if (tab === "place") return generatePlacementSetup(config, { framework })
    if (tab === "embed") return generateEmbed(config, { target: embedTarget })
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
    return generateCode(config, {
      showcase: layout,
      background: withBackground,
      poster: withPoster ? "/liquidforge-poster.webp" : undefined,
    })
  }, [config, tab, layout, withBackground, withPoster, framework, embedTarget])

  /**
   * The poster, rendered by the same engine at the preview's proportions.
   *
   * Same proportions matters: the still is shown with `object-fit: contain` and
   * then crossfades to the live surface, so a still framed for a different
   * shape would visibly jump at the swap.
   */
  const downloadPoster = async () => {
    if (!engine) return
    setPosterState("working")
    setError(null)
    try {
      const aspect = engine.camera.aspect || 16 / 10
      const width = 1920
      const height = Math.max(480, Math.min(2400, Math.round(width / aspect)))
      const blob = await engine.posterBlob(width, height, "image/webp", 0.9)
      if (!blob) throw new Error("Nothing on screen to render yet")
      downloadBlob(blob, "liquidforge-poster.webp")
      setPosterState("done")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setPosterState("idle")
    }
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin
  const share = origin ? shareUrl(config, `${origin}/studio`) : null
  const meta = SHOWCASE_LAYOUTS.find((entry) => entry.id === layout)

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
              { value: "code", label: "React" },
              { value: "embed", label: "No-code" },
              { value: "place", label: "Place it" },
              { value: "preset", label: "Preset JSON" },
              { value: "share", label: "Post it" },
            ]}
          />

          {tab === "embed" && (
            <Field
              label="Your site"
              hint="The same surface as the React component, as a <liquid-forge> element and one script — for sites that have no React to put a component in."
            >
              <Segmented
                value={embedTarget}
                onChange={setEmbedTarget}
                options={[
                  { value: "webflow" as const, label: "Webflow" },
                  { value: "framer" as const, label: "Framer" },
                  { value: "html" as const, label: "Any HTML" },
                ]}
              />
            </Field>
          )}

          {tab === "place" && (
            <Field
              label="Your setup"
              hint="Everything below is the whole integration, in the order you do it — including the two files you delete when you have finished placing."
            >
              <Segmented
                value={framework}
                onChange={setFramework}
                options={[
                  { value: "next" as const, label: "Next.js" },
                  { value: "vite" as const, label: "Vite" },
                ]}
              />
              <p className="mt-2 font-mono text-[10px] leading-relaxed text-bone/35">
                Never seen the editor?{" "}
                <a href="/place" target="_blank" rel="noreferrer" className="text-bone/70 underline underline-offset-2 hover:text-bone">
                  Try it on a demo page
                </a>{" "}
                first — same editor, someone else&apos;s article, nothing to install.
              </p>
            </Field>
          )}

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
              <Toggle label="Show a poster while it loads" checked={withPoster} onChange={setWithPoster} />
              {withPoster && (
                <p className="px-2 font-mono text-[10px] leading-relaxed text-bone/30">
                  The page paints a still straight away and swaps in the live surface once the browser
                  is idle. Download the poster below and put it in <code className="text-bone/60">public/</code>.
                </p>
              )}
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
              Posting has its own page, with a proper preview of what you are about to put up.
            </p>
            <p className="font-mono text-[10px] leading-relaxed text-bone/35">
              It goes live straight away — no fork, no pull request, no queue.
            </p>
          </div>
        ) : (
          <pre className="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-bone/75">
            {code}
          </pre>
        )}

        <footer className="flex flex-wrap items-center gap-2 border-t border-rule px-4 py-3">
          {tab === "share" ? (
            <>
              <a
                href={`/post?c=${encodeState(config)}`}
                className="inline-flex items-center rounded-[var(--radius-pill)] bg-bone px-3.5 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim"
              >
                Open the composer
              </a>
              <a
                href={submitUrl(config, { title: "", author: "", url: "" }, origin)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-[var(--radius-pill)] border border-rule bg-ink-2 px-3.5 py-2 font-mono text-[11px] text-bone/75 transition-colors hover:border-rule-bright hover:text-bone"
              >
                Open a PR instead
              </a>
            </>
          ) : (
            <>
              <CopyButton text={code} label="Copy" variant="primary" />
              {tab === "code" && withPoster && (
                <Button onClick={downloadPoster} disabled={!engine || posterState === "working"}>
                  {posterState === "working" ? "Rendering…" : posterState === "done" ? "Downloaded" : "Download poster"}
                </Button>
              )}
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
