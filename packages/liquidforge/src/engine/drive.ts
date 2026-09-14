import { blendPresets } from "../breed"
import { forgeGeometry } from "../forge"
import type { CheckpointState } from "../placement/path"
import { resolvePreset } from "../presets"
import type { LiquidPreset, ObjectSource } from "../types"
import { PRIMARY_FORM, type LiquidEngine, type Look } from "./liquid-engine"

/**
 * Driving an engine through a sequence of objects and looks.
 *
 * A scroll path, a timeline and a duet are the same thing measured against a
 * different clock: points that set an object or a colourway, and a position
 * between them. `checkpointAt` turns the position into a state; these turn the
 * state into what the engine shows — every object prepared up front as a form,
 * and each moment written as a morph between two of them.
 */

/** The form an object is registered under: the primary one if it is the engine's own object. */
export function formKeyFor(object: ObjectSource | undefined, base: ObjectSource | undefined): string {
  const key = JSON.stringify(object ?? null)
  return key === JSON.stringify(base ?? null) ? PRIMARY_FORM : `checkpoint:${key}`
}

/**
 * Forge and register every object in a sequence, then compile every material
 * and morph target it will need.
 *
 * `sequence` is in order: each entry is what the object is from that moment,
 * so consecutive entries are the pairs that will morph into each other.
 */
export async function prepareSequence(
  engine: LiquidEngine,
  base: { object?: ObjectSource; preset?: string },
  sequence: Array<{ object?: ObjectSource; preset?: string }>,
  options: {
    isCancelled?: () => boolean
    /** Drop shapes registered for earlier versions of the sequence that it no longer uses. */
    prune?: boolean
    /** Looks that are not named colourways — tuned or bred — by the id the sequence uses for them. */
    presets?: Record<string, LiquidPreset>
  } = {},
): Promise<void> {
  const lookFor = (id: string | undefined) => (id && options.presets?.[id]) || resolvePreset(id)
  const presets = [base.preset, ...sequence.map((step) => step.preset)].filter(Boolean) as string[]
  const keepsSurface = presets.some((id) => lookFor(id).family === "original")
  const dense = presets.some((id) => lookFor(id).family === "ferrofluid")

  const objects = new Map<string, ObjectSource>()
  for (const step of sequence) {
    if (step.object && formKeyFor(step.object, base.object) !== PRIMARY_FORM) objects.set(formKeyFor(step.object, base.object), step.object)
  }

  if (options.prune) {
    for (const key of engine.formKeys) if (key !== PRIMARY_FORM && !objects.has(key)) engine.releaseForm(key)
  }

  // A shape already registered at the right density is not forged again, so a
  // caller can re-run this on every edit — a moment dragged along a timeline —
  // and only pay for what changed.
  await Promise.all(
    [...objects.entries()].filter(([key]) => !engine.hasForm(key, { dense })).map(([key, object]) =>
      forgeGeometry(object, undefined, {
        appearance: keepsSurface && (object.type === "model" || object.type === "image" || object.type === "svg"),
      })
        .then((geometry) => {
          if (options.isCancelled?.()) return geometry.dispose()
          engine.registerForm(key, geometry, {
            forceSphereProbe: object.type === "shape" && (object.shape === "sphere" || object.shape === "icosahedron"),
            dense,
          })
          geometry.dispose()
        })
        .catch(() => {
          // A step whose object cannot be forged shows the previous object instead.
        }),
    ),
  )
  if (options.isCancelled?.()) return

  const looks: Look[] = []
  const pairs: Array<[string, string]> = []
  let previous = PRIMARY_FORM
  let previousPreset = base.preset
  for (const step of sequence) {
    if (!step.object && !step.preset) continue
    const form = step.object ? formKeyFor(step.object, base.object) : previous
    const preset = step.preset ?? previousPreset
    looks.push({ form, preset: lookFor(preset) }, { form: previous, preset: lookFor(preset) }, { form, preset: lookFor(previousPreset) })
    if (form !== previous) pairs.push([previous, form])
    previous = form
    previousPreset = preset
  }
  await engine.warm(looks, pairs)
}

/**
 * Show a checkpoint state: a single look, or a morph partway between two.
 * Returns a key that changes only when what is shown changes, so a caller
 * running every frame can skip identical writes.
 */
export function applyCheckpointState(
  engine: LiquidEngine,
  state: Pick<CheckpointState, "from" | "to" | "t" | "mutation">,
  base: { object?: ObjectSource },
  options: { reducedMotion?: boolean; lastKey?: string; presets?: Record<string, LiquidPreset> } = {},
): string {
  const lookFor = (id: string | undefined) => (id && options.presets?.[id]) || resolvePreset(id)
  const fromForm = formKeyFor(state.from.object, base.object)
  const toForm = state.to ? formKeyFor(state.to.object, base.object) : ""
  const [lastLook = "", lastMutation = "-1"] = (options.lastKey ?? "").split("\u0000")
  const look = `${fromForm}|${state.from.preset}|${toForm}|${state.to?.preset}|${state.t.toFixed(4)}`
  const mutation = options.reducedMotion ? 0 : state.mutation
  let mutationKey = lastMutation
  if (Math.abs(mutation - Number(lastMutation)) > 0.002) {
    mutationKey = mutation.toFixed(4)
    engine.setMutation(mutation)
  }
  const key = `${look}\u0000${mutationKey}`
  if (look === lastLook) return key

  const fromPreset = lookFor(state.from.preset)
  if (!state.to) {
    engine.setLook({ form: fromForm, preset: fromPreset })
    return key
  }
  const toPreset = lookFor(state.to.preset)
  // One set of bred numbers for both sides; each keeps its own family, so the
  // shader never has to change mid-transition, and its own ground, which the
  // engine mixes rather than switching at the halfway point.
  const bred: LiquidPreset = state.from.preset !== state.to.preset ? blendPresets(fromPreset, toPreset, state.t) : toPreset
  engine.setLook(
    { form: fromForm, preset: { ...bred, family: fromPreset.family, background: fromPreset.background } },
    { form: toForm, preset: { ...bred, family: toPreset.family, background: toPreset.background } },
    state.t,
  )
  return key
}
