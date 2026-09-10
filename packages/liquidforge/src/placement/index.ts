/**
 * The placement format and the maths that reads it.
 *
 * Exported on its own so a build step, a test, or a codemod can work with
 * placements without touching React or three.
 */
export {
  DEFAULT_PLACEMENT,
  PLACEMENTS_ENDPOINT,
  type Placement,
  type PlacementFile,
  type PlacementPath,
  type PlacementPoint,
} from "./types"
export { samplePath, pointAt, pathToSvg, type ResolvedPoint, type SampledPath } from "./path"
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
