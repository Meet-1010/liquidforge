"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { COLLECTIONS } from "../presets"
import { SHAPE_KINDS } from "../forge/shapes"
import type { ObjectSource, ShapeKind } from "../types"
import { pathToSvg } from "../placement/path"
import { listSpots, placementListenerCount, setOverride, setScrub } from "../placement/live-store"
import type { Placement, PlacementFile, PlacementPoint } from "../placement/types"
import { DEFAULT_PLACEMENT } from "../placement/types"
import { savePlacements } from "./save"

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
 */

type Mode = "place" | "path" | "size"

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
}

export function LiquidEditor({ placements = {}, endpoint }: LiquidEditorProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<PlacementFile>(placements)
  const [spots, setSpots] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>("place")
  const [selected, setSelected] = useState<number | null>(null)
  const [scrubAt, setScrubAt] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const surfaceRef = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)
  const dragging = useRef<{ kind: "point"; index: number } | { kind: "whole"; x: number; y: number } | null>(null)

  const placement = (active && draft[active]) || DEFAULT_PLACEMENT

  /* ---------- discovery ---------- */

  const [detached, setDetached] = useState(false)

  useEffect(() => {
    if (!open) return
    const found = listSpots()
    setSpots(found)
    setActive((current) => current ?? found[0] ?? null)

    /*
     * Spots on the page but nothing listening means the editor and the runtime
     * ended up with different copies of the live store — which used to happen
     * when a dev bundler gave `liquidforge` and `liquidforge/editor` separate
     * module instances. Everything looks fine when that happens: handles drag,
     * the file saves, and the object simply never moves until you reload. Worth
     * saying out loud rather than leaving someone to work it out.
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

  const update = useCallback(
    (next: Placement) => {
      if (!active) return
      setDraft((current) => ({ ...current, [active]: next }))
      setDirty(true)
    },
    [active],
  )

  const points = placement.path?.points ?? []

  /* ---------- pointer handling ---------- */

  const onPointerDown = (event: React.PointerEvent) => {
    if (!active) return
    const { x, y } = toFraction(event.clientX, event.clientY)
    ;(event.target as Element).setPointerCapture?.(event.pointerId)

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
        path: { points: [{ x, y, size }], ease: placement.path?.ease ?? 0.12, smooth: placement.path?.smooth !== false },
      })
      setSelected(0)
    }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    if (!active) return
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

    if (drag.kind === "point" && placement.path) {
      const next = placement.path.points.map((point, i) => (i === drag.index ? { ...point, x, y } : point))
      const patch: Placement = { ...placement, path: { ...placement.path, points: next } }
      if (drag.index === 0) patch.origin = { ...placement.origin, x, y }
      update(patch)
      return
    }

    if (drag.kind === "whole") {
      if (placement.path && placement.path.points.length > 0) {
        const anchor = placement.path.points[0]
        const dx = x - drag.x - anchor.x
        const dy = y - drag.y - anchor.y
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
  }

  /* ---------- size ---------- */

  const sizeOfSelected = (): number => {
    if (selected != null && points[selected]?.size != null) return points[selected].size!
    // A point that never set a size inherits the last one that did.
    for (let i = (selected ?? points.length) - 1; i >= 0; i -= 1) {
      if (points[i]?.size != null) return points[i].size!
    }
    return placement.origin.size ?? 0.34
  }

  const setSize = (value: number) => {
    if (selected != null && placement.path) {
      const next = placement.path.points.map((point, i) => (i === selected ? { ...point, size: value } : point))
      update({ ...placement, path: { ...placement.path, points: next } })
    } else {
      update({ ...placement, origin: { ...placement.origin, size: value } })
    }
  }

  /* ---------- saving ---------- */

  const save = async () => {
    setStatus("Saving…")
    const result = await savePlacements(draft, endpoint)
    if (result.ok) {
      setDirty(false)
      setStatus(`Saved to ${result.file}`)
    } else {
      setStatus(result.error)
    }
    setTimeout(() => setStatus(null), 4000)
  }

  const revert = () => {
    setDraft(placements)
    setSelected(null)
    setDirty(false)
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
      if (event.key === "Escape") setOpen(false)
      if (event.key === "1") setMode("place")
      if (event.key === "2") setMode("path")
      if (event.key === "3") setMode("size")
      if ((event.key === "s" || event.key === "S") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft])

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

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483000, font: `12px ${MONO}` }}>
      {/* The drawing surface. Transparent, so you are placing against the real
          page rather than against a mock of it. */}
      <div
        ref={surfaceRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        style={{
          position: "absolute",
          inset: 0,
          cursor: mode === "path" ? "crosshair" : "grab",
          touchAction: "none",
        }}
      />

      {/* The route and its handles. */}
      <svg
        style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: "none" }}
        width={box.width}
        height={box.height}
      >
        {svg && (
          <>
            <path d={svg} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={4} strokeLinecap="round" />
            <path d={svg} fill="none" stroke={COPPER} strokeWidth={2} strokeLinecap="round" strokeDasharray="1 7" />
          </>
        )}
        {points.map((point, i) => (
          <g key={i}>
            <circle
              cx={point.x * box.width}
              cy={point.y * box.height}
              r={i === selected ? 7 : 5}
              fill={i === 0 ? COPPER : BONE}
              stroke="rgba(0,0,0,0.55)"
              strokeWidth={2}
            />
            {/*
              The size ring is only drawn where it is being used: on the
              selected handle, or on every handle while you are in Size mode.
              Drawn on all of them all the time it is four overlapping circles
              the width of the screen, and you cannot see the page underneath —
              which is the one thing this editor exists to let you see.
            */}
            {point.size != null && (mode === "size" || i === selected) && (
              <circle
                cx={point.x * box.width}
                cy={point.y * box.height}
                r={(point.size * box.width) / 2}
                fill="none"
                stroke={COPPER}
                strokeWidth={1}
                strokeDasharray="3 5"
                opacity={i === selected ? 0.5 : 0.25}
              />
            )}
          </g>
        ))}
      </svg>

      <Toolbar
        shape={placement.object?.type === "shape" ? placement.object.shape : "torusknot"}
        onShape={(shape) =>
          update({ ...placement, object: { type: "shape", shape, detail: 180 } as ObjectSource })
        }
        preset={placement.preset ?? "mercury-3"}
        onPreset={(preset) => update({ ...placement, preset })}
        spots={spots}
        active={active}
        onActive={(id) => {
          setActive(id)
          setSelected(null)
        }}
        mode={mode}
        onMode={setMode}
        size={sizeOfSelected()}
        onSize={setSize}
        selected={selected}
        pointCount={points.length}
        ease={placement.path?.ease ?? 0.12}
        onEase={(ease) => placement.path && update({ ...placement, path: { ...placement.path, ease } })}
        frame={placement.frame ?? "viewport"}
        onFrame={(frame) => update({ ...placement, frame })}
        scrubAt={scrubAt}
        onScrub={setScrubAt}
        hasPath={points.length > 1}
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

