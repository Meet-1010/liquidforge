"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LiquidCanvas, applyCheckpointState, checkpointAt, prepareSequence, samplePath, type LiquidEngine, type LiquidPreset, type ObjectSource, type PlacementPath } from "liquidforge"
import { BetaShell } from "@/components/beta-shell"
import { ClipFrame, ClipPanel, useClipSettings } from "@/components/clip-panel"
import { PresetSelect, WordInput } from "@/components/look-picker"
import { presetForPost } from "@/lib/community"
import type { Look } from "@/lib/store/types"

/**
 * Answer someone's post: your object melts into theirs, in one clip.
 *
 * Two looks on a timeline — yours, then theirs, and back again if you like —
 * driven exactly as the timeline experiment drives its moments. A bred or
 * tuned look is carried whole rather than by its colourway's name, so a duet
 * with a post shows that post as it really is.
 */

interface GalleryPost {
  id: string
  title: string
  author: string
  object: ObjectSource
  preset: string
  look?: Look
}

interface Side {
  label: string
  object: ObjectSource
  preset: string
}

export default function DuetPage() {
  return (
    <BetaShell slug="duet" wide>
      <DuetDemo />
    </BetaShell>
  )
}

function DuetDemo() {
  const [posts, setPosts] = useState<GalleryPost[]>([])
  const [theirsId, setTheirsId] = useState<string | null>(null)
  const [yoursId, setYoursId] = useState<string>("word")
  const [word, setWord] = useState("HI")
  const [wordPreset, setWordPreset] = useState("mercury-3")
  const [back, setBack] = useState(true)
  const [engine, setEngine] = useState<LiquidEngine | null>(null)
  const [readyEpoch, setReadyEpoch] = useState(0)
  const [settings, setSettings] = useClipSettings({ seconds: 6 })
  const [showSafe, setShowSafe] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("with")
    void fetch("/api/community?limit=60")
      .then((response) => response.json())
      .then((body: { posts: GalleryPost[] }) => {
        setPosts(body.posts)
        setTheirsId(body.posts.find((post) => post.id === requested)?.id ?? body.posts[0]?.id ?? null)
      })
  }, [])

  // A tuned or bred look isn't one of the named colourways, so each post's look
  // goes into the sequence under its own id, resolved from this table.
  const looks = useMemo<Record<string, LiquidPreset>>(() => Object.fromEntries(posts.map((post) => [`post:${post.id}`, presetForPost(post)])), [posts])
  const sideFor = useCallback((post: GalleryPost): Side => ({ label: `${post.title} by ${post.author}`, object: post.object, preset: `post:${post.id}` }), [])
  const theirsPost = posts.find((post) => post.id === theirsId)
  const yoursPost = posts.find((post) => post.id === yoursId)
  const yours: Side = yoursPost ? sideFor(yoursPost) : { label: word || "HI", object: { type: "text", value: word.trim() || "HI", depth: 0.5, bevel: 0.03 }, preset: wordPreset }
  const theirs: Side | null = theirsPost ? sideFor(theirsPost) : null

  const duration = settings.seconds
  const path = useMemo<PlacementPath | null>(() => {
    if (!theirs) return null
    const points: PlacementPath["points"] = [
      { x: 0.5, y: 0.5, at: 0 },
      { x: 0.5, y: 0.5, at: 0.42, object: theirs.object, preset: theirs.preset },
    ]
    if (back) points.push({ x: 0.5, y: 0.5, at: 0.86, object: yours.object, preset: yours.preset })
    points.push({ x: 0.5, y: 0.5, at: 1 })
    return { points, smooth: false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(theirs), JSON.stringify(yours), back])
  const sampled = useMemo(() => (path ? samplePath(path) : null), [path])
  const base = useMemo(() => ({ object: yours.object, preset: yours.preset }), [JSON.stringify(yours)]) // eslint-disable-line react-hooks/exhaustive-deps
  const morphWindow = 0.7 / duration
  const busy = useRef(false)
  const lastKey = useRef("")

  useEffect(() => {
    if (!engine || !path || readyEpoch === 0) return
    let cancelled = false
    void prepareSequence(engine, base, path.points.filter((point) => point.object || point.preset), { isCancelled: () => cancelled, prune: true, presets: looks }).then(() => {
      if (!cancelled) lastKey.current = ""
    })
    return () => {
      cancelled = true
    }
  }, [engine, path, base, readyEpoch, looks])

  useEffect(() => {
    if (!engine || !path || !sampled) return
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (busy.current) return
      const progress = (((now - started) / 1000) % duration) / duration
      lastKey.current = applyCheckpointState(engine, checkpointAt(path, sampled, progress, base, morphWindow), base, { lastKey: lastKey.current, presets: looks })
    }
    lastKey.current = ""
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [engine, path, sampled, base, morphWindow, duration, looks])

  const drive = useCallback(
    (_frame: number, _sub: number, seconds: number) => {
      if (!engine || !path || !sampled) return
      applyCheckpointState(engine, checkpointAt(path, sampled, Math.min(1, seconds / duration), base, morphWindow), base, { presets: looks })
    },
    [engine, path, sampled, base, morphWindow, duration, looks],
  )

  const caption = theirsPost ? `Duet with “${theirsPost.title}” by ${theirsPost.author} — made with Liquidforge` : ""

  const picker = (value: string | null, onChange: (id: string) => void, label: string, allowWord: boolean) => (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] text-bone/55">{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[var(--radius-sm)] border border-rule bg-ink px-3 py-2 font-mono text-[12px] text-bone/85 outline-none focus:border-bone"
      >
        {allowWord && <option value="word">A word of my own</option>}
        {posts.map((post) => (
          <option key={post.id} value={post.id}>
            {post.title} · {post.author}
          </option>
        ))}
      </select>
    </label>
  )

  if (posts.length === 0) return <p className="font-mono text-[11px] text-bone/40">Reading the gallery…</p>

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
      <div className="min-w-0 space-y-4">
        <ClipFrame format={settings.format} showSafe={showSafe}>
          <LiquidCanvas
            object={base.object}
            preset={looks[base.preset] ?? base.preset}
            onEngine={setEngine}
            onReady={() => setReadyEpoch((value) => value + 1)}
            style={{ position: "absolute", inset: 0, minHeight: 0 }}
          />
        </ClipFrame>
        {caption && (
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-rule bg-ink-2 px-3 py-2">
            <p className="min-w-0 flex-1 font-mono text-[11px] text-bone/70">{caption}</p>
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard?.writeText(caption).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                })
              }
              className="font-mono text-[10px] text-bone/50 hover:text-bone"
            >
              {copied ? "Copied" : "Copy the credit"}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-3 rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4">
          {picker(theirsId, setTheirsId, "Answering", false)}
          {picker(yoursId, setYoursId, "With", true)}
          {yoursId === "word" && (
            <div className="grid grid-cols-2 gap-3">
              <WordInput value={word} onChange={setWord} max={10} />
              <PresetSelect value={wordPreset} onChange={setWordPreset} />
            </div>
          )}
          <label className="flex items-center gap-2 font-mono text-[11px] text-bone/60">
            <input type="checkbox" checked={back} onChange={(event) => setBack(event.target.checked)} />
            Melt back at the end, so the clip loops
          </label>
        </div>
        <ClipPanel
          engine={engine}
          settings={settings}
          onChange={setSettings}
          showSafe={showSafe}
          onShowSafe={setShowSafe}
          fileName="liquidforge-duet"
          drive={drive}
          preroll={false}
          onBusy={(value) => {
            busy.current = value
            lastKey.current = ""
          }}
        />
      </div>
    </div>
  )
}
