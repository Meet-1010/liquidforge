import { ADVECT_GLSL, fieldGlsl } from "./field"
import type { MaterialFamily } from "../../types"

export const FAMILY_INDEX: Record<MaterialFamily, number> = {
  mercury: 0,
  aurora: 1,
  prism: 2,
  magma: 3,
  pearl: 4,
  obsidian: 5,
  velvet: 6,
  halo: 7,
  jade: 8,
  plasma: 9,
  original: 10,
}

/**
 * The look.
 *
 * One shader, eleven families, selected by `#define` so a preset compiles down to
 * exactly the branch it uses and nothing else. They share the expensive parts:
 * the advected hue field, the analytic studio environment, and the colour ramp.
 *
 * Each family is a different *technique*, not a different palette — a palette
 * is what a colourway is for. Mercury mirrors the environment, Prism refracts
 * it, Velvet refuses to reflect it at all. If a proposed family can be reached
 * by recolouring an existing one, it is a colourway.
 *
 * ## The environment is computed, not sampled
 *
 * Mercury and Prism need something to reflect. Rather than ship HDRIs or bake a
 * cubemap through `PMREMGenerator`, `lf_env` evaluates a studio analytically
 * from the reflection direction: a lit sky, a dark floor, and — the part that
 * actually reads as chrome — a hard horizon line between them. Roughness melts
 * the line and widens the key light.
 *
 * That keeps the package free of binary assets and licence questions, lets each
 * colourway tint its own environment from its palette, and costs a handful of
 * instructions instead of a texture fetch. The environment lives in view space,
 * so it behaves like a studio the viewer is standing in: the object turning
 * sweeps its reflections, exactly as it should.
 */