interface ToolbarProps {
  shape: ShapeKind
  onShape: (shape: ShapeKind) => void
  preset: string
  onPreset: (preset: string) => void
  spots: string[]
  active: string | null
  onActive: (id: string) => void
  mode: Mode
  onMode: (mode: Mode) => void
  size: number
  onSize: (value: number) => void
  selected: number | null
  pointCount: number
  ease: number
  onEase: (value: number) => void
  frame: "viewport" | "section"
  onFrame: (frame: "viewport" | "section") => void
  scrubAt: number | null
  onScrub: (value: number | null) => void
  hasPath: boolean
  onClearPath: () => void
  dirty: boolean
  status: string | null
  onSave: () => void
  onRevert: () => void
  onClose: () => void
}

function Toolbar(props: ToolbarProps) {
  const pill: React.CSSProperties = {
    border: `1px solid ${LINE}`,
    background: "transparent",
    color: BONE,
    borderRadius: 999,
    padding: "5px 11px",
    font: `12px ${MONO}`,
    cursor: "pointer",
  }
  const on: React.CSSProperties = { ...pill, background: BONE, color: INK, borderColor: BONE }

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
        maxWidth: "min(94vw, 840px)",
      }}
    >
      {/*
        What it is, before where it goes. Two native selects rather than a grid
        of swatches: this bar floats over someone else's page and has to stay
        small, and a select is the one control that holds ninety options without
        taking any room until you open it.
      */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", opacity: 0.4 }}>
          Element
        </span>
        <select
          value={props.shape}
          onChange={(event) => props.onShape(event.target.value as ShapeKind)}
          style={{ ...pill, background: INK }}
          aria-label="Shape"
        >
          {SHAPE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        <select
          value={props.preset}
          onChange={(event) => props.onPreset(event.target.value)}
          style={{ ...pill, background: INK }}
          aria-label="Look"
        >
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
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {props.spots.length > 1 && (
          <select
            value={props.active ?? ""}
            onChange={(event) => props.onActive(event.target.value)}
            style={{ ...pill, background: INK }}
          >
            {props.spots.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}

        <button type="button" style={props.mode === "place" ? on : pill} onClick={() => props.onMode("place")}>
          Place
        </button>
        <button type="button" style={props.mode === "path" ? on : pill} onClick={() => props.onMode("path")}>
          Path
        </button>
        <button type="button" style={props.mode === "size" ? on : pill} onClick={() => props.onMode("size")}>
          Size
        </button>

        <span style={{ width: 1, height: 20, background: LINE }} />

        <button
          type="button"
          style={props.frame === "viewport" ? on : pill}
          onClick={() => props.onFrame(props.frame === "viewport" ? "section" : "viewport")}
          title="What the position is measured against"
        >
          {props.frame}
        </button>

        {props.hasPath && (
          <button type="button" style={pill} onClick={props.onClearPath}>
            Clear path
          </button>
        )}

        <span style={{ flex: 1 }} />

        <button type="button" style={pill} onClick={props.onRevert} disabled={!props.dirty}>
          Revert
        </button>
        <button
          type="button"
          style={props.dirty ? { ...on, background: COPPER, borderColor: COPPER, color: INK } : pill}
          onClick={props.onSave}
        >
          Save
        </button>
        <button type="button" style={pill} onClick={props.onClose}>
          Close
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Range
          label={props.selected != null ? `Size · point ${props.selected + 1}` : "Size"}
          min={0.04}
          max={1.4}
          step={0.01}
          value={props.size}
          onChange={props.onSize}
          format={(value) => value.toFixed(2)}
        />

        {props.hasPath && (
          <Range
            label="Lag"
            min={0.02}
            max={1}
            step={0.01}
            value={props.ease}
            onChange={props.onEase}
            format={(value) => value.toFixed(2)}
          />
        )}

        {props.hasPath && (
          <Range
            label="Scrub"
            min={0}
            max={1}
            step={0.005}
            value={props.scrubAt ?? 0}
            onChange={props.onScrub}
            onRelease={() => props.onScrub(null)}
            format={(value) => `${Math.round(value * 100)}%`}
          />
        )}
      </div>

      <div style={{ fontSize: 11, opacity: 0.55, lineHeight: 1.5 }}>
        {props.status ??
          (props.mode === "place"
            ? "Drag to move it. ⌘⇧E toggles the editor, Esc closes it."
            : props.mode === "path"
              ? `Drag to draw the route it takes as the page scrolls. Drag a handle to adjust, alt-click to delete.${props.pointCount ? ` ${props.pointCount} points.` : ""}`
              : "Pick a handle on the path, then set the size it should be there.")}
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
        style={{ width: 118, accentColor: COPPER }}
      />
      <span style={{ minWidth: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{format(value)}</span>
    </label>
  )
}
