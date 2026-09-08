import { Color, DoubleSide, Matrix3, ShaderMaterial, Vector2, Vector3, Vector4 } from "three"
import { fragmentGlsl } from "./glsl/fragment"
import { vertexGlsl } from "./glsl/vertex"
import { studioColors } from "./environment"
import type { LiquidPreset } from "../types"

/** Longest palette the shader will read. Presets are validated against this. */
export const MAX_PALETTE = 8

export interface LiquidUniforms {
  [name: string]: { value: unknown }
}

/**
 * The material, plus the handful of things the engine writes into it every
 * frame.
 *
 * Trail length and family are baked in as `#define`s, so changing either needs
 * a new material. Everything else is a uniform and can be moved live, which is
 * what lets the Studio's sliders respond without a recompile stutter.
 */
export interface LiquidMaterialHandle {
  material: ShaderMaterial
  family: LiquidPreset["family"]
  trail: number
  /** Retune to a preset of the same family and trail length. */
  apply(preset: LiquidPreset): void
  dispose(): void
}

function emptyTrail(length: number) {
  // w < 0 marks a slot as unused; the shader skips those before doing any work.
  return Array.from({ length }, () => new Vector4(0, 0, 0, -1))
}

function emptyTrailNormals(length: number) {
  return Array.from({ length }, () => new Vector4(0, 1, 0, 1))
}

function paletteVectors(palette: string[]): Color[] {
  const colors = palette.slice(0, MAX_PALETTE).map((hex) => new Color(hex))
  if (colors.length === 0) colors.push(new Color("#ffffff"))
  // The array is a fixed size in GLSL; pad so unread slots are still defined.
  while (colors.length < MAX_PALETTE) colors.push(colors[colors.length - 1].clone())
  return colors
}

export function createLiquidMaterial(preset: LiquidPreset, trail: number): LiquidMaterialHandle {
  const material = new ShaderMaterial({
    vertexShader: vertexGlsl(trail),
    fragmentShader: fragmentGlsl(trail, preset.family),
    // Contour-traced geometry can wind either way and a deep ripple can turn a
    // face over, so both sides have to draw. The fragment shader flips the
    // normal on back faces to keep the relief the right way round.
    side: DoubleSide,
    transparent: (preset.shading.transmission ?? 0) > 0,
    uniforms: {
      uTime: { value: 0 },
      uRadius: { value: 1 },

      uNoise: { value: preset.surface.noise },
      uDimple: { value: preset.surface.dimple },
      uRippleAmp: { value: preset.surface.rippleAmp },
      uRippleSpeed: { value: preset.surface.rippleSpeed },
      uRippleTight: { value: preset.surface.rippleTightness },
      uAdvection: { value: preset.surface.advection },

      uPress: { value: 0 },
      uPtr: { value: new Vector3(0, 0, 1) },
      uPtrN: { value: new Vector3(0, 0, 1) },
      uTrail: { value: emptyTrail(trail) },
      uTrailN: { value: emptyTrailNormals(trail) },

      uPointer: { value: new Vector2(0, 0) },
      uPalette: { value: paletteVectors(preset.palette) },
      uPaletteCount: { value: Math.max(2, Math.min(MAX_PALETTE, preset.palette.length)) },

      uMetalness: { value: preset.shading.metalness },
      uRoughness: { value: preset.shading.roughness },
      uFresnel: { value: preset.shading.fresnel },
      uSpecPower: { value: preset.shading.specPower },
      uTransmission: { value: preset.shading.transmission ?? 0 },
      uIor: { value: preset.shading.ior ?? 1.45 },
      uThinFilm: { value: preset.shading.thinFilm ?? 0 },
      uEmissive: { value: preset.shading.emissive ?? 0 },

      uEnvTop: { value: new Color() },
      uEnvHorizon: { value: new Color() },
      uEnvBottom: { value: new Color() },
      uNormalMatrix: { value: new Matrix3() },
    },
  })

  const handle: LiquidMaterialHandle = {
    material,
    family: preset.family,
    trail,
    apply(next) {
      applyPreset(material, next)
    },
    dispose() {
      material.dispose()
    },
  }

  applyPreset(material, preset)
  return handle
}

/**
 * Push a preset's numbers into a live material.
 *
 * Only valid for a preset of the same family — the family is a compile-time
 * branch, not a uniform. `LiquidEngine` checks that before calling.
 */
export function applyPreset(material: ShaderMaterial, preset: LiquidPreset): void {
  const u = material.uniforms

  u.uNoise.value = preset.surface.noise
  u.uDimple.value = preset.surface.dimple
  u.uRippleAmp.value = preset.surface.rippleAmp
  u.uRippleSpeed.value = preset.surface.rippleSpeed
  u.uRippleTight.value = preset.surface.rippleTightness
  u.uAdvection.value = preset.surface.advection

  u.uMetalness.value = preset.shading.metalness
  u.uRoughness.value = preset.shading.roughness
  u.uFresnel.value = preset.shading.fresnel
  u.uSpecPower.value = preset.shading.specPower
  u.uTransmission.value = preset.shading.transmission ?? 0
  u.uIor.value = preset.shading.ior ?? 1.45
  u.uThinFilm.value = preset.shading.thinFilm ?? 0
  u.uEmissive.value = preset.shading.emissive ?? 0

  const colors = paletteVectors(preset.palette)
  const target = u.uPalette.value as Color[]
  for (let i = 0; i < MAX_PALETTE; i++) target[i].copy(colors[i])
  u.uPaletteCount.value = Math.max(2, Math.min(MAX_PALETTE, preset.palette.length))

  const env = studioColors(preset)
  ;(u.uEnvTop.value as Color).copy(env.top)
  ;(u.uEnvHorizon.value as Color).copy(env.horizon)
  ;(u.uEnvBottom.value as Color).copy(env.bottom)

  material.transparent = (preset.shading.transmission ?? 0) > 0
  material.needsUpdate = true
}
