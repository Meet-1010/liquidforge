import { COLLECTIONS, type Collection, type Colourway } from "./collections"
import type { LiquidPreset, LiquidPresetOverrides, MaterialFamily } from "../types"

export { COLLECTIONS, type Collection, type Colourway } from "./collections"

// Re-exported so `liquidforge/presets` is self-describing: the MCP server and
// anything else that only needs the catalogue can type against it without
// pulling in the components, and with them the whole of three.
export type {
  LiquidPreset,
  LiquidPresetOverrides,
  MaterialFamily,
  MotionOptions,
  ObjectSource,
  Quality,
  ShadingOptions,
  ShapeKind,
  SurfaceOptions,
} from "../types"

function buildPreset(collection: Collection, colourway: Colourway, index: number): LiquidPreset {
  const slug = collection.name.toLowerCase()
  return {
    id: `${slug}-${index + 1}`,
    collection: collection.name,
    family: collection.family,
    label: `${collection.name} ${index + 1}`,
    palette: colourway.palette,
    surface: { ...collection.surface, ...colourway.surface },
    shading: { ...collection.shading, ...colourway.shading },
    background: collection.background,
  }
}

/** Every colourway, keyed by id — `"mercury-3"`, `"aurora-1"`, and so on. */
export const PRESETS: Record<string, LiquidPreset> = Object.fromEntries(
  COLLECTIONS.flatMap((collection) =>
    collection.colourways.map((colourway, index) => {
      const preset = buildPreset(collection, colourway, index)
      return [preset.id, preset] as const
    }),
  ),
)

export const PRESET_IDS = Object.keys(PRESETS)

export type PresetId = string

export const DEFAULT_PRESET_ID = "mercury-1"

/** The colourway's own name — `"Copper"` for `"mercury-3"`. */
export function presetName(id: string): string | undefined {
  for (const collection of COLLECTIONS) {
    const slug = collection.name.toLowerCase()
    if (!id.startsWith(`${slug}-`)) continue
    const index = Number(id.slice(slug.length + 1)) - 1
    return collection.colourways[index]?.name
  }
  return undefined
}

export function collectionFor(family: MaterialFamily): Collection | undefined {
  return COLLECTIONS.find((collection) => collection.family === family)
}

/** Every preset in one collection, in gallery order. */
export function presetsIn(collection: string): LiquidPreset[] {
  return PRESET_IDS.map((id) => PRESETS[id]).filter(
    (preset) => preset.collection.toLowerCase() === collection.toLowerCase(),
  )
}

/**
 * Turn whatever the caller passed into a complete preset.
 *
 * Accepts an id, a whole preset object, or nothing, then layers overrides on
 * top. `surface` and `shading` merge one level deep so a component can nudge a
 * single number — `surface={{ advection: 1.2 }}` — without restating the rest
 * of the colourway.
 */
export function resolvePreset(
  preset: string | LiquidPreset | undefined,
  overrides: LiquidPresetOverrides = {},
): LiquidPreset {
  const base =
    typeof preset === "string"
      ? (PRESETS[preset] ?? PRESETS[DEFAULT_PRESET_ID])
      : (preset ?? PRESETS[DEFAULT_PRESET_ID])

  return {
    ...base,
    family: overrides.family ?? base.family,
    palette: overrides.palette ?? base.palette,
    background: overrides.background ?? base.background,
    surface: { ...base.surface, ...overrides.surface },
    shading: { ...base.shading, ...overrides.shading },
  }
}
