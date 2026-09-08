import type { LiquidPreset } from "./types"

/**
 * The four grounds a colourway can ask for.
 *
 * Kept here, free of any three.js import, because `codegen` needs to write the
 * resolved colour into an exported component and the MCP server imports
 * `codegen` — pulling the material module in for one lookup table would drag
 * three into a stdio subprocess that has no use for it.
 */
export const BACKGROUND_TONES = {
  dark: "#050506",
  /**
   * Studio grey. For the families that are themselves dark — a black lacquer, a
   * deep velvet, a body lit only by its own filaments — where a near-black page
   * leaves nothing to separate the object from it.
   */
  mid: "#272b35",
  light: "#f2f0ec",
  transparent: null,
} as const satisfies Record<LiquidPreset["background"], string | null>

/** Page background a preset expects to sit on. `null` means "leave it alone". */
export function backgroundColor(preset: LiquidPreset): string | null {
  return BACKGROUND_TONES[preset.background] ?? BACKGROUND_TONES.dark
}
