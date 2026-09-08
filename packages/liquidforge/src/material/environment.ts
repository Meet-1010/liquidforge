import { Color } from "three"
import type { LiquidPreset } from "../types"

export interface StudioColors {
  top: Color
  horizon: Color
  bottom: Color
}

const WHITE = new Color(1, 1, 1)
const BLACK = new Color(0, 0, 0)

/**
 * Derive the studio from the colourway.
 *
 * A preset carries a palette and nothing else about lighting, so the
 * environment Mercury and Prism reflect has to come out of that palette. The
 * shape is always the same — lit sky, dark floor, bright horizon — and only the
 * tint and the contrast change with the background.
 *
 * Keeping the derivation here rather than in the preset data means a colourway
 * stays six numbers and a list of hex codes, which is what makes the Studio's
 * sliders and the MCP server's recommendations tractable.
 */
export function studioColors(preset: LiquidPreset): StudioColors {
  const palette = preset.palette.map((hex) => new Color(hex))
  const first = palette[0] ?? WHITE
  const last = palette[palette.length - 1] ?? first

  if (preset.background === "light") {
    return {
      top: WHITE.clone().lerp(first, 0.25),
      horizon: WHITE.clone(),
      bottom: BLACK.clone().lerp(last, 0.35).addScalar(0.10),
    }
  }

  // These are linear values, not swatches: a mid-grey here displays far
  // brighter than it reads written down, which is most of the reason an early
  // pass at this looked like grey plastic rather than chrome.
  return {
    top: BLACK.clone().lerp(first, 0.30).addScalar(0.02),
    horizon: WHITE.clone().lerp(palette[1] ?? first, 0.16),
    bottom: BLACK.clone().lerp(last, 0.05).addScalar(0.004),
  }
}

/** Page background a preset expects to sit on. `null` means "leave it alone". */
export function backgroundColor(preset: LiquidPreset): string | null {
  if (preset.background === "transparent") return null
  if (preset.background === "light") return "#f2f0ec"
  return "#050506"
}
