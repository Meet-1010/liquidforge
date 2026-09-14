import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LinearSRGBColorSpace,
  Mesh,
  SRGBColorSpace,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from "three"

/**
 * How far a shape reaches in every direction from its centre, and which way its
 * surface faces there.
 *
 * This is what lets one object become another without a cut. Two shapes almost
 * never share a topology — a word has thousands of vertices in letter-shaped
 * rows, a capsule a few hundred in rings — so there is no vertex on one to move
 * to a vertex on the other. Every shape does have an answer to "how far out is
 * the surface, looking this way", though, and that answer is a picture: a
 * latitude-longitude grid of radii. A vertex of the old shape looks up the new
 * shape's radius along its own direction and knows where to go.
 *
 * For a shape you could see all of from its centre — a sphere, a capsule, a
 * blob — the grid is exact, so the old mesh arriving at the new shape and the
 * new mesh leaving the old shape meet at the same surface halfway, and the
 * handover between them is invisible. For a shape that folds back on itself, a
 * letter's counter or a torus's hole, it is the outer envelope, which is close
 * enough that a boiling surface hides the difference.
 */
export interface RadialMap {
  width: number
  height: number
  /** Outermost radius per cell. */
  radius: Float32Array
  /** Unit outward normal per cell, three per cell. */
  normal: Float32Array
}

const TAU = Math.PI * 2

function cellOf(x: number, y: number, z: number, length: number, width: number, height: number) {
  const lat = Math.acos(Math.max(-1, Math.min(1, y / length)))
  const lon = Math.atan2(z, x)
  const row = Math.min(height - 1, Math.floor((lat / Math.PI) * height))
  const col = Math.min(width - 1, Math.floor(((lon + Math.PI) / TAU) * width))
  return row * width + col
}

