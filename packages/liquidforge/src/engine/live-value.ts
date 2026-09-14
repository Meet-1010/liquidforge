import { blendPresets, steer } from "../breed"
import { resolvePreset } from "../presets"
import type { LiquidPreset } from "../types"
import { PRIMARY_FORM, type LiquidEngine } from "./liquid-engine"

/**
 * A hero that follows a number.
 *
 * Sign-ups today, stars on a repository, a price, a follower count: bound to a
 * look, the number becomes something you can see from across the room. As the
 * value rises between `min` and `max` the look moves — toward another colourway
 * when `to` is given, otherwise the same look growing louder — and passing a
 * milestone on the way up sets off a splash across the surface.
 */
export interface LiquidData {
  /** The number the look follows. */
  value: number
  /** @default 0 */
  min?: number
  /** @default 100 */
  max?: number
  /**
   * The look at `max`: a colourway id or a whole preset. Without it, the look at
   * `max` is the component's own look, turned up loud.
   */
  to?: string | LiquidPreset
  /** Values that set off a splash when the number passes them going up. */
  milestones?: number[]
  /** How long the look takes to catch up with a new value, in milliseconds. @default 900 */
  ease?: number
}

/**
 * Drives an engine's look from a `LiquidData`, easing between values.
 *
 * Shared by the React components and `<liquid-forge>`, so a number bound in
 * Webflow moves the surface exactly the way one bound in React does.
 */
export class LiveValue {
  private shown: number | null = null
  private target = 0
  private data: LiquidData | null = null
  private frame = 0
  private last = 0
  private lastValue: number | null = null
  private warmedFor = ""

  constructor(
    private readonly engine: LiquidEngine,
    private readonly base: () => LiquidPreset,
  ) {}

  set(data: LiquidData | null | undefined): void {
    if (!data || !Number.isFinite(data.value)) {
      this.data = null
      this.shown = null
      this.lastValue = null
      cancelAnimationFrame(this.frame)
      this.frame = 0
      this.engine.setPreset(this.base())
      return
    }
    const previous = this.lastValue
    this.data = data

    // The look at the far end may be another family, which is another shader:
    // compile it now, not on the frame the number first crosses halfway.
    const toKey = typeof data.to === "string" ? data.to : (data.to?.id ?? "")
    if (toKey && toKey !== this.warmedFor) {
      this.warmedFor = toKey
      void this.engine.warm([{ form: PRIMARY_FORM, preset: resolvePreset(data.to) }])
    }
    this.target = data.value
    this.lastValue = data.value

    // Milestones passed on the way up since the last value. A number that
    // arrives already past one on first load does not splash: nobody saw it
    // cross.
    if (previous !== null && data.value > previous) {
      const crossed = (data.milestones ?? []).filter((m) => previous < m && data.value >= m)
      if (crossed.length) this.engine.splash(Math.min(1.5, 0.8 + crossed.length * 0.35))
    }

    if (this.shown === null) {
      this.shown = data.value
      this.apply()
      return
    }
    if (!this.frame) {
      this.last = performance.now()
      this.frame = requestAnimationFrame(this.tick)
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  private tick = (now: number) => {
    this.frame = 0
    if (!this.data || this.shown === null) return
    const dt = Math.min(100, now - this.last)
    this.last = now
    const span = Math.max(1e-9, Math.abs((this.data.max ?? 100) - (this.data.min ?? 0)))
    const ease = Math.max(16, this.data.ease ?? 900)
    this.shown += (this.target - this.shown) * (1 - Math.exp(-dt / (ease / 4)))
    if (Math.abs(this.target - this.shown) < span * 0.0005) this.shown = this.target
    this.apply()
    if (this.shown !== this.target) this.frame = requestAnimationFrame(this.tick)
  }

  private apply(): void {
    const data = this.data
    if (!data || this.shown === null) return
    const min = data.min ?? 0
    const max = data.max ?? 100
    const t = Math.max(0, Math.min(1, max === min ? 0 : (this.shown - min) / (max - min)))
    const base = this.base()
    const look = data.to !== undefined ? blendPresets(base, resolvePreset(data.to), t) : steer(base, { energy: t })
    // Every frame of an ease while the loop is running already draws; a still
    // canvas needs the one extra frame.
    if (this.engine.isRunning) this.engine.setPresetLive(look)
    else this.engine.setPreset(look)
  }

  /** Re-apply the current value over a new base look — the component's preset changed. */
  refresh(): void {
    this.apply()
  }
}
