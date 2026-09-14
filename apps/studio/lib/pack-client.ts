import { configFromPreset, generateCode, generateEmbed } from "liquidforge/codegen"
import { resolvePreset, type LiquidPreset, type ObjectSource } from "liquidforge"
import type { Look } from "@/lib/store/types"

/** A pack look as the page receives it. */
export interface PackLook {
  slug: string
  title: string
  preset: string
  look: Look
  uses: number
}

export const keyStorage = (handle: string) => `liquidforge:pack:${handle}`

export function readKey(handle: string): string | null {
  try {
    return localStorage.getItem(keyStorage(handle))
  } catch {
    return null
  }
}

export function saveKey(handle: string, key: string) {
  try {
    localStorage.setItem(keyStorage(handle), key)
  } catch {
    // Private windows can refuse; the key was shown to copy anyway.
  }
}

export function presetForLook(entry: Pick<PackLook, "preset" | "look">): LiquidPreset {
  return resolvePreset(entry.preset, entry.look)
}

/**
 * The code for a look, with the look written into it.
 *
 * Inlined rather than fetched by name, so a site using a pack look never
 * depends on this server being up — the credit is recorded when the code is
 * taken instead.
 */
export function codeFor(entry: PackLook, object: ObjectSource, target: "react" | "html"): string {
  const look = presetForLook(entry)
  const config = { ...configFromPreset(entry.preset), object, family: look.family, palette: look.palette, surface: look.surface, shading: look.shading, background: look.background }
  const credit = `Look: "${entry.title}"`
  return target === "react" ? `// ${credit}\n${generateCode(config)}` : `<!-- ${credit} -->\n${generateEmbed(config)}`
}
