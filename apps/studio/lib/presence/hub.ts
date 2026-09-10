/**
 * Who is here, and where their cursor is.
 *
 * Server-sent events with an in-memory hub, rather than a websocket. The whole
 * feature is one-directional broadcast of a few floats — the client sends its
 * position by POST and listens for everyone else's on a stream — and SSE gets
 * that with no new dependency, no separate server process and no upgrade
 * handshake to get past a proxy.
 *
 * The state is deliberately in memory and deliberately lossy. A cursor is worth
 * nothing a second after it was sent, so there is nothing here worth persisting
 * and nothing worth recovering after a restart. On more than one instance
 * people would only see the cursors sharing their instance, which is a real
 * limit and the right trade until there is an audience big enough to care —
 * swapping this for a Redis channel is a change to one file.
 */

export interface Cursor {
  id: string
  /** Normalised to the surface, so it lands in the same place on any screen. */
  x: number
  y: number
  name: string
  colour: string
  /** Server clock, so one client's wrong system time cannot evict everyone. */
  seen: number
}

type Listener = (event: { type: "cursors"; cursors: Cursor[] } | { type: "ping" }) => void

/** Long enough to survive a slow tab, short enough that a closed one goes. */
const STALE_MS = 8_000

class PresenceHub {
  private rooms = new Map<string, Map<string, Cursor>>()
  private listeners = new Map<string, Set<Listener>>()
  private timer: ReturnType<typeof setInterval> | null = null

  subscribe(room: string, listener: Listener): () => void {
    const set = this.listeners.get(room) ?? new Set()
    set.add(listener)
    this.listeners.set(room, set)
    this.ensureTimer()
    listener({ type: "cursors", cursors: this.cursors(room) })

    return () => {
      set.delete(listener)
      if (set.size === 0) {
        this.listeners.delete(room)
        this.rooms.delete(room)
      }
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
  }

  move(room: string, cursor: Omit<Cursor, "seen">): void {
    const map = this.rooms.get(room) ?? new Map<string, Cursor>()
    map.set(cursor.id, { ...cursor, seen: Date.now() })
    this.rooms.set(room, map)
  }

  leave(room: string, id: string): void {
    this.rooms.get(room)?.delete(id)
  }

  cursors(room: string): Cursor[] {
    const map = this.rooms.get(room)
    if (!map) return []
    const cutoff = Date.now() - STALE_MS
    const live: Cursor[] = []
    for (const [id, cursor] of map) {
      if (cursor.seen < cutoff) map.delete(id)
      else live.push(cursor)
    }
    return live
  }

  /**
   * One broadcast every 60ms for everyone, rather than one per move.
   *
   * Ten people moving at pointer-move rates is several hundred events a second;
   * fanning each one out individually would send a hundred times more than
   * anybody can see. A fixed tick is both smoother and far cheaper, and it
   * doubles as the keep-alive that stops a proxy closing an idle stream.
   */
  private ensureTimer(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      for (const [room, set] of this.listeners) {
        const cursors = this.cursors(room)
        for (const listener of set) listener({ type: "cursors", cursors })
      }
    }, 60)
  }
}

/**
 * One hub per process, kept on `globalThis`.
 *
 * Next's dev server re-evaluates modules on every edit, so a plain module-level
 * instance would be replaced while streams were still attached to the old one —
 * everyone would see an empty room until they reloaded.
 */
const globalForHub = globalThis as unknown as { __liquidforgeHub?: PresenceHub }
export const hub = globalForHub.__liquidforgeHub ?? new PresenceHub()
globalForHub.__liquidforgeHub = hub
