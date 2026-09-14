import type { LiquidPreset, MaterialFamily, ShadingOptions, SurfaceOptions } from "../types"

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
  background: LiquidPreset["background"]
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

// -- Obsidian ----------------------------------------------------------------

const OBSIDIAN: Collection = {
  name: "Obsidian",
  family: "obsidian",
  blurb: "Lacquer. A deep coloured body under a hard clear coat.",
  // Studio grey: these bodies are near-black, and on `dark` there was nothing
  // to tell the object from the page.
  background: "mid",
  surface: {
    noise: 0.025,
    dimple: 0.1,
    rippleAmp: 0.06,
    rippleSpeed: 0.85,
    rippleTightness: 50,
    trailSpacing: 0.07,
    advection: 0.4,
  },
  // A dielectric, not a metal — the colour comes from the body underneath the
  // coat rather than from a tinted reflection.
  shading: { metalness: 0.15, roughness: 0.06, fresnel: 0.7, specPower: 60 },
  colourways: [
    { name: "Piano", palette: ["#1b1e26", "#0b0d12", "#343a49", "#060709"] },
    { name: "Oxblood", palette: ["#6e1020", "#3a0812", "#9c2338", "#23050c"] },
    { name: "Racing", palette: ["#0d4f2b", "#062e18", "#177a44", "#04180d"] },
    { name: "Cobalt", palette: ["#12357e", "#08204f", "#2456b8", "#041129"] },
    { name: "Aubergine", palette: ["#40156b", "#260c40", "#62249e", "#14061f"] },
    { name: "Ember", palette: ["#8a2a08", "#4d1704", "#c14410", "#260a02"] },
    {
      name: "Ivory",
      palette: ["#e8e2d4", "#c9c2b0", "#fffaf0", "#a49c88"],
      // A pale body swallows the coat unless the coat is sharper.
      shading: { roughness: 0.03, fresnel: 0.85 },
    },
    { name: "Teal", palette: ["#0b4f52", "#063134", "#10787c", "#031a1c"] },
    { name: "Gunmetal", palette: ["#2b3038", "#171a20", "#444b57", "#0c0e12"] },
  ],
}

// -- Velvet ------------------------------------------------------------------

const VELVET: Collection = {
  name: "Velvet",
  family: "velvet",
  blurb: "Cloth. Lit along the silhouette, with no highlight anywhere.",
  // Velvet is the darkest family here, and the sheen only lights its rim.
  background: "mid",
  surface: {
    noise: 0.04,
    dimple: 0.13,
    rippleAmp: 0.075,
    rippleSpeed: 0.8,
    rippleTightness: 40,
    trailSpacing: 0.08,
    advection: 0.6,
  },
  // `specPower` is nearly unused here — the family draws no specular at all,
  // which is the point. Roughness sets how far the sheen creeps in from the rim.
  shading: { metalness: 0, roughness: 0.75, fresnel: 1, specPower: 8 },
  colourways: [
    { name: "Merlot", palette: ["#7a0d2b", "#4a0619", "#a81a42", "#2b0310"] },
    { name: "Midnight", palette: ["#14224f", "#0a1230", "#24398a", "#050917"] },
    { name: "Moss", palette: ["#2c4a1e", "#17290f", "#47752f", "#0c1607"] },
    { name: "Amethyst", palette: ["#4a1f6e", "#2c1142", "#6f30a3", "#170820"] },
    { name: "Rust", palette: ["#8a3a12", "#52210a", "#bd541d", "#2a0f05"] },
    { name: "Slate", palette: ["#2f3742", "#1a1f26", "#4b596b", "#0e1116"] },
    { name: "Rose", palette: ["#8c2b4a", "#55182c", "#bd3f68", "#2d0b17"] },
    { name: "Emerald", palette: ["#0d5a3c", "#063523", "#158957", "#031b12"] },
    {
      name: "Saffron",
      palette: ["#a86a0d", "#6b4207", "#d68c1a", "#382204"],
      shading: { roughness: 0.55 },
    },
  ],
}

