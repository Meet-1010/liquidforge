/**
 * Liquidforge — liquid 3D hero sections for React.
 *
 * The shader generalises the author's own liquid-sphere study (form-flux-studio)
 * from one hard-coded sphere to arbitrary geometry with a library of looks.
 */

// Components
export { LiquidHero, type LiquidHeroProps } from "./components/liquid-hero"
export { LiquidCanvas, type LiquidCanvasProps } from "./components/liquid-canvas"
export { findBlendIsolator, warnIfBlendIsolated } from "./components/blend-check"
export { LiquidLoading, type LoadingProps } from "./components/loading"

// Engine — for anyone who wants the surface without React
export { LiquidEngine, type LiquidEngineOptions, type RecordOptions } from "./engine/liquid-engine"
export { prepareGeometry, type PrepareOptions, type PreparedGeometry } from "./engine/prepare-geometry"
export { SurfaceProbe, type ProbeMode, type SurfaceHit } from "./engine/pointer"
export {
  PreviewRenderer,
  sharedPreviewRenderer,
  type CaptureRequest,
} from "./engine/preview-renderer"
export { Trail } from "./engine/trail"
export { QUALITY_PROFILES, resolveQuality } from "./engine/quality"

// Material
export {
  createLiquidMaterial,
  applyPreset,
  MAX_PALETTE,
  type LiquidMaterialHandle,
} from "./material/liquid-material"
export { studioColors, type StudioColors } from "./material/environment"
export { BACKGROUND_TONES, backgroundColor } from "./background"
export { vertexGlsl } from "./material/glsl/vertex"
export { fragmentGlsl, FAMILY_INDEX } from "./material/glsl/fragment"

// Presets — also available standalone from "liquidforge/presets"
export {
  PRESETS,
  PRESET_IDS,
  COLLECTIONS,
  DEFAULT_PRESET_ID,
  resolvePreset,
  presetName,
  presetsIn,
  collectionFor,
  type Collection,
  type Colourway,
  type PresetId,
} from "./presets"

// Asset catalogues — also available standalone from "liquidforge/catalog"
export {
  PROVIDERS,
  TOTAL_ASSETS,
  HEAVY_POLYCOUNT,
  searchAssets,
  randomAsset,
  resolveAssetUrl,
  fetchSketchfabMetadata,
  configureCatalog,
  type AssetResult,
  type RandomOptions,
  type CatalogOptions,
  type ObjaverseIndex,
  type ProviderId,
  type ProviderMeta,
  type SearchOptions,
  type SearchOutcome,
} from "./catalog"

export { mutatePreset, randomPreset, type MutateOptions } from "./codegen/mutate"

export {
  recommend,
  extractPalette,
  type RecommendInput,
  type Recommendation,
  type PaletteOptions,
} from "./recommend"

// Hooks
export { useInView } from "./hooks/use-in-view"
export { useReducedMotion } from "./hooks/use-reduced-motion"

// Object forge — also available standalone from "liquidforge/forge"
export {
  forgeGeometry,
  fitGeometry,
  forgeText,
  forgeSvg,
  forgeImage,
  forgeShape,
  forgeModel,
  exportModel,
  downloadModel,
  downloadBlob,
  SHAPE_KINDS,
  DEFAULT_OBJECT,
  DEFAULT_TEXT_FONT,
  type ExportOptions,
} from "./forge"

// Types
export type {
  ControlOptions,
  DiagnosticOptions,
  ImageObjectSource,
  LiquidPreset,
  LiquidPresetOverrides,
  MaterialFamily,
  ModelObjectSource,
  MotionOptions,
  ObjectSource,
  Quality,
  QualityProfile,
  ShadingOptions,
  ShapeKind,
  ShapeObjectSource,
  SurfaceOptions,
  SvgObjectSource,
  TextObjectSource,
} from "./types"
