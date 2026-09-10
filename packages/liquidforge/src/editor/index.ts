/**
 * The editor, as its own entry point.
 *
 * Separate from `liquidforge` so that importing the runtime never pulls the
 * editor's UI into your bundle — the split is what makes "delete the editor,
 * keep the placement" a one-line change rather than a refactor.
 */
export { LiquidEditor, type LiquidEditorProps } from "./liquid-editor"
export { savePlacements, DEFAULT_ENDPOINT, type SaveResult } from "./save"
export type { Placement, PlacementFile, PlacementPath, PlacementPoint } from "../placement/types"
