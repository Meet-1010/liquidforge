"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { COLLECTIONS } from "../presets"
import { SHAPE_KINDS } from "../forge/shapes"
import type { ObjectSource, ShapeKind } from "../types"
import { pathToSvg, samplePath } from "../placement/path"
import { collectContent, routeThroughWhitespace } from "../placement/route"
import { selectorFor } from "../placement/anchors"
import { listSpots, placementListenerCount, setOverride, setScrub } from "../placement/live-store"
import {
  BREAKPOINTS,
  breakpointFor,
  DEFAULT_PLACEMENT,
  resolveBreakpoint,
  type BreakpointName,
  type Placement,
  type PlacementFile,
  type PlacementPoint,
} from "../placement/types"
import { DEFAULT_ENDPOINT, savePlacements } from "./save"

/**
 * The editor you drop into your own site, use, and then delete.
 *
 * It is deliberately not a route, a panel, or a separate app: the whole point
 * is to place things against your real page, with your real content, at your
 * real breakpoints. So it opens on top of the site it is editing.
 *
 * ```tsx
 * {process.env.NODE_ENV !== "production" && <LiquidEditor placements={placements} />}
 * ```
 *
 * Everything it changes lives in `liquidforge.placements.json` in your repo.
 * When you are finished, delete the line above; the JSON stays, the runtime
 * keeps reading it, and nothing about the page changes. Put the line back and
 * the editor reads that same file and picks up exactly where you left it —
 * there is no editor-side state to get out of sync, because there is no
 * editor-side state.
 *
 * ## What it edits
 *
 * - **Place** — drag the object; with a route, the whole route moves with it.
 * - **Path** — drag out the route it takes as the page scrolls, or let
 *   *Route around content* draw one through the page's empty space.
 * - **Size** — how big it is at the selected point.
 * - **Rotate** — turn and tip it in 3D at the selected point; scrolling
 *   between points with different rotations turns the object as it travels.
 * - **Pin** — tie the selected point to an element on the page.
 * - **Checkpoints** — select a point and give it a different element or look;
 *   scrolling past it melts the object into that.
 * - **Breakpoints** — narrow the window and you are editing the tablet or phone
 *   placement, which starts from the desktop one.
 */

type Mode = "place" | "path" | "size" | "rotate" | "pin"
type Rotation = { turn: number; tilt: number; spin: number }

const INK = "#0c0c0f"
const BONE = "#f2f0ec"
const LINE = "rgba(242,240,236,0.16)"
const COPPER = "#ff9a5a"
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace"

export interface LiquidEditorProps {
  /** Your placements file, as imported. The editor starts from these. */
  placements?: PlacementFile
  /** Where to POST saves. @default "/api/liquidforge/placements" */
  endpoint?: string
  /**
   * Handle the save yourself. Given this, the editor never calls the endpoint.
   *
   * The reason this exists: a hosted demo has no repository to write to, and
   * the honest way to show someone the editor is to let them use all of it and
   * then hand them the file it would have written. Return the sentence to show
   * them afterwards.
   */
  onSave?: (placements: PlacementFile) => Promise<SaveOutcome> | SaveOutcome
  /** Open on mount, rather than waiting to be summoned. @default false */
  defaultOpen?: boolean
}

export interface SaveOutcome {
  ok: boolean
  message: string
}

interface Proposal {
  id: string
  placement: Placement
  route?: "whitespace"
  note?: string
}

