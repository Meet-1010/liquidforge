import { fieldGlsl } from "./field"

/**
 * Displace, then rebuild the normal. The second half is the whole effect.
 *
 * Moving vertices without recomputing normals leaves the lighting believing the
 * surface is undisturbed, so dents and ripples are *completely invisible* no
 * matter how hard the geometry is pushed. You get a flat gradient and hours
 * spent in the fragment shader, which is the wrong layer entirely (§5.1).
 *
 * On a sphere you can rebuild by evaluating the surface at two tangent offsets
 * and crossing the edges. That trick leans on `d = normalize(position)`, which
 * is not true of anything else, so this does the equivalent for arbitrary
 * geometry: build an orthonormal frame from the mesh's *own* normal — no UVs
 * and no tangent attribute needed, unlike `computeTangents()` — sample the
 * height field at two offsets inside that tangent plane, and tilt the normal by
 * the gradient.
 *
 *     normalize(cross(pa - p, pb - p))  ==  normalize(n - (t1*dHa + t2*dHb)/e)
 *
 * Those are the same expression: expanding the cross product gives
 * `e²n - e·dHb·t2 - e·dHa·t1`, which normalises to the right-hand side. The
 * gradient form is written out here because it costs two fewer cross products
 * and needs no winding-order guard.
 *
 * Displacement runs along `flowNormal` rather than `normal`. They differ only
 * where the mesh has split vertices — a hard crease, an extrusion seam — and
 * there `normal` points two ways at one position, which would tear the surface
 * open along every edge. `flowNormal` is welded across position, so the seam
 * holds; `normal` still shades it, so the crease stays crisp.
 */
export function vertexGlsl(trail: number, appearance = false): string {
  return /* glsl */ `
${appearance ? "#define LF_APPEARANCE" : ""}
${fieldGlsl(trail)}

attribute vec3 flowNormal;

#ifdef LF_APPEARANCE
// The source's own surface, carried through the pipeline for the original
// family. Named with a prefix so they never collide with the uv and color
// attributes three declares on a ShaderMaterial for itself.
attribute vec2  lfUv;
attribute vec3  lfSurface;
attribute float lfSlot;
varying vec2  vUv;
varying vec3  vSurface;
varying float vSlot;
#endif

// Diagnostics. 1 is the correct behaviour; 0 is the specific failure the
// explainer page exists to show.
uniform float uRebuildNormals;
uniform float uWeldSeams;

varying vec3 vNormal;
varying vec3 vView;
varying vec3 vObjPos;
varying vec3 vFlow;
varying float vHeight;

void main(){
  vec3 n = normalize(normal);
  vec3 dir = normalize(mix(n, normalize(flowNormal), uWeldSeams));

  // One drift evaluation, shared by all three samples. At the amplitudes the
  // presets use it adds no relief of its own, so this is 2 noise lookups
  // instead of 6 (§5.8.3).
  float nz = lf_drift(position);

  float h = nz + lf_height(position, dir);
  vec3 p = position + dir * h;

  vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 t1 = normalize(cross(n, up));
  vec3 t2 = cross(n, t1);

  float e = 0.02 * uRadius;
  float ha = nz + lf_height(position + t1 * e, dir);
  float hb = nz + lf_height(position + t2 * e, dir);

  vec3 nrm = normalize(n - (t1 * (ha - h) + t2 * (hb - h)) / e * uRebuildNormals);

  // A melt pulls the object in a little, so the reforming shape grows back out
  // of the old one instead of popping to full size.
  p *= 1.0 - uMutation * 0.14;

#ifdef LF_APPEARANCE
  vUv = lfUv;
  vSurface = lfSurface;
  vSlot = lfSlot;
#endif

  vObjPos = p;
  vFlow = nrm;
  vHeight = h;
  vNormal = normalize(normalMatrix * nrm);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`
}