// -- Halo --------------------------------------------------------------------

const HALO: Collection = {
  name: "Halo",
  family: "halo",
  blurb: "Holographic foil. The spectrum folded over on itself, several times.",
  background: "dark",
  surface: {
    noise: 0.03,
    dimple: 0.11,
    rippleAmp: 0.07,
    rippleSpeed: 0.9,
    rippleTightness: 46,
    trailSpacing: 0.07,
    advection: 0.75,
  },
  // `thinFilm` is band count here rather than a hue offset: a thinner film
  // folds the spectrum more times across the same surface.
  shading: { metalness: 0.85, roughness: 0.12, fresnel: 0.45, specPower: 48, thinFilm: 0.35 },
  colourways: [
    { name: "Spectrum", palette: ["#ff2d55", "#ffd60a", "#30d158", "#0a84ff", "#bf5af2"] },
    { name: "Chrome Foil", palette: ["#ffffff", "#b8c6ff", "#ffc2e8", "#c9ffe4", "#fff3c2"] },
    { name: "Bubblegum", palette: ["#ff8fd0", "#a78bfa", "#7dd3fc", "#fde68a"] },
    { name: "Petrol Foil", palette: ["#00e5ff", "#7a5cff", "#ff3ea5", "#14d39a"] },
    { name: "Sunburst", palette: ["#ffd166", "#ff7a18", "#ff2d55", "#ffe8a3"] },
    { name: "Mint Foil", palette: ["#a7f3d0", "#6ee7f9", "#c4b5fd", "#fef3c7"] },
    {
      name: "Toxic",
      palette: ["#b8f000", "#00d9a3", "#f7ff5c", "#00a3ff"],
      shading: { thinFilm: 0.55 },
    },
    { name: "Candy", palette: ["#ff5fa2", "#ffa6d2", "#7cd4ff", "#fff0a6"] },
    { name: "Void Foil", palette: ["#3a86ff", "#8338ec", "#ff006e", "#ffbe0b"] },
  ],
}

// -- Jade --------------------------------------------------------------------

const JADE: Collection = {
  name: "Jade",
  family: "jade",
  blurb: "Translucent stone. Light coming through it rather than off it.",
  // The second family built for a light page, and the only translucent one.
  background: "light",
  surface: {
    noise: 0.03,
    dimple: 0.1,
    rippleAmp: 0.055,
    rippleSpeed: 0.9,
    rippleTightness: 52,
    trailSpacing: 0.07,
    advection: 0.45,
  },
  shading: { metalness: 0.1, roughness: 0.5, fresnel: 0.4, specPower: 22, transmission: 0.6 },
  colourways: [
    { name: "Imperial", palette: ["#3fa87a", "#1e6b4a", "#7fd4ab", "#0f3b28"] },
    { name: "Rose Quartz", palette: ["#f0a6b8", "#d1738c", "#ffd0dc", "#8a3f54"] },
    { name: "Amber Stone", palette: ["#e0a95c", "#b3762c", "#f5d49a", "#7a4a12"] },
    { name: "Lavender", palette: ["#b9a6e8", "#8a72c9", "#ded2ff", "#574090"] },
    { name: "Milk", palette: ["#f2ede2", "#d8cfbc", "#fffdf7", "#a89b82"] },
    { name: "Sea", palette: ["#6fc7d4", "#35909f", "#b3e9f0", "#1a5b66"] },
    {
      name: "Bloodstone",
      palette: ["#c2506a", "#8a2a42", "#e88ba0", "#571526"],
      shading: { transmission: 0.85 },
    },
    { name: "Olive", palette: ["#a3b56a", "#6f8040", "#d0dba3", "#465428"] },
    { name: "Ink Stone", palette: ["#6b7f99", "#3f5065", "#a3b5c9", "#22303f"] },
  ],
}

