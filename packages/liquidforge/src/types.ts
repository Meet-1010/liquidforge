/**
 * Liquidforge's public vocabulary.
 *
 * Two halves: what to render (`ObjectSource`) and how it should look
 * (`LiquidPreset`). Everything else in the library is a function of those two.
 */

// -- Objects -----------------------------------------------------------------

export type ShapeKind =
  | "sphere"
  | "torus"
  | "torusknot"
  | "capsule"
  | "icosahedron"
  | "rounded-box"

/** Extrude live browser text. Any font the page can render works, emoji included. */
export interface TextObjectSource {
  type: "text"
  value: string
  /** Any CSS font shorthand, e.g. `"700 200px Georgia"`. @default "800 200px system-ui, sans-serif" */
  font?: string
  /** Extrusion depth in world units. @default 0.45 */
  depth?: number
  /** Bevel size. 0 disables bevelling. @default 0.03 */
  bevel?: number
  /** Contour sampling resolution. Higher = smoother edges, heavier mesh. @default 512 */
  resolution?: number
  /** Contour simplification tolerance in mask cells. Higher = chunkier. @default 1.2 */
  smoothing?: number
}

/** Extrude SVG paths. Give either a URL or raw markup. */
export interface SvgObjectSource {
  type: "svg"
  src?: string
  markup?: string
  /** @default 0.45 */
  depth?: number
  /** @default 0.03 */
  bevel?: number
}

/** Contour-trace a raster image to a silhouette, then extrude it. */
export interface ImageObjectSource {
  type: "image"
  src: string
  /** @default 0.45 */
  depth?: number
  /** Trace resolution. @default 512 */
  resolution?: number
  /** Alpha/luminance cutoff for the silhouette. @default 0.5 */
  threshold?: number
}

/** Parametric primitive — no assets at all. */
export interface ShapeObjectSource {
  type: "shape"
  shape: ShapeKind
  /** Surface detail. Raised automatically to suit `quality`. @default 128 */
  detail?: number
}

/** Load an existing `.glb` / `.gltf`. */
export interface ModelObjectSource {
  type: "model"
  src: string
}

export type ObjectSource =
  | TextObjectSource
  | SvgObjectSource
  | ImageObjectSource
  | ShapeObjectSource
  | ModelObjectSource

// -- Material ----------------------------------------------------------------

export type MaterialFamily = "mercury" | "aurora" | "prism" | "magma" | "pearl"

/** How the surface moves. Every field is in object-space units on a 2-unit object. */
export interface SurfaceOptions {
  /** Idle organic drift amplitude. Keeps the object alive with no cursor. @default 0.03 */
  noise: number
  /** Depth of the well the cursor presses into the surface. @default 0.115 */
  dimple: number
  /** Height of the rings the cursor's trail throws off. @default 0.072 */
  rippleAmp: number
  /** How fast a ring's crest travels outward, in units/second. @default 0.85 */
  rippleSpeed: number
  /** Gaussian band width of a ring. Higher = tighter, more local. @default 46 */
  rippleTightness: number
  /** How far the cursor travels before laying down a new ring. @default 0.07 */
  trailSpacing: number
  /** Strength of the per-pixel vortex that winds the colour into a spiral. @default 0.68 */
  advection: number
}

/** How the surface takes light. */
export interface ShadingOptions {
  /** 0 = dielectric, 1 = mirror metal. Drives how much of the colour is reflection. @default 1 */
  metalness: number
  /** Blurs the environment reflection. @default 0.12 */
  roughness: number
  /** Strength of the bright rim at grazing angles. @default 0.35 */
  fresnel: number
  /** Specular exponent. Higher = tighter highlight. @default 42 */
  specPower: number
  /** Glass only: how much of the background shows through, 0..1. */
  transmission?: number
  /** Glass only: index of refraction. Also drives chromatic dispersion. */
  ior?: number
  /** Iridescent only: thin-film thickness. Drives the oil-slick hue sweep. */
  thinFilm?: number
  /** Molten only: how brightly the troughs glow. */
  emissive?: number
}

