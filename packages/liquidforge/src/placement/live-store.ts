import type { Placement } from "./types"

/**
 * The channel between an open editor and the objects it is editing.
 *
 * When the editor drags something, the change has to reach the live object
 * immediately — round-tripping through a file and a rebuild would make dragging
 * useless. So the editor writes here, and every `LiquidSpot` subscribes.
 *
 * ## Why this hangs off `globalThis`
 *
 * The obvious implementation is a module-level `Map` and `Set`, and it is
 * wrong here for a reason that is invisible until you test it: the runtime is
 * imported from `liquidforge` and the editor from `liquidforge/editor`, and a
 * dev bundler is under no obligation to give two entry points the same instance
 * of a shared module. Turbopack does not. The result is an editor writing into
 * one Map while the component reads an empty one — no error, no warning, the
 * handles move and the object does not.
 *
 * Anchoring the state on a single well-known global makes the number of
 * instances one, whatever the bundler decides. The presence hub in the Studio
 * does the same thing for the same reason.
 *
 * With no editor mounted, nothing ever calls `setOverride`, every `getOverride`
 * returns `undefined` from an empty Map, and this is one Map and one Set
 * sitting idle.
 */

interface LiveStore {
  overrides: Map<string, Placement>
  scrubs: Map<string, number>
  listeners: Set<() => void>
}

const KEY = "__liquidforgePlacements"

function store(): LiveStore {
  const host = globalThis as unknown as Record<string, LiveStore | undefined>
  const existing = host[KEY]
  if (existing) return existing
  const created: LiveStore = { overrides: new Map(), scrubs: new Map(), listeners: new Set() }
  host[KEY] = created
  return created
}

function announce() {
  for (const listener of store().listeners) listener()
}

export function subscribePlacements(listener: () => void): () => void {
  const { listeners } = store()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * `undefined` means "no editor is touching this one", which is deliberately
 * distinct from a placement that happens to be empty.
 */
export function getOverride(id: string): Placement | undefined {
  return store().overrides.get(id)
}

export function setOverride(id: string, placement: Placement | undefined): void {
  const { overrides } = store()
  if (placement === undefined) overrides.delete(id)
  else overrides.set(id, placement)
  announce()
}

/**
 * A scroll progress to pretend is true, so the editor can scrub a path without
 * actually scrolling the page under itself. `undefined` hands control back.
 */
export function getScrub(id: string): number | undefined {
  return store().scrubs.get(id)
}

export function setScrub(id: string, progress: number | undefined): void {
  const { scrubs } = store()
  if (progress === undefined) scrubs.delete(id)
  else scrubs.set(id, progress)
  announce()
}

/** Every id currently on the page, for the editor's spot picker. */
export function listSpots(): string[] {
  if (typeof document === "undefined") return []
  return [...document.querySelectorAll("[data-liquidforge-spot]")]
    .map((node) => node.getAttribute("data-liquidforge-spot") ?? "")
    .filter(Boolean)
}

/**
 * How many objects are listening.
 *
 * Exported because zero, with an editor open, is the signature of exactly the
 * bug described above — and it is far easier to check that number than to
 * deduce it from a component that quietly fails to move.
 */
export function placementListenerCount(): number {
  return store().listeners.size
}