// -- Plasma ------------------------------------------------------------------

const PLASMA: Collection = {
  name: "Plasma",
  family: "plasma",
  blurb: "Filaments in a dark body. The cursor drags the light rather than heating it.",
  // The body is near-black by design, so on `dark` you saw the filaments and no
  // object — the studio grey gives the thing they are burning through a shape.
  background: "mid",
  surface: {
    noise: 0.045,
    dimple: 0.14,
    rippleAmp: 0.085,
    rippleSpeed: 0.75,
    rippleTightness: 40,
    trailSpacing: 0.08,
    // High on purpose: the filaments are drawn from the advected field, so this
    // is the dial that makes them move rather than a subtlety on top.
    advection: 0.9,
  },
  shading: { metalness: 0.2, roughness: 0.6, fresnel: 0.3, specPower: 20, emissive: 2.2 },
  // Read as a gradient, dimmest first.
  colourways: [
    { name: "Arc", palette: ["#05060a", "#10204f", "#2b6fd6", "#7fc4ff", "#eaf6ff"] },
    { name: "Neon", palette: ["#060407", "#2a0740", "#7d16b5", "#d94bf5", "#ffd6ff"] },
    { name: "Ion", palette: ["#04080a", "#063340", "#0e8ba3", "#35e0f5", "#d4fbff"] },
    { name: "Filament", palette: ["#0a0603", "#3d2005", "#a35d0a", "#f0a626", "#fff0c9"] },
    { name: "Toxic", palette: ["#050803", "#123008", "#3f8a0e", "#8ce024", "#e8ffc4"] },
    { name: "Rose Arc", palette: ["#080406", "#3d0a24", "#a3145c", "#f04a9c", "#ffd0e8"] },
    { name: "Aurora Arc", palette: ["#03080a", "#05403a", "#0da88c", "#4ff0cc", "#d6fff5"] },
    { name: "Solar", palette: ["#0a0503", "#4a1505", "#b03a0a", "#f57a1a", "#ffe0a3"] },
    {
      name: "Spectre",
      palette: ["#060608", "#232640", "#4d5599", "#96a3f0", "#e0e6ff"],
      shading: { emissive: 3 },
    },
  ],
}

// -- Original ----------------------------------------------------------------

/**
 * The object as it came, made liquid.
 *
 * Every other family is a material that replaces the object's surface. This
 * one keeps it — a model's own textures and colours, an image's own pixels, an
 * SVG's own fills — and adds only the motion and the light. So a colourway
 * here is not a colour at all: it is a *finish* and a *light*. The palette's
 * first entry is the base colour for sources that have no surface of their own
 * (a word, a primitive), and the rest tint the studio the finish reflects.
 */
