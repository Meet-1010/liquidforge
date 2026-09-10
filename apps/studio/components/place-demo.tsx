"use client"

import { useCallback, useEffect, useState } from "react"
import { LiquidSpot } from "liquidforge"
import { LiquidEditor, type SaveOutcome } from "liquidforge/editor"
import type { PlacementFile } from "liquidforge/placement"

const STORAGE_KEY = "liquidforge:place-demo"

/**
 * The editor, running on a page anyone can open.
 *
 * On your own machine the editor writes `liquidforge.placements.json` into your
 * repository. A hosted demo has no repository, and the previous version dealt
 * with that by not shipping the editor at all — which made the "try it on a
 * demo page" link an invitation to a page with nothing on it.
 *
 * So here the save is intercepted instead of removed. You get the whole editor,
 * every mode, and on save two things happen: the placement is kept in this
 * browser so a reload proves the point the real thing makes with a file, and
 * the file it *would* have written is put on screen to copy. Seeing that JSON
 * is most of the lesson — it is the entire artefact, and it is smaller than
 * people expect.
 */
export function PlaceDemo({ initial }: { initial: PlacementFile }) {
  const [placements, setPlacements] = useState<PlacementFile>(initial)
  const [saved, setSaved] = useState<PlacementFile | null>(null)
  const [copied, setCopied] = useState(false)
  const [restored, setRestored] = useState(false)

  // Pick up whatever this browser saved last time, so the demo keeps its
  // promise across a reload the way the file does across a deploy.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (!stored) return
      const parsed = JSON.parse(stored) as PlacementFile
      if (parsed && typeof parsed === "object" && parsed.drift) {
        setPlacements(parsed)
        setRestored(true)
      }
    } catch {
      // A private window, or something we did not write. Start from the default.
    }
  }, [])

  const handleSave = useCallback((next: PlacementFile): SaveOutcome => {
    setPlacements(next)
    setSaved(next)
    setCopied(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return { ok: true, message: "Saved to this browser. The file is below — that is what goes in your repo." }
    } catch {
      return { ok: true, message: "Kept for this session. The file is below — that is what goes in your repo." }
    }
  }, [])

  const reset = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* nothing to clear */
    }
    setPlacements(initial)
    setSaved(null)
    setRestored(false)
  }

  const json = JSON.stringify(saved ?? placements, null, 2)

  return (
    <>
      <LiquidSpot
        id="drift"
        placement={placements.drift}
        object={{ type: "shape", shape: "torusknot", detail: 180 }}
        preset="mercury-3"
      />

      <LiquidEditor placements={placements} onSave={handleSave} />

      <section id="the-file" className="relative z-10 mx-auto max-w-2xl scroll-mt-20 px-6 pb-24">
        <div className="rounded border border-rule bg-ink-2/70 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-mono text-[11px] tracking-[0.14em] text-bone/45 uppercase">
              {saved ? "What you just made" : "The file, as it stands"}
            </h2>
            <div className="flex items-center gap-3">
              {(saved || restored) && (
                <button
                  type="button"
                  onClick={reset}
                  className="font-mono text-[11px] text-bone/35 transition-colors hover:text-bone/70"
                >
                  reset
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(json).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  })
                }}
                className="rounded-[var(--radius-pill)] border border-rule px-3 py-1.5 font-mono text-[11px] text-bone/75 transition-colors hover:border-rule-bright hover:text-bone"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <p className="mt-3 text-[15px] leading-relaxed text-bone/60">
            {saved
              ? "That is the whole artefact. Put it in your repository as liquidforge.placements.json and the object is where you left it — no editor required, because the editor was only ever reading and writing this."
              : restored
                ? "Restored from your last visit. Everything below is what you saved — reload again and it will still be here."
                : "Open the editor, move the object, and this updates. It is about two hundred bytes: a few points, each a pair of fractions and sometimes a size."}
          </p>

          <pre className="mt-4 max-h-80 overflow-auto rounded border border-rule bg-ink px-4 py-3 font-mono text-[11px] leading-relaxed text-bone/70">
            {json}
          </pre>

          <p className="mt-3 font-mono text-[10px] leading-relaxed text-bone/30">
            On this page saving writes to your browser, because a hosted demo has no repository. In your own
            project the same button writes that file to disk, and the dev route that does it is four lines.
          </p>
        </div>
      </section>
    </>
  )
}
