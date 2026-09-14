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
uniform float uMutation;    // 0..1, how far into a melt-and-reform the surface is
uniform vec3  uGravity;     // object-space pull, for a tilted phone: the pool swells toward it
uniform float uSlosh;       // how far the surface follows that pull

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

#ifdef LF_FERRO
uniform float uSpikes;
uniform vec3  uMagnet;      // object-space point the spikes are drawn toward; glides after the cursor
uniform float uMagnetPull;  // 0..1, how strongly, fading with the cursor's distance from the object

vec3 lf_hash3(vec3 p){
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

/**
 * The offset from the nearest spike root to q, in cell units.
 *
 * Spike roots are jittered points in a 3D grid, each wandering slowly on its own
 * phase, so the field of spikes shifts like a liquid rather than sitting on a
 * lattice. Working in object space means the same code spikes a word, a torus
 * and a scanned model, the same way the ripples do. The offset rather than the
 * distance, so a spike's tip can be placed somewhere other than over its root.
 */
vec3 lf_rootOffset(vec3 q){
  vec3 cell = floor(q);
  vec3 f = q - cell;
  float best = 64.0;
  vec3 offset = vec3(8.0);
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      for (int z = -1; z <= 1; z++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 h = lf_hash3(cell + o);
        vec3 root = o + 0.5 + 0.3 * sin(uTime * 0.55 + 6.2831853 * h);
        vec3 r = f - root;
        float d = dot(r, r);
        if (d < best) {
          best = d;
          offset = r;
        }
      }
    }
  }
  return offset;
}

/**
 * How hard the magnet pulls at p, 0–1.
 *
 * The magnet is not the point under the cursor but a point that follows it,
 * gliding around the object, and it keeps pulling while the cursor is near the
 * object rather than only while it is over it. Close, the pull is tight and
 * strong; from further off it is weaker and broader, so the spikes lean toward
 * a cursor that is still on its way. With no cursor near, a weaker magnet
 * orbits slowly around the object, so a few spikes are always rising somewhere
 * and the surface never reads as a still black blob.
 */
float lf_magnet(vec3 p){
  float dM = length(p - uMagnet) / uRadius;
  float cursor = exp(-dM * dM * mix(3.2, 8.5, uMagnetPull * uMagnetPull)) * uMagnetPull;
  float t = uTime * 0.33;
  vec3 idle = uRadius * vec3(sin(t) * 0.95, sin(t * 0.77) * 0.45, cos(t) * 0.95);
  float dI = length(p - idle) / uRadius;
  float drift = exp(-dI * dI * 3.4) * 0.34 * (1.0 - uMagnetPull);
  return clamp(cursor + drift, 0.0, 1.0);
}

/**
 * Spike height at p: a cone with a rounded foot, taller and sharper where the
 * pull is stronger, and its tip leaning toward the magnet.
 *
 * The lean is still a height field — which the vertex stage needs, to rebuild
 * normals from it — made by measuring the foot of each cone from its root and
 * the top of it from a point nudged along the surface toward the magnet, so the
 * slope facing the magnet is steep and the far one long.
 */
float lf_spikes(vec3 p, vec3 n){
  float m = lf_magnet(p);
  if (m < 0.004) return 0.0;
  // Dense enough that a letter's stroke carries several spikes and keeps its
  // outline; sparser and a word turns into one spiny lump.
  vec3 r = lf_rootOffset(p / uRadius * 13.0);
  float footDistance = length(r);

  vec3 toward = uMagnet - p;
  toward -= n * dot(toward, n);
  float along = length(toward);
  vec3 lean = along > 1e-5 ? toward / along * 0.3 * smoothstep(0.0, 0.2 * uRadius, along) * uMagnetPull : vec3(0.0);
  float tipDistance = length(r - lean);

  // Wide enough that neighbouring cones meet in a valley instead of leaving flat
  // ground between them, and blunt enough at the tip that the mesh can resolve
  // it — a needle thinner than a triangle renders as nothing at all.
  float foot = clamp(1.0 - footDistance / 0.78, 0.0, 1.0);
  float d = mix(footDistance, tipDistance, foot);
  float s = clamp(1.0 - d / 0.78, 0.0, 1.0);
  s = pow(s, mix(1.25, 2.1, m));
  return s * smoothstep(0.0, 0.3, m) * uSpikes * uRadius * 1.15;
}
#endif

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
  // Tilt: the side facing down swells and the side facing up draws in, with a
  // travelling wave across it, so a tipped object reads as liquid settling.
  if (uSlosh > 0.0) {
    float lean = dot(n, uGravity);
    f += (lean * 0.75 + sin(dot(p / uRadius, uGravity) * 7.0 - uTime * 5.0) * 0.18 * length(uGravity)) * uSlosh * uRadius;
  }
#ifdef LF_FERRO
  f += lf_spikes(p, n);
#endif
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
  float calm = (lf_snoise(q * 0.85 + vec3(t, t * 0.7, -t)) * 0.7
              + lf_snoise(q * 1.7  + vec3(-t * 0.6, t * 0.4, t)) * 0.2) * uNoise;
  // A checkpoint change. The surface boils up, the object is swapped at the
  // peak while nobody can read its shape, and it settles into the new one —
  // which reads as the liquid becoming something else rather than as a cut.
  if (uMutation < 0.001) return calm;
  float boil = lf_snoise(q * 3.1 + vec3(uTime * 1.3, -uTime * 0.9, uTime * 1.1)) * 0.65
             + lf_snoise(q * 6.3 + vec3(-uTime * 1.7, uTime * 1.2, -uTime)) * 0.35;
  return calm + boil * uMutation * uRadius * 0.24;
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
