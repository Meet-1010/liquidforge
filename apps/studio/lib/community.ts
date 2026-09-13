import { PRESETS, resolvePreset, type LiquidPreset, type ObjectSource } from "liquidforge"
import {
  configFromPreset as configFromPresetLike,
  encodeState,
  isEphemeral,
  type LiquidConfig,
} from "liquidforge/codegen"
import type { Look } from "@/lib/store/types"

const REPO = "https://github.com/Meet-1010/liquidforge"

export interface Submission {
  title: string
  author: string
  url: string
}

/** The exact shape `data/community.json` holds, ready to paste or merge. */
export function communityEntry(config: LiquidConfig, submission: Submission) {
  const id =
    submission.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "untitled"

  return {
    id,
    title: submission.title.trim() || "Untitled",
    author: submission.author.trim() || "Anonymous",
    url: submission.url.trim() || REPO,
    object: config.object,
    preset: config.preset,
  }
}

/**
 * Post it, for real.
 *
 * This goes to the gallery's own API, which validates it, rate-limits it and
 * stores it as pending. It is live in the sense that matters — no fork, no pull
 * request, no waiting on a maintainer to copy JSON — and not live in the sense
 * that it appears the instant you press it, because a gallery that publishes
 * unreviewed strangers' text is a gallery that will eventually host something
 * you have to apologise for.
 */
export async function postToCommunity(
  config: LiquidConfig,
  submission: Submission,
  parents: { parentId?: string; secondParentId?: string } = {},
): Promise<{ ok: boolean; message: string; id?: string }> {
  const entry = communityEntry(config, submission)
  const look = lookOf(config)
  try {
    const response = await fetch("/api/community", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: entry.title,
        author: entry.author,
        url: entry.url,
        object: entry.object,
        preset: entry.preset,
        ...(look ? { look } : {}),
        parentId: parents.parentId,
        secondParentId: parents.secondParentId,
      }),
    })
    const data = (await response.json().catch(() => ({}))) as {
      message?: string
      error?: string
      id?: string
    }
    if (!response.ok) return { ok: false, message: data.error ?? `Rejected (${response.status})` }
    return { ok: true, message: data.message ?? "Posted.", id: data.id }
  } catch {
    return { ok: false, message: "Could not reach the gallery. Is the site running?" }
  }
}

/**
 * The fallback, for anyone who would rather open a pull request — or for a
 * deployment with no database behind it.
 */
export function submitUrl(config: LiquidConfig, submission: Submission, origin: string): string {
  const entry = communityEntry(config, submission)
  const share = `${origin}/studio?c=${encodeState(config)}`

  const body = [
    `**${entry.title}** by ${entry.author}`,
    "",
    `[Open it in the Studio](${share})`,
    "",
    "Add this to `apps/studio/data/community.json`:",
    "",
    "```json",
    `${JSON.stringify(entry, null, 2)},`,
    "```",
    "",
    "---",
    "",
    "_Submitted from the Studio's export._",
  ].join("\n")

  const params = new URLSearchParams({
    title: `Community: ${entry.title}`,
    body,
    labels: "community",
  })
  return `${REPO}/issues/new?${params.toString()}`
}

/** An object built from an uploaded file cannot travel in a link or a JSON entry. */
export function canSubmit(config: LiquidConfig): boolean {
  return !isEphemeral(config.object)
}

/**
 * The look a config has, when it is not simply its named colourway.
 *
 * `undefined` for an untouched preset, so the common post stays as small as it
 * always was and a colourway that is later retuned in the library still updates
 * every post that used it unchanged.
 */
export function lookOf(config: LiquidConfig): Look | undefined {
  const base = PRESETS[config.preset]
  const look: Look = {
    family: config.family,
    palette: config.palette,
    surface: config.surface,
    shading: config.shading,
    background: config.background,
  }
  if (
    base &&
    base.family === look.family &&
    base.background === look.background &&
    JSON.stringify(base.palette) === JSON.stringify(look.palette) &&
    JSON.stringify(base.surface) === JSON.stringify(look.surface) &&
    JSON.stringify(base.shading) === JSON.stringify(look.shading)
  ) {
    return undefined
  }
  return look
}

/** What a post, seeded or published, renders as: its colourway, with its own look on top. */
export function presetForPost(post: { preset: string; look?: Look }): LiquidPreset {
  return resolvePreset(post.preset, post.look ?? {})
}

/**
 * A Studio link that opens with exactly this look on this object, carrying its
 * parents through so a post made from it credits them.
 */
export function studioLinkFor(
  preset: LiquidPreset,
  object: ObjectSource,
  basePresetId: string,
  parents: { from?: string; with?: string } = {},
): string {
  const params = new URLSearchParams()
  const config: LiquidConfig = {
    ...configFromPresetLike(basePresetId, object),
    family: preset.family,
    palette: [...preset.palette],
    surface: { ...preset.surface },
    shading: { ...preset.shading },
    background: preset.background,
  }
  params.set("c", encodeState(config))
  if (parents.from) params.set("from", parents.from)
  if (parents.with) params.set("with", parents.with)
  return `/studio?${params.toString()}`
}
