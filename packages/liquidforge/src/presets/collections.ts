import type { MaterialFamily, ShadingOptions, SurfaceOptions } from "../types"

/**
 * The colourways, as data.
 *
 * A preset is a palette and a dozen numbers, nothing more — no code, no shader
 * fragment, no class. That is what lets the Studio edit one with sliders, the
 * MCP server hand one to an agent as JSON, and `codegen` inline one into a
 * component the reader can still understand.
 *
 * Each family sets the numbers that make it that family; a colourway supplies
 * a palette and, occasionally, a small `tweak` where a particular colour needs
 * a different roughness or a deeper well to read properly.
 */

export interface Colourway {
  /** Shown on the gallery card under the numbered label. */
  name: string
  palette: string[]
  surface?: Partial<SurfaceOptions>
  shading?: Partial<ShadingOptions>
}

export interface Collection {
  /** Display name — also the `id` prefix, lowercased. */
  name: string
  family: MaterialFamily
  /** One line for the gallery header and the MCP server's catalogue. */
  blurb: string
  background: "dark" | "light" | "transparent"
  surface: SurfaceOptions
  shading: ShadingOptions
  colourways: Colourway[]
}

// -- Mercury -----------------------------------------------------------------

const MERCURY: Collection = {
  name: "Mercury",
  family: "mercury",
  blurb: "Liquid chrome. A hard horizon in the reflection, tinted by the palette.",
  background: "dark",
  surface: {
    noise: 0.03,
    dimple: 0.115,
    rippleAmp: 0.072,
    rippleSpeed: 0.85,
    rippleTightness: 46,
    trailSpacing: 0.07,
    advection: 0.5,
  },
  shading: { metalness: 1, roughness: 0.08, fresnel: 0.35, specPower: 42 },
  colourways: [
    { name: "Silver", palette: ["#ffffff", "#c8ccd4", "#8a90a0", "#e6e9ef"] },
    { name: "Cobalt", palette: ["#7fb2ff", "#2f6bd8", "#b9d4ff", "#16305e"] },
    { name: "Copper", palette: ["#ffb98a", "#d97742", "#ffe0c4", "#7a3d1c"] },
    {
      name: "Ink",
      palette: ["#6f7ea8", "#2a3350", "#aab6d6", "#11141f"],
      shading: { roughness: 0.05, fresnel: 0.5 },
    },
    { name: "Acid", palette: ["#d8ff5c", "#7cc422", "#f2ffb8", "#35590a"] },
    { name: "Rose", palette: ["#ffc2d8", "#ef6f9d", "#ffe3ee", "#a02d59"] },
    { name: "Gold", palette: ["#ffe08a", "#e0a53a", "#fff3cc", "#8a5a12"] },
    { name: "Teal", palette: ["#7fe3d8", "#1fa596", "#c9f5ef", "#0c5c53"] },
    {
      name: "Brushed",
      palette: ["#d9d4cc", "#8f887c", "#f0ece5", "#4a463f"],
      // Rougher metal loses the horizon line, so it needs the rim back to keep
      // its silhouette.
      shading: { roughness: 0.32, fresnel: 0.55 },
    },
  ],
}

// -- Aurora ------------------------------------------------------------------

const AURORA: Collection = {
  name: "Aurora",
  family: "aurora",
  blurb: "Iridescent oil slick. Hue reads from the azimuth around a moving light.",
  background: "dark",
  surface: {
    noise: 0.03,
    dimple: 0.115,
    rippleAmp: 0.072,
    rippleSpeed: 0.85,
    rippleTightness: 46,
    trailSpacing: 0.07,
    advection: 0.68,
  },
  shading: { metalness: 0.6, roughness: 0.25, fresnel: 0.2, specPower: 42, thinFilm: 0.12 },
  colourways: [
    // Aurora 1 is the reference implementation's own palette, unchanged.
    { name: "Spill", palette: ["#facb0e", "#f06ba8", "#78bae6", "#ff3b2f"] },
    { name: "Petrol", palette: ["#00e5ff", "#7a5cff", "#ff3ea5", "#14d39a"] },
    { name: "Sunset", palette: ["#ff9d00", "#ff2d55", "#b14aed", "#ffd166"] },
    { name: "Lagoon", palette: ["#00f5d4", "#00bbf9", "#9b5de5", "#f15bb5"] },
    { name: "Ember", palette: ["#ff7a18", "#af002d", "#ffcf00", "#6a00f4"] },
    { name: "Absinthe", palette: ["#b8f000", "#00d9a3", "#f7ff5c", "#00a3ff"] },
    { name: "Orchid", palette: ["#ff6ec7", "#a06cd5", "#6dd3ce", "#ffd6e8"] },
    { name: "Sodium", palette: ["#ffb703", "#fb8500", "#8ecae6", "#219ebc"] },
    {
      name: "Nocturne",
      palette: ["#3a86ff", "#8338ec", "#ff006e", "#ffbe0b"],
      shading: { thinFilm: 0.22 },
    },
  ],
}

// -- Prism -------------------------------------------------------------------

