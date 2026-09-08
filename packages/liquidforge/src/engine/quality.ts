import type { Quality, QualityProfile } from "../types"

/**
 * What each tier actually buys.
 *
 * Fragment cost dominates and it scales with the *square* of pixel ratio, so
 * `dpr` is the dial that matters most; tessellation and trail length are the
 * two that follow. `auto` measures real frame times and walks the pixel ratio
 * between the bounds every three quarters of a second — a fixed value either
 * wastes a fast GPU or drops frames on a slow one, and which of those you have
 * is not knowable up front (§5.8).
 *
 * Geometry is *not* adaptive. Re-tessellating mid-scene means rebuilding a
 * quarter of a million vertices on the main thread, which is a visible stall
 * where a pixel-ratio change is invisible.
 */
export const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  auto: { dpr: [0.75, 2], adaptive: true, maxEdge: 0.06, vertexBudget: 160_000, trail: 12 },
  high: { dpr: [1.5, 2], adaptive: false, maxEdge: 0.04, vertexBudget: 400_000, trail: 16 },
  balanced: { dpr: [1, 1.5], adaptive: false, maxEdge: 0.06, vertexBudget: 160_000, trail: 12 },
  low: { dpr: [0.75, 1], adaptive: false, maxEdge: 0.1, vertexBudget: 60_000, trail: 8 },
}

export function resolveQuality(quality: Quality = "auto"): QualityProfile {
  return QUALITY_PROFILES[quality] ?? QUALITY_PROFILES.auto
}