export function buildRadialMap(geometry: BufferGeometry, width = 128, height = 64): RadialMap {
  const position = geometry.getAttribute("position")
  const normalAttribute = geometry.getAttribute("flowNormal") ?? geometry.getAttribute("normal")
  const index = geometry.getIndex()
  const cells = width * height
  const radius = new Float32Array(cells).fill(-1)
  const normal = new Float32Array(cells * 3)
  const cellAngle = Math.PI / height

  const splat = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    const length = Math.hypot(x, y, z)
    if (length < 1e-5) return
    const cell = cellOf(x, y, z, length, width, height)
    if (length <= radius[cell]) return
    radius[cell] = length
    // The envelope faces outward, whichever way the triangle that reached it
    // was wound.
    const flip = nx * x + ny * y + nz * z < 0 ? -1 : 1
    normal[cell * 3] = nx * flip
    normal[cell * 3 + 1] = ny * flip
    normal[cell * 3 + 2] = nz * flip
  }

  /*
   * Triangles, not vertices. A vertex-only splat leaves every direction between
   * sparse vertices empty — and a primitive's flat stretches are exactly that:
   * three's capsule has no vertices at all between the two rings where its caps
   * meet the cylinder. Filling those gaps from their neighbours made the capsule
   * as wide at its middle as at its shoulders, so a word morphing into it barely
   * drew in. Each triangle is sampled finely enough to land in every cell it
   * crosses.
   */
  const triangles = index ? index.count / 3 : position.count / 3
  const budget = 2_500_000
  let spent = 0
  const vertex = (i: number) => (index ? index.getX(i) : i)
  for (let t = 0; t < triangles; t++) {
    const ia = vertex(t * 3)
    const ib = vertex(t * 3 + 1)
    const ic = vertex(t * 3 + 2)
    const ax = position.getX(ia), ay = position.getY(ia), az = position.getZ(ia)
    const bx = position.getX(ib), by = position.getY(ib), bz = position.getZ(ib)
    const cx = position.getX(ic), cy = position.getY(ic), cz = position.getZ(ic)
    const near = Math.max(1e-3, Math.min(Math.hypot(ax, ay, az), Math.hypot(bx, by, bz), Math.hypot(cx, cy, cz)))
    const span = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz))
    const steps = spent > budget ? 1 : Math.min(64, Math.max(1, Math.ceil(span / near / (cellAngle * 0.7))))

    const na = normalAttribute
    for (let u = 0; u <= steps; u++) {
      for (let v = 0; v <= steps - u; v++) {
        const wb = u / steps
        const wc = v / steps
        const wa = 1 - wb - wc
        let nx: number, ny: number, nz: number
        if (na) {
          nx = na.getX(ia) * wa + na.getX(ib) * wb + na.getX(ic) * wc
          ny = na.getY(ia) * wa + na.getY(ib) * wb + na.getY(ic) * wc
          nz = na.getZ(ia) * wa + na.getZ(ib) * wb + na.getZ(ic) * wc
        } else {
          nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
          ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
          nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        }
        splat(ax * wa + bx * wb + cx * wc, ay * wa + by * wb + cy * wc, az * wa + bz * wb + cz * wc, nx, ny, nz)
      }
    }
    spent += ((steps + 1) * (steps + 2)) / 2
  }

  // Directions nothing reached — through a torus's hole, past a letter's edge —
  // borrow from their neighbours, ring by ring, until every cell has a value.
  let empty = radius.reduce((count, value) => count + (value < 0 ? 1 : 0), 0)
  for (let pass = 0; empty > 0 && pass < width; pass++) {
    const nextRadius = radius.slice()
    const nextNormal = normal.slice()
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const cell = row * width + col
        if (radius[cell] >= 0) continue
        let sum = 0
        let count = 0
        let nx = 0
        let ny = 0
        let nz = 0
        for (let dr = -1; dr <= 1; dr++) {
          const r = row + dr
          if (r < 0 || r >= height) continue
          for (let dc = -1; dc <= 1; dc++) {
            const neighbour = r * width + ((col + dc + width) % width)
            if (radius[neighbour] < 0) continue
            sum += radius[neighbour]
            nx += normal[neighbour * 3]
            ny += normal[neighbour * 3 + 1]
            nz += normal[neighbour * 3 + 2]
            count++
          }
        }
        if (count === 0) continue
        nextRadius[cell] = sum / count
        nextNormal[cell * 3] = nx
        nextNormal[cell * 3 + 1] = ny
        nextNormal[cell * 3 + 2] = nz
        empty--
      }
    }
    radius.set(nextRadius)
    normal.set(nextNormal)
  }
  if (empty > 0) radius.fill(1)

  // A light blur, so the target surface is a skin rather than a field of
  // spikes where one long triangle happened to reach a cell and its neighbour
  // did not.
  for (let pass = 0; pass < 2; pass++) {
    const nextRadius = new Float32Array(cells)
    const nextNormal = new Float32Array(cells * 3)
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        let sum = 0
        let count = 0
        const cell = row * width + col
        for (let dr = -1; dr <= 1; dr++) {
          const r = Math.max(0, Math.min(height - 1, row + dr))
          for (let dc = -1; dc <= 1; dc++) {
            const neighbour = r * width + ((col + dc + width) % width)
            sum += radius[neighbour]
            nextNormal[cell * 3] += normal[neighbour * 3]
            nextNormal[cell * 3 + 1] += normal[neighbour * 3 + 1]
            nextNormal[cell * 3 + 2] += normal[neighbour * 3 + 2]
            count++
          }
        }
        nextRadius[cell] = sum / count
      }
    }
    radius.set(nextRadius)
    normal.set(nextNormal)
  }

  for (let cell = 0; cell < cells; cell++) {
    const i = cell * 3
    const length = Math.hypot(normal[i], normal[i + 1], normal[i + 2]) || 1
    normal[i] /= length
    normal[i + 1] /= length
    normal[i + 2] /= length
  }

  return { width, height, radius, normal }
}

export interface MorphAttributes {
  position: BufferAttribute
  normal: BufferAttribute
}