export function fragmentGlsl(trail: number, family: MaterialFamily, appearance = false): string {
  return /* glsl */ `
#define LF_FAMILY ${FAMILY_INDEX[family]}
${appearance ? "#define LF_APPEARANCE" : ""}

${fieldGlsl(trail)}
${ADVECT_GLSL}

uniform vec2  uPointer;
uniform vec3  uPalette[8];
uniform int   uPaletteCount;

uniform float uMetalness;
uniform float uRoughness;
uniform float uFresnel;
uniform float uSpecPower;
uniform float uTransmission;
uniform float uIor;
uniform float uThinFilm;
uniform float uEmissive;

uniform vec3  uEnvTop;
uniform vec3  uEnvHorizon;
uniform vec3  uEnvBottom;
uniform mat3  uNormalMatrix;   // object -> view, for the advected hue field

varying vec3  vNormal;
varying vec3  vView;
varying vec3  vObjPos;
varying vec3  vFlow;
varying float vHeight;

#ifdef LF_APPEARANCE
uniform sampler2D uAtlas;
uniform vec4      uAtlasRects[16];
uniform float     uHasAtlas;
varying vec2  vUv;
varying vec3  vSurface;
varying float vSlot;

/**
 * The object's own colour at this fragment.
 *
 * The base colour always applies; the texture only where this vertex's
 * material had one. UVs wrap inside their atlas cell with \`fract\`, which is
 * what a repeating glTF texture expects.
 */
vec3 lf_surface(){
  vec3 c = vSurface;
  float slot = floor(vSlot + 0.5);
  if (uHasAtlas > 0.5 && slot > -0.5) {
    vec4 r = uAtlasRects[0];
    for (int k = 0; k < 16; k++) {
      if (float(k) == slot) r = uAtlasRects[k];
    }
    c *= texture2D(uAtlas, r.xy + fract(vUv) * r.zw).rgb;
  }
  return c;
}
#else
/** A word or a primitive has no surface of its own; the colourway lends one. */
vec3 lf_surface(){ return uPalette[0]; }
#endif

vec3 lf_rotY(vec3 v, float a){ float c=cos(a), s=sin(a); return vec3(c*v.x+s*v.z, v.y, -s*v.x+c*v.z); }
vec3 lf_rotX(vec3 v, float a){ float c=cos(a), s=sin(a); return vec3(v.x, c*v.y-s*v.z, s*v.y+c*v.z); }

/** Palette as a colour wheel — wraps, for hue that cycles around the light axis. */
vec3 lf_palette(float t){
  float n = float(uPaletteCount);
  float s = fract(t) * n;
  float i0 = floor(s);
  float i1 = mod(i0 + 1.0, n);
  float f = smoothstep(0.0, 1.0, fract(s));
  vec3 c0 = uPalette[0];
  vec3 c1 = uPalette[0];
  // Indexed by comparison rather than by variable: GLSL ES 1.00 will not index
  // a uniform array with a non-constant expression.
  for (int k = 0; k < 8; k++) {
    if (float(k) == i0) c0 = uPalette[k];
    if (float(k) == i1) c1 = uPalette[k];
  }
  return mix(c0, c1, f);
}

/** Palette as a gradient — clamps, for heat and depth ramps. */
vec3 lf_ramp(float t){
  float n = float(uPaletteCount) - 1.0;
  float s = clamp(t, 0.0, 1.0) * n;
  float i0 = floor(s);
  float i1 = min(i0 + 1.0, n);
  float f = smoothstep(0.0, 1.0, fract(s));
  vec3 c0 = uPalette[0];
  vec3 c1 = uPalette[0];
  for (int k = 0; k < 8; k++) {
    if (float(k) == i0) c0 = uPalette[k];
    if (float(k) == i1) c1 = uPalette[k];
  }
  return mix(c0, c1, f);
}

/**
 * The studio, evaluated from a view-space direction.
 *
 * Structure is the point. A smooth gradient makes a poor mirror: a ripple only
 * shifts the brightness slightly and the surface reads as matte plastic. What
 * sells chrome is *edges* — a hard horizon and a second soft band above it —
 * because a ripple that bends an edge reads unmistakably as a moving
 * reflection. Roughness melts both of them back into the gradient.
 */
vec3 lf_env(vec3 d, float rough){
  float y = clamp(d.y, -1.0, 1.0);
  float sharp = 1.0 - rough;

  // Falls away from the horizon fast, so the bright band stays narrow.
  vec3 base = y > 0.0
    ? mix(uEnvHorizon, uEnvTop, pow(y, 0.35))
    : mix(uEnvHorizon, uEnvBottom, pow(-y, 0.45));

  // The horizon stays hard — that edge is the whole trick.
  base += uEnvHorizon * smoothstep(0.05, 0.0, abs(y)) * sharp * 0.85;
  // The two secondary sources are soft-edged on purpose. Given hard edges they
  // read as painted-on shapes rather than as light, and Prism's three refracted
  // rays cross each edge a hair apart, which turns one band into three.
  base += uEnvTop * smoothstep(0.55, 0.02, abs(y - 0.42)) * sharp * 0.75;
  base += uEnvTop * smoothstep(0.40, 0.02, abs(y + 0.58)) * sharp * 0.25;

  return base;
}

/** The key light, as a softbox that roughness widens and dims. */
vec3 lf_key(vec3 d, vec3 A, float rough){
  float k = mix(320.0, 5.0, rough);
  return vec3(1.0) * pow(max(dot(d, A), 0.0), k) * (1.0 - rough * 0.45);
}

void main(){
  // Forged geometry is rendered double-sided (a traced contour can wind either
  // way, and a deep ripple can turn a face over), so a back face has to flip
  // its normal or its relief reads inside-out.
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(vView);

  // The light axis follows the pointer and drifts, so the colour field is never
  // still even when nothing is moving. The fixed offset puts the key light up
  // and to the right rather than directly behind the viewer's eye, which is
  // both how a studio is actually lit and the difference between a highlight
  // that rakes across the surface and a hot dot stuck in the middle of it.
  vec3 A = normalize(vec3(uPointer.x * 0.75 + 0.30, uPointer.y * 0.75 + 0.34, 1.0));
  A = lf_rotY(A, uTime * 0.08);
  A = lf_rotX(A, sin(uTime * 0.06) * 0.35);

  // Hue reads from a SEPARATE normal that the vortex twists. Twisting the real
  // shading normal aims it at the light and bleaches the cursor into a white
  // blob instead of swirling colour (§5.6).
  vec3 Nh = normalize(uNormalMatrix * lf_advect(normalize(vFlow), vObjPos));

  vec3 T = normalize(cross(A, vec3(0.0, 1.0, 0.0001)));
  vec3 B = cross(A, T);
  float hue = fract(atan(dot(Nh, B), dot(Nh, T)) / 6.2831853 + 0.5 + uTime * 0.012);

  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 3.0);
  // Thin-film interference: the hue sweeps with the viewing angle, which is
  // what separates an oil slick from a coloured mirror.
  hue = fract(hue + fres * uThinFilm);

  float ndl = dot(N, A);
  vec3 R = reflect(-V, N);
  float alpha = 1.0;
  vec3 col;

#if LF_FAMILY == 0
  // ---- Mercury: liquid chrome, tinted -------------------------------------
  vec3 env = lf_env(R, uRoughness) + lf_key(R, A, uRoughness);
  vec3 tint = lf_palette(hue);
  col = mix(env, env * tint, uMetalness);
  // A dielectric needs a body colour underneath; a mirror does not.
  col += tint * (0.10 + 0.22 * clamp(ndl, 0.0, 1.0)) * (1.0 - uMetalness) * (1.0 - uMetalness);
  col += vec3(1.0) * pow(clamp(dot(R, A), 0.0, 1.0), uSpecPower) * 0.5;
  col = mix(col, uEnvHorizon, fres * uFresnel);

#elif LF_FAMILY == 1
  // ---- Aurora: iridescent oil slick ---------------------------------------
  // Structure ported from the reference implementation. The three whitening
  // terms are weaker here than they are there: the reference filled the
  // viewport with a surface the cursor was continuously stirring, so its colour
  // was always being regenerated. Sitting still on a gallery card, the original
  // weights bleach the palette to a white ball.
  col = lf_palette(hue);
  col = mix(vec3(1.0), col, smoothstep(-0.05, 0.55, 1.0 - abs(dot(Nh, A))));
  col = mix(col, vec3(1.0), pow(clamp(ndl, 0.0, 1.0), 0.85) * 0.42);

  vec3 Ra = reflect(-A, N);
  float rv = clamp(dot(Ra, V), 0.0, 1.0);
  col = mix(col, vec3(1.0), pow(rv, 5.0) * 0.30);
  col += vec3(1.0) * pow(rv, uSpecPower) * 0.55;
  col = mix(col, vec3(1.0), 0.07);
  col = mix(col, vec3(1.0), fres * uFresnel * 0.6);
  col *= 0.72 + 0.28 * smoothstep(-0.9, 0.6, ndl);

#elif LF_FAMILY == 2
  // ---- Prism: glass, with dispersion --------------------------------------
  float ior = max(1.02, uIor);
  float spread = (ior - 1.0) * 0.09;
  vec3 rr = refract(-V, N, 1.0 / ior);
  vec3 rg = refract(-V, N, 1.0 / (ior + spread));
  vec3 rb = refract(-V, N, 1.0 / (ior + spread * 2.0));
  // Total internal reflection returns a zero vector; fall back to the mirror.
  if (dot(rr, rr) < 0.001) rr = R;
  if (dot(rg, rg) < 0.001) rg = R;
  if (dot(rb, rb) < 0.001) rb = R;

  // The three rays land a hair apart, so a hard band edge between them shows
  // up as a stack of steps rather than as dispersion. Softening the
  // environment for the transmitted rays only keeps the mirror term crisp.
  float tRough = max(uRoughness, 0.35);
  vec3 through = vec3(
    (lf_env(rr, tRough) + lf_key(rr, A, tRough)).r,
    (lf_env(rg, tRough) + lf_key(rg, A, tRough)).g,
    (lf_env(rb, tRough) + lf_key(rb, A, tRough)).b
  );
  through *= mix(vec3(1.0), lf_palette(hue), 0.7);

  vec3 mirror = lf_env(R, uRoughness) + lf_key(R, A, uRoughness);
  float F = mix(0.05, 1.0, fres) * mix(0.45, 1.0, uFresnel);
  col = mix(through, mirror, F);
  col += vec3(1.0) * pow(clamp(dot(R, A), 0.0, 1.0), uSpecPower) * 0.6;
  // Real transmission would need the backdrop; letting the page show through
  // at the flats and going opaque at the rim gets most of the way there.
  alpha = mix(1.0, mix(0.40, 1.0, F), uTransmission);

#elif LF_FAMILY == 3
  // ---- Magma: molten, emissive in the troughs -----------------------------
  // Depth below the resting surface is the heat: the crust cracks where the
  // cursor has pulled it apart.
  float heat = clamp((-vHeight + uNoise * 0.4) / max(uDimple, 0.02), 0.0, 1.0);
  heat = pow(heat, 0.7);

  col = lf_ramp(heat * 0.55);
  col *= mix(0.30, 1.0, clamp(ndl, 0.0, 1.0));
  col += lf_ramp(min(1.0, 0.45 + heat * 0.55)) * heat * uEmissive;
  col += (lf_env(R, uRoughness) * 0.25 + lf_key(R, A, uRoughness) * 0.5) * uMetalness;
  col += vec3(1.0) * pow(clamp(dot(R, A), 0.0, 1.0), uSpecPower) * 0.2;
  col = mix(col, uEnvHorizon, fres * uFresnel * 0.4);

#elif LF_FAMILY == 4
  // ---- Pearl: soft matte iridescence --------------------------------------
  // Wrap lighting: light bleeds past the terminator the way it does through
  // something faintly translucent, which is what keeps this off a plastic look.
  float wrap = clamp((ndl + 0.6) / 1.6, 0.0, 1.0);
  vec3 tint = lf_palette(hue);
  col = tint * (0.55 + 0.45 * wrap);
  col = mix(col, lf_palette(hue + 0.18), fres * 0.55);
  col += vec3(1.0) * pow(clamp(dot(reflect(-A, N), V), 0.0, 1.0), uSpecPower) * 0.14;
  col += lf_env(R, max(uRoughness, 0.45)) * 0.12 * uMetalness;
  col = mix(col, uEnvHorizon, fres * uFresnel * 0.5);
  col = mix(col, vec3(1.0), 0.06);

#elif LF_FAMILY == 5
  // ---- Obsidian: a coloured body under a hard clear coat -------------------
  // Two layers, which is the whole difference from Mercury: a deep body that
  // takes light diffusely, and a thin coat above it that mirrors the studio.
  // Piano lacquer and car paint both read this way and neither is a mirror.
  vec3 body = lf_palette(hue) * (0.08 + 0.40 * clamp(ndl, 0.0, 1.0));
  float coatRough = uRoughness * 0.35;
  vec3 coat = lf_env(R, coatRough) + lf_key(R, A, coatRough);
  // Schlick for a dielectric coat: nearly transparent head-on, a mirror at the
  // grazing angle. That ramp is what makes it look lacquered rather than shiny.
  float coatF = mix(0.04, 1.0, fres) * mix(0.5, 1.0, uFresnel);
  col = body + coat * coatF;
  col += vec3(1.0) * pow(clamp(dot(R, A), 0.0, 1.0), uSpecPower * 2.0) * 0.9;

#elif LF_FAMILY == 6
  // ---- Velvet: sheen, and no specular at all -------------------------------
  // Retroreflective: brightest where the surface turns *away*, because the nap
  // catches light along the silhouette. Adding a highlight here would undo it —
  // the absence of one is what stops this reading as plastic.
  float sheen = pow(1.0 - ndv, mix(1.0, 4.0, uRoughness));
  vec3 nap = lf_palette(hue);
  // The body is dim but not black: cloth still has a colour where it faces you,
  // and at 0.05 the first pass at this read as a hole rather than as velvet.
  col = nap * (0.12 + 0.34 * clamp(ndl, 0.0, 1.0));
  col += nap * sheen * (1.15 + uFresnel);
  col += lf_palette(hue + 0.12) * pow(sheen, 3.0) * 0.5;

#elif LF_FAMILY == 7
  // ---- Halo: holographic foil ----------------------------------------------
  // Aurora's interference is one slow sweep across the surface. Here the film
  // is thin enough to fold the spectrum over several times, so the bands are
  // tight and they slide as the object turns — a holographic sticker, not oil.
  float bands = 1.0 + uThinFilm * 22.0;
  float film = fract(hue * bands + fres * 2.5 + uTime * 0.02);
  vec3 sheenColour = lf_palette(film);
  vec3 foil = lf_env(R, uRoughness) + lf_key(R, A, uRoughness);
  col = mix(foil * sheenColour * 1.4, sheenColour, 0.45);
  col += vec3(1.0) * pow(clamp(dot(R, A), 0.0, 1.0), uSpecPower) * 0.7;
  col = mix(col, uEnvHorizon, fres * uFresnel * 0.35);

#elif LF_FAMILY == 8
  // ---- Jade: light coming through, not off ---------------------------------
  // Backlight scatter: the glow sits where the surface faces away from the eye
  // and toward the light, strongest where it is thin. That inversion is what
  // separates something translucent from something merely pale.
  // Wrap first, so the stone has a body to glow inside. Keying the whole family
  // off the backlight alone left a dark ball with a lit rim — technically the
  // right term, and nothing like jade.
  float wrap = clamp((ndl + 0.7) / 1.7, 0.0, 1.0);
  float thin = 1.0 - abs(dot(N, V));
  vec3 stone = lf_palette(hue);
  col = stone * (0.30 + 0.55 * wrap);
  // Light that went in and came back out: strongest where the stone is thin,
  // and shifted in hue because the short wavelengths do not survive the trip.
  float through = pow(thin, 1.6) * (0.45 + 0.55 * wrap);
  col += lf_palette(hue + 0.2) * through * (0.6 + uTransmission * 1.6);
  col += vec3(1.0) * pow(clamp(dot(reflect(-A, N), V), 0.0, 1.0), uSpecPower) * 0.3;
  col = mix(col, uEnvHorizon, fres * uFresnel * 0.25);

#elif LF_FAMILY == 9
  // ---- Plasma: filaments in a dark body ------------------------------------
  // Magma emits from depth; this emits from the advected field, so the cursor
  // does not warm the surface, it drags the light around in it. A triangle wave
  // through the hue turns a smooth gradient into thin lines.
  float wave = abs(fract(hue * 6.0) - 0.5) * 2.0;
  float filament = pow(1.0 - wave, 9.0);
  col = lf_ramp(0.0) * 0.18;
  col += lf_ramp(clamp(0.35 + filament * 0.65, 0.0, 1.0)) * filament * uEmissive;
  col += lf_env(R, max(uRoughness, 0.5)) * 0.12 * uMetalness;
  col = mix(col, uEnvHorizon, fres * uFresnel * 0.3);

#else
  // ---- Original: the object's own surface, with the liquid on top ---------
  // Everything above replaces what the object looks like. This keeps it. The
  // ripples cannot show through colour here — the colour is the object's — so
  // they show through light instead: a diffuse term that shifts with the rebuilt
  // normal, and a clear coat whose reflections bend across every dent. The
  // colourway is the finish and the light, never the colour.
  vec3 base = lf_surface();
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
  // The colourway tints the light's hue and never its brightness: dividing by
  // the brightest channel keeps a dim studio from dimming the object, which on
  // the first pass turned a #ff5a36 fill into brick.
  vec3 tint = uEnvTop / max(0.2, max(uEnvTop.r, max(uEnvTop.g, uEnvTop.b)));
  vec3 light = mix(vec3(1.0), tint, 0.22);
  // A face turned toward the light lands at about its own colour, which is the
  // promise; the shadow side still falls off so the form reads.
  col = base * light * (0.42 + 0.72 * wrap);

  float coatF = mix(0.04, 1.0, fres) * mix(0.35, 1.0, uFresnel);
  vec3 coat = lf_env(R, uRoughness) + lf_key(R, A, uRoughness);
  col += coat * coatF * (0.25 + 0.75 * uMetalness);
  // A heavy coat tints the body the way lacquer over a print does.
  col = mix(col, col * (coat * 0.8 + 0.2), uMetalness * 0.3);
  col += vec3(1.0) * pow(clamp(dot(R, A), 0.0, 1.0), uSpecPower) * 0.4 * (1.0 - uRoughness);
#endif

  // The well under the cursor sits in its own shadow, whatever the family.
  float dP = length(vObjPos - uPtr) / uRadius;
  col *= 1.0 - exp(-dP * dP * 13.0) * uPress * 0.28;

  gl_FragColor = vec4(col, alpha);
}
`
}
