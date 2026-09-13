import { PRESET_IDS } from "liquidforge/presets"
import type { ObjectSource } from "liquidforge/presets"
import { seeded } from "liquidforge/breed"

/**
 * Today's object.
 *
 * Everyone who opens the gallery on a given day gets the same object, and what
 * they make of it is the point: one silhouette, a hundred materials. A shared
 * prompt is what turns a gallery of unrelated posts into something people
 * compare, and it gives anyone who arrives with no idea a place to start.
 *
 * Picked from the date alone, so there is no job to run and nothing to store —
 * the server that validates a post and the browser that shows the prompt work
 * out the same answer independently. The day is the UTC day, so a post made in
 * Sydney and one made in San Francisco at the same moment agree on what "today"
 * was.
 */

const KHRONOS = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models"

const model = (name: string, title: string) => ({
  title,
  object: { type: "model", src: `${KHRONOS}/${name}/glTF-Binary/${name}.glb` } as ObjectSource,
})

/**
 * Chosen for silhouette. A liquid surface reflects an environment rather than
 * carrying detail, so each of these reads from its outline alone.
 */
const POOL: Array<{ title: string; object: ObjectSource }> = [
  model("Duck", "The duck"),
  model("DamagedHelmet", "The helmet"),
  model("Avocado", "The avocado"),
  model("BoomBox", "The boom box"),
  model("Lantern", "The lantern"),
  model("WaterBottle", "The bottle"),
  model("Fox", "The fox"),
  model("ToyCar", "The toy car"),
  model("SheenChair", "The chair"),
  model("ChronographWatch", "The watch"),
  model("AntiqueCamera", "The camera"),
  { title: "The knot", object: { type: "shape", shape: "torusknot", detail: 220 } },
  { title: "The ring", object: { type: "shape", shape: "torus", detail: 200 } },
  { title: "The capsule", object: { type: "shape", shape: "capsule", detail: 180 } },
  { title: "The gem", object: { type: "shape", shape: "icosahedron", detail: 160 } },
  { title: "MELT", object: { type: "text", value: "MELT", depth: 0.45, bevel: 0.03 } },
  { title: "DRIP", object: { type: "text", value: "DRIP", depth: 0.45, bevel: 0.03 } },
  { title: "FLUX", object: { type: "text", value: "FLUX", depth: 0.45, bevel: 0.03 } },
]

export interface DailyPick {
  /** `YYYY-MM-DD`, UTC. */
  key: string
  title: string
  object: ObjectSource
  /** A colourway to start from. Only the object is the prompt; the look is yours. */
  preset: string
}

export function dailyKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function isDailyKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

export function dailyPick(key: string = dailyKey()): DailyPick {
  let hash = 2166136261
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  const random = seeded(hash >>> 0)
  // Two draws, independent, so the same object does not always arrive in the
  // same colourway on the days it comes round again.
  const entry = POOL[Math.floor(random() * POOL.length)]
  const preset = PRESET_IDS[Math.floor(random() * PRESET_IDS.length)]
  return { key, title: entry.title, object: entry.object, preset }
}

/**
 * Whether a post really answers the prompt for `key`: the day has to be today
 * or yesterday (a post started late at night should not be refused at
 * midnight UTC), and the object has to be that day's object.
 */
export function answersDaily(key: string, object: ObjectSource, now: Date = new Date()): boolean {
  if (!isDailyKey(key)) return false
  const today = dailyKey(now)
  const yesterday = dailyKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  if (key !== today && key !== yesterday) return false
  const pick = dailyPick(key)
  if (pick.object.type !== object.type) return false
  switch (pick.object.type) {
    case "model":
      return object.type === "model" && object.src === pick.object.src
    case "shape":
      return object.type === "shape" && object.shape === pick.object.shape
    case "text":
      return object.type === "text" && object.value === pick.object.value
    default:
      return false
  }
}