export function LiquidEditor({
  placements = {},
  endpoint = DEFAULT_ENDPOINT,
  onSave,
  defaultOpen = false,
}: LiquidEditorProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [draft, setDraft] = useState<PlacementFile>(placements)
  const [spots, setSpots] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("place")
  const [selected, setSelected] = useState<number | null>(null)
  const [scrubAt, setScrubAt] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [detached, setDetached] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [hover, setHover] = useState<DOMRect | null>(null)
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth))

  const rootRef = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const dragging = useRef<
    | { kind: "point"; index: number }
    | { kind: "whole"; x: number; y: number }
    | { kind: "rotate"; index: number | null; clientX: number; clientY: number; turn: number; tilt: number }
    | null
  >(null)
  // Set while a rotate drag is holding the preview at a point's moment, so
  // letting go hands the scroll back.
  const rotateScrub = useRef(false)

  const flash = useCallback((message: string, ms = 5000) => {
    setStatus(message)
    window.setTimeout(() => setStatus((current) => (current === message ? null : current)), ms)
  }, [])

  /* ---------- breakpoint ---------- */

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  const bucket: BreakpointName | null = breakpointFor(width)

  const full: Placement = (active && draft[active]) || DEFAULT_PLACEMENT
  /** The placement being edited: the full one on desktop, the override below a breakpoint. */
  const placement = useMemo(() => resolveBreakpoint(full, width), [full, width])
  const hasOverride = Boolean(bucket && full.breakpoints?.[bucket])

  /* ---------- discovery ---------- */

  useEffect(() => {
    if (!open) return
    const found = listSpots()
    setSpots(found)
    setActive((current) => current ?? found[0] ?? null)

    /*
     * Spots on the page but nothing listening means the editor and the runtime
     * ended up with different copies of the live store. Everything looks fine
     * when that happens: handles drag, the file saves, and the object simply
     * never moves until you reload. Worth saying out loud.
     */
    const timer = setTimeout(() => {
      setDetached(found.length > 0 && placementListenerCount() === 0)
    }, 200)
    return () => clearTimeout(timer)
  }, [open])

  /* ---------- push the draft into the live objects ---------- */

  useEffect(() => {
    if (!open || !active) return
    setOverride(active, draft[active])
    return () => setOverride(active, undefined)
  }, [open, active, draft])

  useEffect(() => {
    if (!active) return
    setScrub(active, scrubAt ?? undefined)
    return () => setScrub(active, undefined)
  }, [active, scrubAt])

  /* ---------- the frame we are editing in ---------- */

  const frameBox = useCallback((): DOMRect => {
    if (placement.frame === "section" && active) {
      const host = document.querySelector(`[data-liquidforge-spot="${CSS.escape(active)}"]`)
      if (host) return host.getBoundingClientRect()
    }
    return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
  }, [placement.frame, active])

  const toFraction = useCallback(
    (clientX: number, clientY: number) => {
      const box = frameBox()
      return { x: (clientX - box.left) / box.width, y: (clientY - box.top) / box.height }
    },
    [frameBox],
  )

  /* ---------- mutation ---------- */

  /**
   * Write the edited placement back — to the full placement on desktop, or to
   * this breakpoint's override below one. The first edit at a breakpoint copies
   * what was inherited, so a phone placement starts as the desktop one and not
   * as an empty screen.
   */
  const update = useCallback(
    (next: Placement) => {
      if (!active) return
      setDraft((current) => {
        const base = current[active] ?? DEFAULT_PLACEMENT
        if (!bucket) return { ...current, [active]: { ...next, breakpoints: base.breakpoints } }
        const override = { origin: next.origin, path: next.path, object: next.object, preset: next.preset, frame: next.frame }
        return { ...current, [active]: { ...base, breakpoints: { ...base.breakpoints, [bucket]: override } } }
      })
      setDirty(true)
    },
    [active, bucket],
  )

  const points = placement.path?.points ?? []
  const sampled = useMemo(() => (placement.path ? samplePath(placement.path) : null), [placement.path])

  const updatePoint = (index: number, patch: (point: PlacementPoint) => PlacementPoint) => {
    if (!placement.path) return
    update({ ...placement, path: { ...placement.path, points: placement.path.points.map((p, i) => (i === index ? patch(p) : p)) } })
  }

  /* ---------- routing ---------- */

  const routeAroundContent = useCallback(
    (from: Placement): Placement => {
      const exclude = [rootRef.current, ...Array.from(document.querySelectorAll("[data-liquidforge-spot]"))].filter(
        (element): element is Element => Boolean(element),
      )
      const { content, fixed } = collectContent(exclude)
      const size = from.origin.size ?? from.path?.points[0]?.size ?? 0.3
      const { points: routed, fit } = routeThroughWhitespace({
        content,
        fixed,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        documentHeight: document.documentElement.scrollHeight,
        size,
        // Someone pressing this wants a route, not a parked object: travel
        // through whatever room the page leaves.
        roam: 0.6,
      })

      // Keep the checkpoints: each moves to the routed point nearest its moment,
      // taking its object and look along.
      const previous = from.path ? samplePath(from.path) : null
      const withCheckpoints = routed.map((point) => ({ ...point }))
      from.path?.points.forEach((point, i) => {
        if (!point.object && !point.preset) return
        const at = previous?.ats[i] ?? 0
        let nearest = 0
        withCheckpoints.forEach((candidate, j) => {
          if (Math.abs((candidate.at ?? 0) - at) < Math.abs((withCheckpoints[nearest].at ?? 0) - at)) nearest = j
        })
        Object.assign(withCheckpoints[nearest], {
          ...(point.object ? { object: point.object } : {}),
          ...(point.preset ? { preset: point.preset } : {}),
        })
      })

      const tight = fit.filter((value) => value < 0.6).length
      flash(
        `Routed through ${routed.length} moments of empty space${tight ? ` — ${tight} of them tight, so the object shrinks there` : ""}.`,
      )
      return {
        ...from,
        origin: { ...from.origin, x: withCheckpoints[0].x, y: withCheckpoints[0].y, size: withCheckpoints[0].size },
        path: { ease: from.path?.ease ?? 0.12, ...from.path, points: withCheckpoints },
      }
    },
    [flash],
  )

  /* ---------- the agent's proposal ---------- */

  useEffect(() => {
    if (onSave || typeof window === "undefined") return
    let cancelled = false
    fetch(`${endpoint}?proposal=1`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { proposal?: Proposal | null } | null) => {
        if (cancelled || !body?.proposal) return
        setProposal(body.proposal)
        setOpen(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [endpoint, onSave])

  // Applied once the page's spots are known, so a proposal for an id that is
  // not on this page can say so instead of editing nothing.
  const applied = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !proposal || applied.current === proposal.id) return
    const found = listSpots()
    if (!found.includes(proposal.id)) {
      flash(`Your agent proposed a placement for "${proposal.id}", but there is no <LiquidSpot id="${proposal.id}"> on this page.`, 9000)
      return
    }
    applied.current = proposal.id
    setActive(proposal.id)
    // Routing needs the real page, which is exactly why it happens here rather
    // than in the agent: the agent cannot see where the text is.
    const next = proposal.route === "whitespace" ? routeAroundContent(proposal.placement) : proposal.placement
    setDraft((current) => ({ ...current, [proposal.id]: next }))
    setDirty(true)
  }, [open, proposal, routeAroundContent, flash])

  const clearProposal = () => {
    fetch(`${endpoint}?proposal=1`, { method: "DELETE" }).catch(() => {})
    setProposal(null)
  }

  /* ---------- pointer handling ---------- */

  const elementUnder = (clientX: number, clientY: number): Element | null => {
    const root = rootRef.current
    for (const element of document.elementsFromPoint(clientX, clientY)) {
      if (root?.contains(element)) continue
      if (element.closest("[data-liquidforge-spot]")) continue
      if (element === document.body || element === document.documentElement) continue
      return element
    }
    return null
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (!active) return

    if (mode === "pin") {
      const element = elementUnder(event.clientX, event.clientY)
      if (!element || selected == null || !placement.path) return
      const rect = element.getBoundingClientRect()
      const { selector, robust } = selectorFor(element)
      const ay = Math.round(Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))) * 100) / 100
      updatePoint(selected, (point) => ({ ...point, anchor: { selector, ay }, at: undefined }))
      setHover(null)
      setMode("path")
      flash(
        robust
          ? `Pinned to ${selector}. The object reaches this point when that element reaches the same height on screen, wherever the copy moves it.`
          : `Pinned to ${selector} — a structural selector, which breaks if the layout changes. Give the element an id for a pin that lasts.`,
        8000,
      )
      return
    }

    const { x, y } = toFraction(event.clientX, event.clientY)
    // Capture keeps a drag alive when the pointer outruns the handle. It can
    // throw — a pen lifted mid-event, a pointer the browser already released —
    // and a throw here used to abort the handler before the press registered.
    try {
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
    } catch {
      /* the drag still works, it just will not follow the pointer off-window */
    }

    if (mode === "rotate") {
      const hit = nearestPoint(points, x, y, frameBox(), 14)
      // With nothing picked, the start of the route: later points carry its
      // rotation forward unless they set their own.
      const index = hit ?? (placement.path ? (selected ?? 0) : null)
      if (hit != null) setSelected(hit)
      // Hold the preview at that point's moment for the length of the drag, so
      // what turns is what the reader will see there.
      if (index != null && sampled) {
        rotateScrub.current = true
        setScrubAt(sampled.ats[index] ?? 0)
      }
      const start = rotationAt(index)
      dragging.current = { kind: "rotate", index, clientX: event.clientX, clientY: event.clientY, turn: start.turn, tilt: start.tilt }
      return
    }

    // Grabbing an existing path point always wins over starting something new.
    const hit = nearestPoint(points, x, y, frameBox(), 14)
    if (hit != null) {
      if (event.altKey && points.length > 1) {
        const next = points.filter((_, i) => i !== hit)
        update({ ...placement, path: { ...placement.path!, points: next } })
        setSelected(null)
        return
      }
      dragging.current = { kind: "point", index: hit }
      setSelected(hit)
      return
    }

    if (mode === "place") {
      if (points.length > 0) {
        // Move the whole route, keeping its shape. Anchored on the first point
        // so what you grabbed is what ends up under the cursor.
        dragging.current = { kind: "whole", x: x - points[0].x, y: y - points[0].y }
      } else {
        update({ ...placement, origin: { ...placement.origin, x, y } })
        dragging.current = { kind: "whole", x: 0, y: 0 }
      }
      return
    }

    if (mode === "path") {
      drawing.current = true
      const size = placement.origin.size ?? 0.34
      update({
        ...placement,
        origin: { ...placement.origin, x, y },
        path: { points: [{ x, y, size }], ease: placement.path?.ease ?? 0.12, smooth: placement.path?.smooth !== false, morph: placement.path?.morph },
      })
      setSelected(0)
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!active) return

    if (mode === "pin") {
      const element = elementUnder(event.clientX, event.clientY)
      setHover(element ? element.getBoundingClientRect() : null)
      return
    }

    const { x, y } = toFraction(event.clientX, event.clientY)

    if (drawing.current && placement.path) {
      const last = placement.path.points[placement.path.points.length - 1]
      const box = frameBox()
      // One point every ~18 device pixels. Dense enough that the curve follows
      // the hand, sparse enough that the file stays small.
      if (Math.hypot((x - last.x) * box.width, (y - last.y) * box.height) < 18) return
      update({ ...placement, path: { ...placement.path, points: [...placement.path.points, { x, y }] } })
      return
    }

    const drag = dragging.current
    if (!drag) return

    if (drag.kind === "rotate") {
      // About a turn across a wide window: fine enough to set an angle by hand,
      // quick enough to spin it round. Tipping stops at a half turn either way.
      const turn = Math.round((drag.turn + (event.clientX - drag.clientX) / 960) * 1000) / 1000
      const tilt = Math.round(Math.max(-0.5, Math.min(0.5, drag.tilt + (event.clientY - drag.clientY) / 960)) * 1000) / 1000
      setRotation(drag.index, { turn, tilt })
      return
    }

    if (drag.kind === "point" && placement.path) {
      const next = placement.path.points.map((point, i) => (i === drag.index ? { ...point, x, y } : point))
      const patch: Placement = { ...placement, path: { ...placement.path, points: next } }
      if (drag.index === 0) patch.origin = { ...placement.origin, x, y }
      update(patch)
      return
    }

    if (drag.kind === "whole") {
      if (placement.path && placement.path.points.length > 0) {
        const first = placement.path.points[0]
        const dx = x - drag.x - first.x
        const dy = y - drag.y - first.y
        const next = placement.path.points.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy }))
        update({
          ...placement,
          origin: { ...placement.origin, x: next[0].x, y: next[0].y },
          path: { ...placement.path, points: next },
        })
      } else {
        update({ ...placement, origin: { ...placement.origin, x, y } })
      }
    }
  }

  const endPointer = () => {
    drawing.current = false
    dragging.current = null
    if (rotateScrub.current) {
      rotateScrub.current = false
      setScrubAt(null)
    }
  }

  /* ---------- size ---------- */

  const sizeOfSelected = (): number => {
    if (selected != null && points[selected]?.size != null) return points[selected].size!
    for (let i = (selected ?? points.length) - 1; i >= 0; i -= 1) {
      if (points[i]?.size != null) return points[i].size!
    }
    return placement.origin.size ?? 0.34
  }

  const setSize = (value: number) => {
    if (selected != null && placement.path) updatePoint(selected, (point) => ({ ...point, size: value }))
    else update({ ...placement, origin: { ...placement.origin, size: value } })
  }

  /* ---------- rotation ---------- */

  /** The rotation in force at a point: its own, or carried forward from an earlier one. */
  const rotationAt = (index: number | null): Rotation => {
    const pick = (key: keyof Rotation): number => {
      if (!placement.path || index == null) return placement.origin[key] ?? 0
      for (let i = index; i >= 0; i -= 1) {
        const value = points[i]?.[key]
        if (value != null) return value
      }
      return placement.origin[key] ?? 0
    }
    return { turn: pick("turn"), tilt: pick("tilt"), spin: pick("spin") }
  }

  const setRotation = (index: number | null, patch: Partial<Rotation>) => {
    if (index != null && placement.path) updatePoint(index, (point) => ({ ...point, ...patch }))
    else update({ ...placement, origin: { ...placement.origin, ...patch } })
  }

  /* ---------- the element: the placement's own, or a checkpoint's ---------- */

  const checkpointIndex = selected != null && selected > 0 ? selected : null
  const checkpoint = checkpointIndex != null ? points[checkpointIndex] : null
  const elementObject = checkpoint?.object ?? (checkpointIndex == null ? placement.object : undefined)
  const elementPreset = checkpoint?.preset ?? (checkpointIndex == null ? placement.preset : undefined)

  const setElementObject = (object: ObjectSource) => {
    if (checkpointIndex != null) updatePoint(checkpointIndex, (point) => ({ ...point, object }))
    else update({ ...placement, object })
  }
  const setElementPreset = (preset: string) => {
    if (checkpointIndex != null) updatePoint(checkpointIndex, (point) => ({ ...point, preset }))
    else update({ ...placement, preset })
  }
  const removeCheckpoint = () => {
    if (checkpointIndex == null) return
    updatePoint(checkpointIndex, (point) => {
      const { object: _o, preset: _p, ...rest } = point
      return rest
    })
  }

  /* ---------- saving ---------- */

  const save = async () => {
    setStatus("Saving…")

    if (onSave) {
      const outcome = await onSave(draft)
      if (outcome.ok) setDirty(false)
      flash(outcome.message, 6000)
      return
    }

    const result = await savePlacements(draft, endpoint)
    if (result.ok) {
      setDirty(false)
      if (proposal) clearProposal()
      flash(`Saved to ${result.file}`)
    } else {
      flash(result.error, 8000)
    }
  }

  const revert = () => {
    setDraft(placements)
    setSelected(null)
    setDirty(false)
    if (proposal) clearProposal()
  }

  /* ---------- keyboard ---------- */

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "e" && (event.metaKey || event.ctrlKey) && event.shiftKey) {
        event.preventDefault()
        setOpen((value) => !value)
        return
      }
      if (!open) return
      const typing = (event.target as HTMLElement | null)?.closest?.("input, textarea, select")
      if (typing) return
      if (event.key === "Escape") {
        if (mode === "pin") setMode("path")
        else setOpen(false)
      }
      if (event.key === "1") setMode("place")
      if (event.key === "2") setMode("path")
      if (event.key === "3") setMode("size")
      if (event.key === "4") setMode("rotate")
      if ((event.key === "s" || event.key === "S") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft, mode])

  const svg = useMemo(() => {
    if (!placement.path || placement.path.points.length < 2) return ""
    const box = typeof window === "undefined" ? new DOMRect(0, 0, 1, 1) : frameBox()
    return pathToSvg(placement.path, box.width, box.height)
  }, [placement.path, frameBox])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Place liquidforge objects (⌘⇧E)"
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 2147483000,
          width: 42,
          height: 42,
          borderRadius: 999,
          border: `1px solid ${LINE}`,
          background: INK,
          color: BONE,
          font: `600 13px ${MONO}`,
          cursor: "pointer",
          boxShadow: "0 6px 22px rgba(0,0,0,.45)",
        }}
      >
        lf
      </button>
    )
  }

  const box = typeof window === "undefined" ? { width: 0, height: 0, left: 0, top: 0 } : frameBox()
  const anchoredRect =
    checkpoint?.anchor?.selector || (selected != null && points[selected]?.anchor)
      ? (() => {
          const selector = points[selected!]?.anchor?.selector
          if (!selector) return null
          try {
            return document.querySelector(selector)?.getBoundingClientRect() ?? null
          } catch {
            return null
          }
        })()
      : null

  const hasCheckpoints = points.some((point) => point.object || point.preset)

  return (
    <div ref={rootRef} style={{ position: "fixed", inset: 0, zIndex: 2147483000, font: `12px ${MONO}` }}>
      {/* The drawing surface. Transparent, so you are placing against the real
          page rather than against a mock of it. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={() => mode === "pin" && setHover(null)}
        style={{
          position: "absolute",
          inset: 0,
          cursor: mode === "pin" ? "cell" : mode === "path" ? "crosshair" : "grab",
          touchAction: "none",
        }}
      />

      <svg
        style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        {/* The element being hovered while pinning, and the one the selected point is pinned to. */}
        {hover && (
          <rect x={hover.left} y={hover.top} width={hover.width} height={hover.height} fill="rgba(255,154,90,0.08)" stroke={COPPER} strokeWidth={1.5} strokeDasharray="4 4" />
        )}
        {anchoredRect && (
          <rect x={anchoredRect.left} y={anchoredRect.top} width={anchoredRect.width} height={anchoredRect.height} fill="none" stroke={COPPER} strokeWidth={1} opacity={0.5} />
        )}

        <g transform={`translate(${box.left} ${box.top})`}>
          {svg && (
            <>
              <path d={svg} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={4} strokeLinecap="round" />
              <path d={svg} fill="none" stroke={COPPER} strokeWidth={2} strokeLinecap="round" strokeDasharray="1 7" />
            </>
          )}
          {points.map((point, i) => {
            const cx = point.x * box.width
            const cy = point.y * box.height
            const isCheckpoint = Boolean(point.object || point.preset)
            const r = i === selected ? 8 : 6
            return (
              <g key={i}>
                {isCheckpoint ? (
                  // A checkpoint is a diamond, so the moments where the object
                  // changes read at a glance along the route.
                  <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} transform={`rotate(45 ${cx} ${cy})`} fill={COPPER} stroke="rgba(0,0,0,0.6)" strokeWidth={2} />
                ) : (
                  <circle cx={cx} cy={cy} r={r - 1} fill={i === 0 ? COPPER : BONE} stroke="rgba(0,0,0,0.55)" strokeWidth={2} />
                )}
                {point.anchor && (
                  <text x={cx + 11} y={cy - 9} fill={COPPER} fontSize={11} fontFamily={MONO}>
                    ⌖
                  </text>
                )}
                {point.size != null && (mode === "size" || i === selected) && (
                  <circle cx={cx} cy={cy} r={(point.size * box.width) / 2} fill="none" stroke={COPPER} strokeWidth={1} strokeDasharray="3 5" opacity={i === selected ? 0.5 : 0.25} />
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {proposal && (
        <div
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "9px 12px",
            borderRadius: 12,
            background: "rgba(12,12,15,0.94)",
            border: `1px solid ${COPPER}`,
            color: BONE,
            maxWidth: "min(92vw, 640px)",
            boxShadow: "0 10px 30px rgba(0,0,0,.5)",
          }}
        >
          <span style={{ color: COPPER, fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase" }}>Proposed</span>
          <span style={{ fontSize: 12, opacity: 0.85, flex: 1 }}>
            {proposal.note ?? `Your agent placed "${proposal.id}"${proposal.route === "whitespace" ? " and routed it through the page's empty space" : ""}.`} Adjust it, then save — or discard.
          </span>
          <button type="button" onClick={revert} style={pillStyle}>
            Discard
          </button>
        </div>
      )}

      <Toolbar
        bucket={bucket}
        hasOverride={hasOverride}
        onResetBreakpoint={() => {
          if (!active || !bucket) return
          setDraft((current) => {
            const base = current[active]
            if (!base?.breakpoints) return current
            const { [bucket]: _dropped, ...rest } = base.breakpoints
            return { ...current, [active]: { ...base, breakpoints: Object.keys(rest).length ? rest : undefined } }
          })
          setDirty(true)
        }}
        elementLabel={checkpointIndex != null ? `Checkpoint · point ${checkpointIndex + 1}` : "Element"}
        object={elementObject}
        onObject={setElementObject}
        preset={elementPreset ?? (checkpointIndex != null ? "" : "mercury-3")}
        onPreset={setElementPreset}
        isCheckpoint={Boolean(checkpoint && (checkpoint.object || checkpoint.preset))}
        onRemoveCheckpoint={removeCheckpoint}
        spots={spots}
        active={active}
        onActive={(id) => {
          setActive(id)
          setSelected(null)
        }}
        mode={mode}
        onMode={(next) => {
          if (next === "pin" && selected == null) {
            flash("Select a point on the route first, then pin it to an element.")
            return
          }
          setMode(next)
        }}
        size={sizeOfSelected()}
        onSize={setSize}
        rotation={rotationAt(placement.path ? (selected ?? 0) : null)}
        onRotation={(patch) => setRotation(placement.path ? (selected ?? 0) : null, patch)}
        selected={selected}
        pointCount={points.length}
        ease={placement.path?.ease ?? 0.12}
        onEase={(ease) => placement.path && update({ ...placement, path: { ...placement.path, ease } })}
        morph={placement.path?.morph ?? 0.06}
        onMorph={(morph) => placement.path && update({ ...placement, path: { ...placement.path, morph } })}
        hasCheckpoints={hasCheckpoints}
        moment={selected != null ? (points[selected]?.at ?? sampled?.ats[selected] ?? 0) : null}
        momentAuto={selected != null ? points[selected]?.at === undefined && !points[selected]?.anchor : true}
        anchor={selected != null ? (points[selected]?.anchor?.selector ?? null) : null}
        onMoment={(at) => selected != null && updatePoint(selected, (point) => ({ ...point, at, anchor: undefined }))}
        onMomentAuto={() => selected != null && updatePoint(selected, (point) => {
          const { at: _a, anchor: _n, ...rest } = point
          return rest
        })}
        frame={placement.frame ?? "viewport"}
        onFrame={(frame) => update({ ...placement, frame })}
        scrubAt={scrubAt}
        onScrub={setScrubAt}
        hasPath={points.length > 1}
        onRoute={() => update(routeAroundContent(placement))}
        onClearPath={() => {
          const { path: _dropped, ...rest } = placement
          update(rest as Placement)
          setSelected(null)
        }}
        dirty={dirty}
        status={
          detached
            ? "Objects found, but none are listening — the editor and the runtime have separate copies of the placement store. Edits will only show after a save and reload."
            : status
        }
        onSave={save}
        onRevert={revert}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}

/** Which handle is under the cursor, if any. */
function nearestPoint(
  points: PlacementPoint[],
  x: number,
  y: number,
  box: { width: number; height: number },
  radius: number,
): number | null {
  let best: number | null = null
  let bestDistance = radius
  points.forEach((point, i) => {
    const distance = Math.hypot((point.x - x) * box.width, (point.y - y) * box.height)
    if (distance <= bestDistance) {
      bestDistance = distance
      best = i
    }
  })
  return best
}

/* ------------------------------------------------------------------ */

const pillStyle: React.CSSProperties = {
  border: `1px solid ${LINE}`,
  background: "transparent",
  color: BONE,
  borderRadius: 999,
  padding: "5px 11px",
  font: `12px ${MONO}`,
  cursor: "pointer",
  whiteSpace: "nowrap",
}
const onStyle: React.CSSProperties = { ...pillStyle, background: BONE, color: INK, border: `1px solid ${BONE}` }
const labelStyle: React.CSSProperties = { fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", opacity: 0.45, whiteSpace: "nowrap" }

interface ToolbarProps {
  bucket: BreakpointName | null
  hasOverride: boolean
  onResetBreakpoint: () => void
  elementLabel: string
  object: ObjectSource | undefined
  onObject: (object: ObjectSource) => void
  preset: string
  onPreset: (preset: string) => void
  isCheckpoint: boolean
  onRemoveCheckpoint: () => void
  spots: string[]
  active: string | null
  onActive: (id: string) => void
  mode: Mode
  onMode: (mode: Mode) => void
  size: number
  onSize: (value: number) => void
  rotation: Rotation
  onRotation: (patch: Partial<Rotation>) => void
  selected: number | null
  pointCount: number
  ease: number
  onEase: (value: number) => void
  morph: number
  onMorph: (value: number) => void
  hasCheckpoints: boolean
  moment: number | null
  momentAuto: boolean
  anchor: string | null
  onMoment: (value: number) => void
  onMomentAuto: () => void
  frame: "viewport" | "section"
  onFrame: (frame: "viewport" | "section") => void
  scrubAt: number | null
  onScrub: (value: number | null) => void
  hasPath: boolean
  onRoute: () => void
  onClearPath: () => void
  dirty: boolean
  status: string | null
  onSave: () => void
  onRevert: () => void
  onClose: () => void
}

function Toolbar(props: ToolbarProps) {
  const kind = props.object?.type ?? "shape"
  const shape = props.object?.type === "shape" ? props.object.shape : "torusknot"
  const text = props.object?.type === "text" ? props.object.value : ""
  const src = props.object?.type === "model" ? props.object.src : ""
  const [draftText, setDraftText] = useState(text)
  const [draftSrc, setDraftSrc] = useState(src)
  useEffect(() => setDraftText(text), [text])
  useEffect(() => setDraftSrc(src), [src])

  const breakpointName = props.bucket === "phone" ? `Phone ≤${BREAKPOINTS.phone}px` : props.bucket === "tablet" ? `Tablet ≤${BREAKPOINTS.tablet}px` : "Desktop"

  return (
    <div
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        left: "50%",
        bottom: 20,
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 14,
        border: `1px solid ${LINE}`,
        background: "rgba(12,12,15,0.92)",
        backdropFilter: "blur(10px)",
        color: BONE,
        boxShadow: "0 14px 44px rgba(0,0,0,.55)",
        width: "min(94vw, 900px)",
      }}
    >
      {/*
        What it is, before where it goes. Native selects rather than grids of
        swatches: this bar floats over someone else's page and has to stay small,
        and a select holds a hundred and eight options without taking room until opened.
        With a point selected, this row edits that point — which makes it a
        checkpoint the object melts into as the page scrolls past it.
      */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...labelStyle, color: props.elementLabel === "Element" ? undefined : COPPER, opacity: props.elementLabel === "Element" ? 0.45 : 1 }}>
          {props.elementLabel}
        </span>
        <select
          value={kind}
          aria-label="Kind"
          onChange={(event) => {
            const next = event.target.value
            if (next === "shape") props.onObject({ type: "shape", shape: "torusknot", detail: 180 } as ObjectSource)
            if (next === "text") props.onObject({ type: "text", value: draftText || "HELLO" } as ObjectSource)
            if (next === "model") props.onObject({ type: "model", src: draftSrc } as ObjectSource)
          }}
          style={{ ...pillStyle, background: INK }}
        >
          <option value="shape">shape</option>
          <option value="text">text</option>
          <option value="model">model</option>
        </select>
        {kind === "shape" && (
          <select
            value={shape}
            onChange={(event) => props.onObject({ type: "shape", shape: event.target.value as ShapeKind, detail: 180 } as ObjectSource)}
            style={{ ...pillStyle, background: INK }}
            aria-label="Shape"
          >
            {SHAPE_KINDS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
        {kind === "text" && (
          <input
            value={draftText}
            maxLength={24}
            aria-label="Text"
            onChange={(event) => setDraftText(event.target.value)}
            onBlur={() => draftText.trim() && props.onObject({ type: "text", value: draftText } as ObjectSource)}
            onKeyDown={(event) => event.key === "Enter" && draftText.trim() && props.onObject({ type: "text", value: draftText } as ObjectSource)}
            style={{ ...pillStyle, background: INK, width: 120, cursor: "text" }}
          />
        )}
        {kind === "model" && (
          <input
            value={draftSrc}
            placeholder="https://…/model.glb"
            aria-label="Model URL"
            onChange={(event) => setDraftSrc(event.target.value)}
            onBlur={() => draftSrc && props.onObject({ type: "model", src: draftSrc } as ObjectSource)}
            onKeyDown={(event) => event.key === "Enter" && draftSrc && props.onObject({ type: "model", src: draftSrc } as ObjectSource)}
            style={{ ...pillStyle, background: INK, width: 220, cursor: "text" }}
          />
        )}
        <select
          value={props.preset}
          onChange={(event) => props.onPreset(event.target.value)}
          style={{ ...pillStyle, background: INK }}
          aria-label="Look"
        >
          {!props.preset && <option value="">keep the look</option>}
          {COLLECTIONS.map((collection) => (
            <optgroup key={collection.name} label={collection.name}>
              {collection.colourways.map((colourway, index) => (
                <option key={index} value={`${collection.name.toLowerCase()}-${index + 1}`}>
                  {collection.name} {index + 1} · {colourway.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {props.isCheckpoint && (
          <button type="button" style={pillStyle} onClick={props.onRemoveCheckpoint}>
            Remove checkpoint
          </button>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ ...labelStyle, opacity: props.bucket ? 1 : 0.45, color: props.bucket ? COPPER : undefined }} title="Resize the window to edit another breakpoint">
          {breakpointName}
          {props.bucket && !props.hasOverride ? " · inherits desktop" : ""}
        </span>
        {props.bucket && props.hasOverride && (
          <button type="button" style={pillStyle} onClick={props.onResetBreakpoint}>
            Use desktop here
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {props.spots.length > 1 && (
          <select value={props.active ?? ""} onChange={(event) => props.onActive(event.target.value)} style={{ ...pillStyle, background: INK }}>
            {props.spots.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}

        {(["place", "path", "size", "rotate", "pin"] as Mode[]).map((m) => (
          <button key={m} type="button" style={props.mode === m ? onStyle : pillStyle} onClick={() => props.onMode(m)}>
            {m === "place" ? "Place" : m === "path" ? "Path" : m === "size" ? "Size" : m === "rotate" ? "Rotate" : "Pin"}
          </button>
        ))}

        <span style={{ width: 1, height: 20, background: LINE }} />

        <button type="button" style={pillStyle} onClick={props.onRoute} title="Draw a route through the empty space between your content">
          Route around content
        </button>
        <button
          type="button"
          style={props.frame === "viewport" ? onStyle : pillStyle}
          onClick={() => props.onFrame(props.frame === "viewport" ? "section" : "viewport")}
          title="What the position is measured against"
        >
          {props.frame}
        </button>
        {props.hasPath && (
          <button type="button" style={pillStyle} onClick={props.onClearPath}>
            Clear path
          </button>
        )}

        <span style={{ flex: 1 }} />

        <button type="button" style={pillStyle} onClick={props.onRevert} disabled={!props.dirty}>
          Revert
        </button>
        <button type="button" style={props.dirty ? { ...onStyle, background: COPPER, border: `1px solid ${COPPER}`, color: INK } : pillStyle} onClick={props.onSave}>
          Save
        </button>
        <button type="button" style={pillStyle} onClick={props.onClose}>
          Close
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {props.mode === "rotate" ? (
          <>
            <Range label={props.selected != null ? `Turn · point ${props.selected + 1}` : "Turn"} min={-180} max={180} step={1} value={Math.round(props.rotation.turn * 360)} onChange={(value) => props.onRotation({ turn: value / 360 })} format={(value) => `${value}°`} />
            <Range label="Tilt" min={-90} max={90} step={1} value={Math.round(props.rotation.tilt * 360)} onChange={(value) => props.onRotation({ tilt: value / 360 })} format={(value) => `${value}°`} />
            <Range label="Spin" min={-180} max={180} step={1} value={Math.round(props.rotation.spin * 360)} onChange={(value) => props.onRotation({ spin: value / 360 })} format={(value) => `${value}°`} />
          </>
        ) : (
          <Range label={props.selected != null ? `Size · point ${props.selected + 1}` : "Size"} min={0.04} max={1.4} step={0.01} value={props.size} onChange={props.onSize} format={(value) => value.toFixed(2)} />
        )}
        {props.hasPath && <Range label="Lag" min={0.02} max={1} step={0.01} value={props.ease} onChange={props.onEase} format={(value) => value.toFixed(2)} />}
        {props.hasPath && (
          <Range label="Scrub" min={0} max={1} step={0.005} value={props.scrubAt ?? 0} onChange={props.onScrub} onRelease={() => props.onScrub(null)} format={(value) => `${Math.round(value * 100)}%`} />
        )}
        {props.hasPath && props.moment != null && (
          <>
            <Range
              label={props.anchor ? `Moment · ⌖ ${props.anchor.slice(0, 18)}` : props.momentAuto ? "Moment · auto" : "Moment"}
              min={0}
              max={1}
              step={0.005}
              value={props.moment}
              onChange={props.onMoment}
              format={(value) => `${Math.round(value * 100)}%`}
            />
            {(!props.momentAuto || props.anchor) && (
              <button type="button" style={pillStyle} onClick={props.onMomentAuto} title="Space this point by distance again">
                auto
              </button>
            )}
          </>
        )}
        {props.hasCheckpoints && <Range label="Morph" min={0.01} max={0.2} step={0.005} value={props.morph} onChange={props.onMorph} format={(value) => `±${Math.round(value * 100)}%`} />}
      </div>

      <div style={{ fontSize: 11, opacity: 0.55, lineHeight: 1.5 }}>
        {props.status ??
          (props.mode === "pin"
            ? "Click an element on the page. The selected point will be reached when that element is at the same height on screen. Esc cancels."
            : props.mode === "place"
              ? "Drag to move it. Select a point on the route and choose a different element or look to make it a checkpoint. ⌘⇧E toggles, Esc closes."
              : props.mode === "path"
                ? `Drag to draw the route it takes as the page scrolls, or use Route around content. Drag a handle to adjust, alt-click to delete.${props.pointCount ? ` ${props.pointCount} points.` : ""}`
                : props.mode === "rotate"
                  ? "Pick a point on the route, then drag anywhere: left and right turn the object, up and down tip it. Scroll between points to watch it rotate in 3D."
                  : "Pick a handle on the route, then set the size it should be there.")}
      </div>
    </div>
  )
}

function Range({
  label,
  min,
  max,
  step,
  value,
  onChange,
  onRelease,
  format,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  onRelease?: () => void
  format: (value: number) => string
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, opacity: 0.9 }}>
      <span style={{ opacity: 0.6, whiteSpace: "nowrap" }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={onRelease}
        style={{ width: 110, accentColor: COPPER }}
      />
      <span style={{ minWidth: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{format(value)}</span>
    </label>
  )
}
