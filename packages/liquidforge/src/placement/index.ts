/**
 * The placement format and the maths that reads it.
 *
 * Exported on its own so a build step, a test, or a codemod can work with
 * placements without touching React or three.
 */
export {
  BREAKPOINTS,
  DEFAULT_PLACEMENT,
  PLACEMENTS_ENDPOINT,
  breakpointFor,
  resolveBreakpoint,
  type BreakpointName,
  type Placement,
  type PlacementAnchor,
  type PlacementOverride,
  type PlacementFile,
  type PlacementPath,
  type PlacementPoint,
} from "./types"
export {
  samplePath,
  pointAt,
  pathToSvg,
  checkpointAt,
  type CheckpointState,
  type ResolvedPoint,
  type SampledPath,
} from "./path"
export {
  getOverride,
  setOverride,
  getScrub,
  setScrub,
  listSpots,
  subscribePlacements,
  placementListenerCount,
} from "./live-store"
export { warnIfPaintedBehindBackground } from "./layer-check"

export { routeThroughWhitespace, collectContent, type Box, type RouteInput, type RouteResult } from "./route"
export { resolveAnchors, selectorFor, type ResolvedAnchors } from "./anchors"
