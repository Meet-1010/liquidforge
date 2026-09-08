import { NOISE_GLSL } from "./noise"

/**
 * The displacement field, shared verbatim by both stages.
 *
 * This is the generalisation of the reference orb from a sphere to any mesh.
 * The orb worked in *angles* on a unit sphere — `acos(dot(d, uPtr))` — which
 * has no meaning on a torus knot or a piece of extruded text. Everything here
 * is instead expressed as a **Euclidean distance in object space**, divided by
 * the object's bounding radius so a preset tuned on one object reads the same
 * on the next.
 *
 * Two side effects of that change, both wins:
 *
 * - `length()` replaces `acos()`, which was the most expensive call in the
 *   loop, and the early-out can now reject on a squared distance with no
 *   square root at all (§5.8.2).
 * - Distance is defined between any two points, so ripples cross seams and
 *   sharp edges without knowing they are there.
 *
 * The one thing distance loses is that a ring on the front of a thin object
 * also reaches the back at nearly the same distance. `facing` below fades a
 * ring out on surfaces pointing away from where it was born, which restores
 * the sphere's behaviour without reintroducing geodesics.
 */
export function fieldGlsl(trail: number): string {
  return /* glsl */ `
#define TRAIL ${trail}

uniform float uTime;
uniform float uRadius;      // bounding radius, so presets are scale-independent

uniform float uNoise;
uniform float uDimple;
uniform float uRippleAmp;
uniform float uRippleSpeed;
uniform float uRippleTight;
uniform float uAdvection;

uniform float uPress;       // 0..1, how hard the cursor is pressing in
uniform vec3  uPtr;         // object-space point on the surface under the cursor
uniform vec3  uPtrN;        // surface normal there

// xyz = object-space emit point, w = emit time (negative = empty slot)
uniform vec4 uTrail[TRAIL];
// xyz = surface normal at emit, w = cursor speed at emit
uniform vec4 uTrailN[TRAIL];

${NOISE_GLSL}

vec3 lf_rotAxis(vec3 v, vec3 axis, float a){
  float c = cos(a), s = sin(a);
  return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
}

/** How long a ring stays alive, in seconds. Past this it contributes nothing. */
#define RING_LIFE 1.9

/**
 * Surface height at an object-space point, along that point's own normal.
 *
 * A tight well under the cursor with a raised lip around it — the cursor dents
 * the surface rather than scooping a bowl out of it — plus one expanding ring
 * per trail point, each running on its own clock so the motion outlives the
 * pointer that started it (§5.5).
 */
float lf_height(vec3 p, vec3 n){
  float dP = length(p - uPtr) / uRadius;
  float facingP = smoothstep(-0.65, 0.15, dot(n, uPtrN));

  float f = -exp(-dP * dP * 38.0) * uPress * uDimple * facingP;
  f += exp(-pow(dP - 0.25, 2.0) * 105.0) * uPress * uDimple * 0.33 * facingP;

  for (int i = 0; i < TRAIL; i++) {
    vec4 s = uTrail[i];
    if (s.w < 0.0) continue;
    float age = uTime - s.w;
    if (age > RING_LIFE) continue;

    // Reject on squared distance, before the sqrt. A crest travels
    // age * speed and the gaussian band adds a little either side, so
    // anything past that contributes nothing measurable.
    vec3 rel = (p - s.xyz) / uRadius;
    float d2 = dot(rel, rel);
    float reach = age * uRippleSpeed + 0.55;
    if (d2 > reach * reach) continue;

    float d = sqrt(d2);
    float r = age * uRippleSpeed;
    float band = exp(-pow(d - r, 2.0) * uRippleTight);
    float life = (1.0 - exp(-age * 7.0)) * exp(-age * 1.6);
    // Fade the ring out where the surface has turned away from its origin, so
    // a ring struck on the front of thin geometry does not print through to
    // the back.
    float facing = smoothstep(-0.65, 0.15, dot(n, uTrailN[i].xyz));
    f += sin((d - r) * 16.0) * band * life * facing * uTrailN[i].w * uRippleAmp;
  }

  return f;
}

/** Slow organic drift, so the object is alive before anyone touches it. */
float lf_drift(vec3 p){
  vec3 q = p / uRadius;
  float t = uTime * 0.14;
  return (lf_snoise(q * 0.85 + vec3(t, t * 0.7, -t)) * 0.7
        + lf_snoise(q * 1.7  + vec3(-t * 0.6, t * 0.4, t)) * 0.2) * uNoise;
}
`
}

/**
 * The per-pixel vortex.
 *
 * Each trail point drags the colour field around its own normal — hard at the
 * centre, weakly further out. That *differential* rotation is what winds a
 * smooth gradient into a spiral scroll; concentric rings will not do it, and
 * neither will more triangles, because the detail lives between the vertices
 * (§5.6).
 *
 * Runs per pixel, so the early-out earns more here than anywhere else in the
 * shader: the falloff is under 0.001 by d = 1.16, and rejecting on `d2` skips
 * the square root entirely for everything outside that cap.
 */
export const ADVECT_GLSL = /* glsl */ `
vec3 lf_advect(vec3 field, vec3 p){
  for (int i = 0; i < TRAIL; i++) {
    vec4 s = uTrail[i];
    if (s.w < 0.0) continue;
    float age = uTime - s.w;
    if (age > RING_LIFE) continue;

    vec3 rel = (p - s.xyz) / uRadius;
    float d2 = dot(rel, rel);
    if (d2 > 1.35) continue;

    float fall = exp(-d2 * 5.2);
    // The winding builds while the vortex is young and then relaxes; a faster
    // stroke winds its own vortex harder.
    float wind = (1.0 - exp(-age * 2.4)) * exp(-age * 0.72);
    field = lf_rotAxis(field, uTrailN[i].xyz, fall * wind * uTrailN[i].w * uAdvection);
  }
  return normalize(field);
}
`
