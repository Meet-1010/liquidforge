/**
 * Node-side helpers for the editor. Never imported by the browser bundle.
 */
export {
  createPlacementsRoute,
  handlePlacementsSave,
  liquidforgePlacements,
  cleanPlacementFile,
  cleanProposal,
  writeProposal,
  readProposal,
  clearProposal,
  type PlacementProposal,
  type PlacementsRouteOptions,
  type RouteResult,
} from "./placements-route"
export type { Placement, PlacementFile } from "../placement/types"