/** Radius and normal of a map's surface along a unit direction, bilinear in the grid. */
function sample(map: RadialMap, dx: number, dy: number, dz: number, normalOut?: Float32Array, offset = 0): number {
  const { width, height, radius, normal } = map
  // Wrapping around the longitude, clamped at the poles.
  const u = ((Math.atan2(dz, dx) + Math.PI) / TAU) * width - 0.5
  const v = (Math.acos(Math.max(-1, Math.min(1, dy))) / Math.PI) * height - 0.5
  const c0 = Math.floor(u)
  const r0 = Math.floor(v)
  const fu = u - c0
  const fv = v - r0
  const cA = ((c0 % width) + width) % width
  const cB = (cA + 1) % width
  const rA = Math.max(0, Math.min(height - 1, r0))
  const rB = Math.max(0, Math.min(height - 1, r0 + 1))
  const i00 = rA * width + cA
  const i10 = rA * width + cB
  const i01 = rB * width + cA
  const i11 = rB * width + cB
  const w00 = (1 - fu) * (1 - fv)
  const w10 = fu * (1 - fv)
  const w01 = (1 - fu) * fv
  const w11 = fu * fv

  if (normalOut) {
    let nx = normal[i00 * 3] * w00 + normal[i10 * 3] * w10 + normal[i01 * 3] * w01 + normal[i11 * 3] * w11
    let ny = normal[i00 * 3 + 1] * w00 + normal[i10 * 3 + 1] * w10 + normal[i01 * 3 + 1] * w01 + normal[i11 * 3 + 1] * w11
    let nz = normal[i00 * 3 + 2] * w00 + normal[i10 * 3 + 2] * w10 + normal[i01 * 3 + 2] * w01 + normal[i11 * 3 + 2] * w11
    const n = Math.hypot(nx, ny, nz) || 1
    nx /= n
    ny /= n
    nz /= n
    normalOut[offset] = nx
    normalOut[offset + 1] = ny
    normalOut[offset + 2] = nz
  }
  return radius[i00] * w00 + radius[i10] * w10 + radius[i01] * w01 + radius[i11] * w11
}

/**
 * Point every vertex of `geometry` at the surface `target` describes, along the
 * vertex's own direction from the centre, and give it that surface's normal.
 *
 * Returned rather than set, so a shape that sits between two others in a chain
 * of checkpoints can hold a set aimed at each and swap between them for free —
 * three uploads an attribute once and keeps it, so swapping which one is bound
 * costs nothing after the first time. The vertex shader mixes toward them by
 * `uMorph`; a mesh without them reads zero, which with `uMorph` at zero mixes to
 * exactly the resting surface.
 */
export function morphAttributes(geometry: BufferGeometry, target: RadialMap): MorphAttributes {
  const position = geometry.getAttribute("position")
  const count = position.count
  const pos = new Float32Array(count * 3)
  const nrm = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    let x = position.getX(i)
    let y = position.getY(i)
    let z = position.getZ(i)
    let length = Math.hypot(x, y, z)
    if (length < 1e-5) {
      x = 0
      y = 1
      z = 0
      length = 1
    }
    const dx = x / length
    const dy = y / length
    const dz = z / length
    const r = sample(target, dx, dy, dz, nrm, i * 3)
    pos[i * 3] = dx * r
    pos[i * 3 + 1] = dy * r
    pos[i * 3 + 2] = dz * r
  }

  return { position: new BufferAttribute(pos, 3), normal: new BufferAttribute(nrm, 3) }
}

/**
 * How far a shape is from its own radial envelope, as a fraction of its size:
 * about 0 for a sphere or a capsule, large for a word, whose letters sit well
 * inside the blob drawn around them.
 *
 * It decides when a transition hands over. Halfway through, each mesh is
 * partway to the other's envelope, and the two differ by each shape's distance
 * from its own envelope, weighted by how far it still has to go. Handing over
 * nearer the end of the side that folds in on itself means the pictures being
 * mixed are the closest they ever get — which is where the ghost of a word
 * behind a capsule used to show.
 */
export function envelopeError(geometry: BufferGeometry, map: RadialMap, radius: number): number {
  const position = geometry.getAttribute("position")
  const step = Math.max(1, Math.floor(position.count / 4000))
  let total = 0
  let count = 0
  for (let i = 0; i < position.count; i += step) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const length = Math.hypot(x, y, z)
    if (length < 1e-5) continue
    total += Math.abs(sample(map, x / length, y / length, z / length) - length)
    count++
  }
  return count ? total / count / Math.max(1e-3, radius) : 0
}