/**
 * A colourway. Data, not code — the Studio edits these live, the MCP server
 * hands them to agents, and `codegen` inlines them into a component.
 */
export interface LiquidPreset {
  /** Stable id, e.g. `"mercury-3"`. */
  id: string
  /** Human collection name, e.g. `"Mercury"`. */
  collection: string
  family: MaterialFamily
  /** Short label for the gallery card, e.g. `"Mercury 3"`. */
  label: string
  /** Hue ramp, cycled around the light axis. 2–8 colours. */
  palette: string[]
  surface: SurfaceOptions
  shading: ShadingOptions
  background: "dark" | "light" | "transparent"
}

/** A preset with every field optional — what props and the Studio hand back in. */
export interface LiquidPresetOverrides {
  family?: MaterialFamily
  palette?: string[]
  surface?: Partial<SurfaceOptions>
  shading?: Partial<ShadingOptions>
  background?: LiquidPreset["background"]
}

// -- Runtime -----------------------------------------------------------------

/**
 * Quality tier.
 *
 * `auto` measures real frame times and walks the pixel ratio between the
 * bounds, which is the single most effective dial there is: fragment cost
 * scales with the square of pixel ratio and the advection loop runs per pixel.
 */
export type Quality = "auto" | "high" | "balanced" | "low"

export interface QualityProfile {
  /** Pixel-ratio floor and ceiling. */
  dpr: [number, number]
  /** Whether to adapt the pixel ratio from measured frame times. */
  adaptive: boolean
  /** Longest triangle edge to aim for when tessellating for displacement. */
  maxEdge: number
  /** Vertex ceiling for the tessellation pass. */
  vertexBudget: number
  /** Ring-buffer length for the cursor trail. */
  trail: number
}

/** Viewport navigation. Separate from `motion`, which is about the object. */
export interface ControlOptions {
  /**
   * Scroll or pinch to zoom.
   *
   * Off by default on purpose: in a hero section, capturing the wheel means the
   * page stops scrolling the moment the pointer crosses the canvas, which
   * visitors read as the page being broken. Turn it on for editors and viewers.
   * @default false
   */
  zoom?: boolean
  /** Zoom limits as multipliers of the auto-framed distance. @default [0.35, 3] */
  zoomRange?: [number, number]
  /**
   * Change this number to snap the view back to the framed default. Double
   * clicking the canvas does the same thing with no wiring.
   */
  resetToken?: number
}

export interface MotionOptions {
  /** Idle spin in radians/second. 0 keeps the object still. @default 0 */
  autoRotate?: number
  /** Resting tilt in radians, `[x, y]`. @default [0, 0] */
  tilt?: [number, number]
  /**
   * Hold and drag to turn the object.
   *
   * On by default: this is a 3D object, and the first thing anyone does with
   * one on a page is try to spin it. Turning it off leaves a thing that looks
   * grabbable and is not, which reads as broken rather than as static.
   *
   * Safe with any orientation — the cursor probe transforms the ray through the
   * mesh's inverse world matrix, so the dent keeps landing under the pointer
   * however far it has been turned.
   * @default true
   */
  draggable?: boolean
  /**
   * Play animation clips embedded in a `.glb`. `true` plays the first clip, a
   * string picks one by name, `false` leaves the model in its bind pose.
   *
   * A rigged model is re-baked onto the liquid surface every frame, so this
   * costs real CPU — see `RIG_VERTEX_LIMIT`, past which a model is posed
   * rather than animated.
   * @default true
   */
  animation?: boolean | string
  /** Playback speed multiplier. @default 1 */
  animationSpeed?: number
  /**
   * Honour `prefers-reduced-motion`. When the visitor has asked for reduced
   * motion the drift, ripples and advection freeze and the object renders as a
   * still material. Non-negotiable by default for an effect this kinetic.
   * @default true
   */
  respectReducedMotion?: boolean
}
