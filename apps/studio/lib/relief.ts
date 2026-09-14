import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial } from "three"

/**
 * A photograph's depth map, as a solid relief.
 *
 * The depth model says how near each pixel is. The near part — a face and
 * shoulders in front of a room — is found by splitting the depth histogram
 * where it separates best (Otsu's method), and becomes a sculpted front surface
 * on a flat back, joined by walls around its outline, so the liquid has a
 * closed object to run over rather than a sheet with a hole behind it. It is
 * handed to the library as a GLB, the same way any downloaded model is.
 */

export interface DepthMap {
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
}

function otsu(values: ArrayLike<number>): number {
  const histogram = new Array(256).fill(0)
  for (let i = 0; i < values.length; i++) histogram[values[i]]++
  const total = values.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * histogram[i]
  let background = 0
  let backgroundSum = 0
  let best = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    background += histogram[t]
    if (background === 0) continue
    const foreground = total - background
    if (foreground === 0) break
    backgroundSum += t * histogram[t]
    const between = background * foreground * (backgroundSum / background - (sum - backgroundSum) / foreground) ** 2
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

export function reliefGeometry(depth: DepthMap, options: { columns?: number; relief?: number; thickness?: number } = {}): BufferGeometry {
  const { columns = 140, relief = 0.42, thickness = 0.06 } = options
  const rows = Math.round((columns * depth.height) / depth.width)
  const aspect = depth.width / depth.height

  // Sample onto the grid with a small box blur, so sensor noise doesn't become bumps.
  const grid = new Float32Array(columns * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      let total = 0
      let count = 0
      const cx = Math.floor(((c + 0.5) / columns) * depth.width)
      const cy = Math.floor(((r + 0.5) / rows) * depth.height)
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const x = Math.min(depth.width - 1, Math.max(0, cx + dx * 2))
          const y = Math.min(depth.height - 1, Math.max(0, cy + dy * 2))
          total += depth.data[y * depth.width + x]
          count++
        }
      }
      grid[r * columns + c] = total / count
    }
  }

  const threshold = otsu(Uint8Array.from(grid, (value) => Math.round(value)))
  const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < columns && r < rows && grid[r * columns + c] > threshold
  const frontIndex = (c: number, r: number) => r * columns + c
  const count = columns * rows

  const positions = new Float32Array(count * 2 * 3)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const i = frontIndex(c, r)
      const near = Math.max(0, (grid[i] - threshold) / Math.max(1, 255 - threshold))
      const x = (c / (columns - 1) - 0.5) * aspect
      const y = 0.5 - r / (rows - 1)
      positions.set([x, y, thickness / 2 + Math.pow(near, 0.8) * relief], i * 3)
      positions.set([x, y, -thickness / 2], (i + count) * 3)
    }
  }

  const indices: number[] = []
  const edges = new Map<string, [number, number]>()
  const addEdge = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    if (edges.has(key)) edges.delete(key)
    else edges.set(key, [a, b])
  }
  const triangle = (a: number, b: number, c: number) => {
    indices.push(a, b, c, c + count, b + count, a + count)
    addEdge(a, b)
    addEdge(b, c)
    addEdge(c, a)
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < columns - 1; c++) {
      const a = frontIndex(c, r)
      const b = frontIndex(c + 1, r)
      const d = frontIndex(c, r + 1)
      const e = frontIndex(c + 1, r + 1)
      if (inside(c, r) && inside(c + 1, r) && inside(c, r + 1)) triangle(a, d, b)
      if (inside(c + 1, r) && inside(c + 1, r + 1) && inside(c, r + 1)) triangle(b, d, e)
    }
  }
  // An edge used by one triangle only is on the outline: wall it to the back.
  for (const [a, b] of edges.values()) indices.push(a, b + count, b, a, a + count, b + count)

  if (indices.length === 0) throw new Error("Nothing stood out from the background. Try with more space behind you.")

  // Drop the vertices no triangle uses, so the model is only as heavy as the relief.
  const used = new Int32Array(count * 2).fill(-1)
  const compact: number[] = []
  const remapped = indices.map((index) => {
    if (used[index] < 0) {
      used[index] = compact.length / 3
      compact.push(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2])
    }
    return used[index]
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(compact), 3))
  geometry.setIndex(remapped)
  geometry.computeVertexNormals()
  return geometry
}

/** The relief as a GLB file, behind a URL the model loader can fetch. */
export async function reliefModelUrl(geometry: BufferGeometry): Promise<string> {
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js")
  const mesh = new Mesh(geometry, new MeshStandardMaterial())
  const buffer = (await new GLTFExporter().parseAsync(mesh, { binary: true })) as ArrayBuffer
  return URL.createObjectURL(new Blob([buffer], { type: "model/gltf-binary" }))
}