/**
 * Two renders, one frame: draws each side of a transition into its own target
 * and mixes the pictures.
 *
 * Mixing pictures rather than blending two meshes in one pass is what keeps the
 * handover clean. Two translucent meshes in the same place fight over depth and
 * show each other's back faces; two finished images do not know about depth at
 * all. It only runs for the few frames where both sides are visible — outside
 * that, the engine draws straight to the canvas as it always has.
 */
export class Crossfade {
  private targets: [WebGLRenderTarget, WebGLRenderTarget] | null = null
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly material = new ShaderMaterial({
    uniforms: {
      uA: { value: null as Texture | null },
      uB: { value: null as Texture | null },
      uMix: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    // Both targets hold exactly what the canvas would have, alpha included, so
    // a straight mix is the right blend on an opaque ground and a transparent one.
    fragmentShader: /* glsl */ `
      uniform sampler2D uA;
      uniform sampler2D uB;
      uniform float uMix;
      varying vec2 vUv;
      void main() {
        gl_FragColor = mix(texture2D(uA, vUv), texture2D(uB, vUv), uMix);
      }
    `,
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
  })

  constructor() {
    this.scene.add(new Mesh(new PlaneGeometry(2, 2), this.material))
  }

  private readonly clear = new Color()
  private readonly clearAsBytes = new Color()
  private readonly srgb = { r: 0, g: 0, b: 0 }

  render(renderer: WebGLRenderer, width: number, height: number, drawA: () => void, drawB: () => void, amount: number): void {
    const [a, b] = this.ensure(width, height)

    /*
     * three clears a render target in linear space and the canvas in sRGB, so
     * the same clear colour lands as 11 on the canvas and 1 in a target — a
     * background that darkens for exactly as long as the crossfade lasts. The
     * material writes its colour without any conversion either way, so the
     * target is cleared with the canvas's bytes stored as if they were linear,
     * and the two paths produce the same pixels.
     */
    renderer.getClearColor(this.clear)
    const alpha = renderer.getClearAlpha()
    this.clear.getRGB(this.srgb, SRGBColorSpace)
    this.clearAsBytes.setRGB(this.srgb.r, this.srgb.g, this.srgb.b, LinearSRGBColorSpace)
    renderer.setClearColor(this.clearAsBytes, alpha)

    renderer.setRenderTarget(a)
    renderer.clear()
    drawA()
    renderer.setRenderTarget(b)
    renderer.clear()
    drawB()
    renderer.setRenderTarget(null)
    renderer.setClearColor(this.clear, alpha)
    this.material.uniforms.uA.value = a.texture
    this.material.uniforms.uB.value = b.texture
    this.material.uniforms.uMix.value = amount
    renderer.render(this.scene, this.camera)
  }

  private ensure(width: number, height: number): [WebGLRenderTarget, WebGLRenderTarget] {
    if (!this.targets || this.targets[0].width !== width || this.targets[0].height !== height) {
      this.targets?.forEach((target) => target.dispose())
      this.targets = [new WebGLRenderTarget(width, height), new WebGLRenderTarget(width, height)]
    }
    return this.targets
  }

  /**
   * Compile everything a crossfade draws before the first one happens.
   *
   * A material drawn into a render target is a different program from the same
   * material drawn to the canvas — three keys programs by output colour space —
   * so without this the first frame of the first crossfade compiles every
   * shader again, which is a visible stall at exactly the wrong moment.
   */
  async warm(renderer: WebGLRenderer, scene: Scene, camera: import("three").Camera): Promise<void> {
    const [a] = this.ensure(4, 4)
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(a)
    try {
      await renderer.compileAsync(scene, camera)
    } finally {
      renderer.setRenderTarget(previous)
    }
    await renderer.compileAsync(this.scene, this.camera)
    this.release()
  }

  /** Free the targets between transitions; they are canvas-sized. */
  release(): void {
    this.targets?.forEach((target) => target.dispose())
    this.targets = null
  }

  dispose(): void {
    this.release()
    this.material.dispose()
  }
}
