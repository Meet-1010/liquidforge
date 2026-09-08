import { Vector3, Vector4 } from "three"

/**
 * The cursor's wake.
 *
 * A single decaying "stir" scalar was the first version and it was wrong in a
 * way that is obvious in motion: every ripple freezes the instant the mouse
 * stops. What the effect actually needs is a record of where the cursor has
 * *been*, with each point living out its own life afterwards (§5.5).
 *
 * Two calibrations worth keeping:
 *
 * - Emission is on **distance travelled**, not per frame. Per-frame emission
 *   maps frame rate rather than the cursor's path, so the same gesture leaves a
 *   different wake on a 60Hz and a 120Hz display.
 * - `spacing` is a preset field on purpose. At 0.07 a sweep drops around 28
 *   overlapping rings that smear into a tail *following* the cursor, which is
 *   not what everyone wants; at 0.26 it reads as a few separate stones dropped
 *   in a pond. Both are legitimate looks, so the number belongs in the preset
 *   rather than in this file.
 */
export class Trail {
  readonly points: Vector4[]
  readonly normals: Vector4[]

  private head = 0
  private seeded = false
  private readonly lastEmit = new Vector3()
  private readonly previous = new Vector3()
  private speed = 0

  constructor(readonly length: number) {
    this.points = Array.from({ length }, () => new Vector4(0, 0, 0, -1))
    this.normals = Array.from({ length }, () => new Vector4(0, 1, 0, 1))
  }

  /** Drop a ring at `point`, expanding around the axis `normal`. */
  emit(point: Vector3, normal: Vector3, amplitude: number, time: number): void {
    this.points[this.head].set(point.x, point.y, point.z, time)
    this.normals[this.head].set(normal.x, normal.y, normal.z, amplitude)
    this.head = (this.head + 1) % this.length
    this.lastEmit.copy(point)
    this.seeded = true
  }

  /**
   * Advance one frame. Returns the smoothed cursor speed, which callers use to
   * scale how hard a stroke hits.
   */
  update(point: Vector3, normal: Vector3, options: {
    time: number
    /** Whether the cursor is actually on the object. */
    over: boolean
    /** Distance the cursor must travel before the next ring, in object units. */
    spacing: number
  }): number {
    const travelled = point.distanceTo(this.previous)
    // Smoothed, so one jittery sample cannot spike a ring.
    this.speed += (travelled - this.speed) * 0.25
    this.previous.copy(point)

    if (options.over && (!this.seeded || point.distanceTo(this.lastEmit) > options.spacing)) {
      // A fast stroke throws a much stronger ring than a slow drift.
      this.emit(point, normal, Math.min(1.9, 0.22 + this.speed * 22), options.time)
    }

    return this.speed
  }

  /** Drop a single hard ring, for a click or a tap. */
  strike(point: Vector3, normal: Vector3, time: number): void {
    this.emit(point, normal, 2.8, time)
  }

  clear(): void {
    for (const p of this.points) p.w = -1
    this.seeded = false
    this.speed = 0
  }
}