const ORIGINAL: Collection = {
  name: "Original",
  family: "original",
  blurb: "Your object's own textures and colours, untouched — only the liquid is added.",
  background: "mid",
  surface: {
    noise: 0.028,
    dimple: 0.1,
    rippleAmp: 0.06,
    rippleSpeed: 0.85,
    rippleTightness: 46,
    trailSpacing: 0.07,
    advection: 0.4,
  },
  // metalness is how strongly the clear coat reflects the studio; roughness is
  // how sharp that reflection is. Low by default: the object's own surface is
  // the point, and a coat that mirrors too much hides it.
  shading: { metalness: 0.35, roughness: 0.22, fresnel: 0.45, specPower: 36 },
  colourways: [
    { name: "Natural", palette: ["#e9e4da", "#f4f1ea", "#9aa0aa", "#2a2c31"] },
    {
      name: "Wet",
      palette: ["#dfe3e8", "#ffffff", "#a8b3c2", "#1a1d22"],
      shading: { metalness: 0.7, roughness: 0.05, fresnel: 0.7, specPower: 70 },
    },
    {
      name: "Satin",
      palette: ["#ece6dc", "#f6f2ea", "#b7ae9f", "#35322c"],
      shading: { metalness: 0.15, roughness: 0.55, fresnel: 0.3, specPower: 14 },
    },
    {
      name: "Glazed",
      palette: ["#f2efe8", "#ffffff", "#c9c1b3", "#2b2925"],
      shading: { metalness: 0.55, roughness: 0.1, fresnel: 0.55, specPower: 90 },
    },
    { name: "Studio", palette: ["#f5f5f5", "#ffffff", "#d9dde3", "#40444b"] },
    {
      name: "Noir",
      palette: ["#bdbdbd", "#6e7076", "#2b2d31", "#050506"],
      shading: { metalness: 0.45, roughness: 0.18, fresnel: 0.8, specPower: 60 },
    },
    { name: "Golden hour", palette: ["#f1dcc0", "#ffcf94", "#e0925a", "#3a2412"] },
    { name: "Moonlit", palette: ["#d6def0", "#a9c2ff", "#5a74b8", "#0d1426"] },
    {
      name: "Chrome-dipped",
      palette: ["#e8ebf0", "#ffffff", "#8a90a0", "#15171c"],
      shading: { metalness: 0.95, roughness: 0.06, fresnel: 0.6, specPower: 80 },
    },
  ],
}

// -- Ferrofluid --------------------------------------------------------------

/**
 * Black magnetic liquid.
 *
 * The one family whose effect is a shape rather than a colour: spikes stand up
 * where the cursor is, as if a magnet were held under the surface, and slump
 * back when it moves on. The body is always near-black — the colourway is the
 * light caught in it, which is how ferrofluid actually looks: a black mirror
 * with coloured highlights on every spike.
 */
const FERROFLUID: Collection = {
  name: "Ferrofluid",
  family: "ferrofluid",
  blurb: "Black magnetic liquid. Spikes rise toward the cursor like a magnet underneath.",
  // A black object on a black page is invisible; studio grey gives the spikes an edge.
  background: "mid",
  surface: {
    noise: 0.018,
    dimple: 0.03,
    rippleAmp: 0.02,
    rippleSpeed: 0.6,
    rippleTightness: 60,
    trailSpacing: 0.09,
    advection: 0.2,
    spikes: 0.13,
  },
  shading: { metalness: 0.2, roughness: 0.04, fresnel: 0.9, specPower: 110 },
  colourways: [
    { name: "Classic", palette: ["#050506", "#8a8f99", "#d7dbe3", "#3a3d45"] },
    { name: "Oil slick", palette: ["#040405", "#4b3a8e", "#1f9fc8", "#d7b35a"] },
    { name: "Magnet", palette: ["#070404", "#7a1c1c", "#ff5a4f", "#ffd6cf"] },
    { name: "Gunmetal", palette: ["#0b0c0f", "#4b5563", "#9aa5b1", "#1f242c"], surface: { spikes: 0.1 } },
    { name: "Gold leaf", palette: ["#070604", "#6b4f16", "#f0c14e", "#fff3cc"] },
    { name: "Toxic", palette: ["#040604", "#1e5a2a", "#6bff8a", "#dcffe4"], surface: { spikes: 0.17 } },
    { name: "Midnight", palette: ["#030409", "#16244f", "#4a78ff", "#cdd9ff"] },
    { name: "Rose", palette: ["#080506", "#5a2342", "#ec86b9", "#ffe3f0"] },
    {
      name: "Hedgehog",
      palette: ["#060607", "#c9ced6", "#ffffff", "#6b7280"],
      surface: { spikes: 0.24 },
      shading: { specPower: 140 },
    },
  ],
}

export const COLLECTIONS: Collection[] = [
  MERCURY,
  AURORA,
  PRISM,
  MAGMA,
  PEARL,
  OBSIDIAN,
  VELVET,
  HALO,
  JADE,
  PLASMA,
  ORIGINAL,
  FERROFLUID,
]