const PRISM: Collection = {
  name: "Prism",
  family: "prism",
  blurb: "Glass. Refraction with per-channel dispersion, mirrored at the rim.",
  background: "dark",
  surface: {
    noise: 0.02,
    dimple: 0.09,
    rippleAmp: 0.055,
    rippleSpeed: 0.8,
    rippleTightness: 52,
    trailSpacing: 0.07,
    advection: 0.35,
  },
  shading: {
    metalness: 0.1,
    roughness: 0.05,
    fresnel: 0.9,
    specPower: 60,
    transmission: 0.85,
    ior: 1.45,
  },
  colourways: [
    { name: "Clear", palette: ["#ffffff", "#eaf2ff", "#cfe0f5", "#ffffff"] },
    { name: "Aqua", palette: ["#9fe8ff", "#4fc3f7", "#d6f6ff", "#0288d1"] },
    {
      name: "Amethyst",
      palette: ["#d8b4fe", "#a855f7", "#f3e8ff", "#6b21a8"],
      shading: { ior: 1.62 },
    },
    { name: "Emerald", palette: ["#86efac", "#22c55e", "#dcfce7", "#15803d"] },
    { name: "Amber", palette: ["#fde68a", "#f59e0b", "#fef3c7", "#b45309"] },
    { name: "Quartz", palette: ["#fbcfe8", "#f472b6", "#fce7f3", "#be185d"] },
    {
      name: "Smoke",
      palette: ["#d4d4d8", "#71717a", "#f4f4f5", "#3f3f46"],
      shading: { transmission: 0.55, roughness: 0.18 },
    },
    { name: "Sapphire", palette: ["#93c5fd", "#3b82f6", "#dbeafe", "#1d4ed8"] },
    {
      name: "Diamond",
      palette: ["#ffffff", "#e0f2ff", "#ffe8f5", "#eaffe8"],
      // A high IOR spreads the three channels further apart, which is the whole
      // point of this one.
      shading: { ior: 2.1, transmission: 0.7 },
    },
  ],
}

// -- Magma -------------------------------------------------------------------

const MAGMA: Collection = {
  name: "Magma",
  family: "magma",
  blurb: "Molten. The crust glows where the cursor has pulled it apart.",
  background: "dark",
  surface: {
    noise: 0.05,
    dimple: 0.16,
    rippleAmp: 0.09,
    rippleSpeed: 0.7,
    rippleTightness: 38,
    trailSpacing: 0.09,
    advection: 0.4,
  },
  shading: { metalness: 0.25, roughness: 0.55, fresnel: 0.3, specPower: 24, emissive: 1.6 },
  // Palettes here are read as a gradient, coolest first: crust, then heat.
  colourways: [
    { name: "Basalt", palette: ["#14100f", "#3a2320", "#a33a12", "#ff6a00", "#ffd166"] },
    { name: "Obsidian", palette: ["#0b0b0f", "#241a2e", "#6a2a8c", "#d84bd0", "#ffd9f7"] },
    { name: "Forge", palette: ["#100c0a", "#40200c", "#b34700", "#ff8c1a", "#fff2c2"] },
    { name: "Ember", palette: ["#120e0e", "#3d1414", "#8f1d1d", "#e63946", "#ffb3ae"] },
    { name: "Sulphur", palette: ["#0f0f0a", "#333115", "#8f8a1a", "#e8dd28", "#fbffc7"] },
    {
      name: "Coolant",
      palette: ["#080d12", "#12314a", "#1f7fa8", "#38e1ff", "#d6f8ff"],
      shading: { emissive: 2.1 },
    },
    { name: "Bloodstone", palette: ["#0d0708", "#33090f", "#7a0f26", "#d61f4a", "#ff9db1"] },
    { name: "Verdant", palette: ["#070d09", "#113020", "#1f7a3f", "#46e07a", "#cffce0"] },
    { name: "Plasma", palette: ["#0a0812", "#251852", "#4b2fd6", "#7c5cff", "#d9d0ff"] },
  ],
}

// -- Pearl -------------------------------------------------------------------

const PEARL: Collection = {
  name: "Pearl",
  family: "pearl",
  blurb: "Soft matte iridescence, built for light pages.",
  background: "light",
  surface: {
    noise: 0.035,
    dimple: 0.1,
    rippleAmp: 0.06,
    rippleSpeed: 0.9,
    rippleTightness: 50,
    trailSpacing: 0.07,
    advection: 0.55,
  },
  shading: { metalness: 0.3, roughness: 0.6, fresnel: 0.5, specPower: 18, thinFilm: 0.08 },
  colourways: [
    { name: "Shell", palette: ["#fff5f7", "#ffe0e9", "#e7d9ff", "#d9f2ff"] },
    { name: "Opal", palette: ["#eaf6ff", "#ffe9f3", "#e9ffe9", "#fff6d9"] },
    { name: "Milk", palette: ["#ffffff", "#f3f0ea", "#e6e0d5", "#fbf7f0"] },
    { name: "Blush", palette: ["#ffe4ec", "#ffd0dd", "#f8c8dc", "#fff0f4"] },
    { name: "Mint", palette: ["#e3fbf1", "#c7f2e2", "#d9f7ff", "#f2fffb"] },
    { name: "Bone", palette: ["#f4efe6", "#e5dccc", "#d6c9b4", "#fbf8f2"] },
    {
      name: "Iris",
      palette: ["#ece7ff", "#dcd3ff", "#f0e6ff", "#f8f4ff"],
      shading: { thinFilm: 0.18 },
    },
    { name: "Sky", palette: ["#e6f3ff", "#cfe6ff", "#eaf6ff", "#f7fbff"] },
    { name: "Sand", palette: ["#fbf0dd", "#f3e0c0", "#e8d0a3", "#fff8ec"] },
  ],
}

export const COLLECTIONS: Collection[] = [MERCURY, AURORA, PRISM, MAGMA, PEARL]
