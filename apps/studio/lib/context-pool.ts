/**
 * A ceiling on live WebGL contexts, shared by every gallery on the site.
 *
 * Browsers cap concurrent contexts at roughly 16 and silently drop the oldest
 * past that, so a page of 45 live previews cannot simply mount them all. An
 * IntersectionObserver alone keeps the number near what is on screen, which on
 * a wide monitor is already close to the cap — hence a hard limit as well.
 *
 * The first version of this leaked, and leaked in the worst possible way: it
 * kept a per-effect `held` flag, so a queued waiter that fired *after* its own
 * cleanup had run took a slot that nothing would ever give back. Within a
 * couple of scrolls the pool was exhausted and the entire gallery fell back to
 * flat colour swatches — 45 cards, zero canvases, and no error anywhere.
 *
 * So the grant is the release function. A request owns exactly what it took,
 * cancelling is safe at any point, and a slot handed on to a waiter that has
 * since been cancelled moves straight to the next one.
 */
class ContextPool {
  private live = 0
  private waiting: Array<() => boolean> = []

  constructor(private readonly max: number) {}

  /**
   * Ask for a slot. `granted` fires immediately if one is free, later if one
   * frees up, or never. Always call the returned function to give it back.
   */
  request(granted: () => void): () => void {
    let held = false
    let cancelled = false

    const take = (): boolean => {
      if (cancelled || held || this.live >= this.max) return false
      this.live++
      held = true
      granted()
      return true
    }

    if (!take()) this.waiting.push(take)

    return () => {
      cancelled = true
      const queued = this.waiting.indexOf(take)
      if (queued >= 0) this.waiting.splice(queued, 1)
      if (!held) return

      held = false
      this.live--
      // Hand it on. A waiter that has been cancelled returns false, so this
      // walks past the dead ones instead of dropping the slot on one of them.
      while (this.waiting.length > 0) {
        const next = this.waiting.shift()
        if (next?.()) break
      }
    }
  }

  /** For debugging and tests. */
  get inUse(): number {
    return this.live
  }
}

/**
 * Eight, measured rather than guessed.
 *
 * Chrome does not refuse a WebGL context past its limit — it hands one over and
 * silently kills an older one. Asking for 40 on top of a page already holding
 * 10 granted all 40 and lost 24 of them, which puts the real ceiling around 16
 * for the whole browser, shared with every other tab. At ten this gallery was
 * already over it: two cards a page load came back "context lost".
 *
 * Eight leaves headroom for the rest of the browser and still covers the cards
 * actually on screen at a typical viewport. Past that the answer is not a
 * bigger number — it is one context with a scissored viewport per card.
 */
export const webglContexts = new ContextPool(8)
