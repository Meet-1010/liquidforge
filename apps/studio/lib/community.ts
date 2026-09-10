import { encodeState, isEphemeral, type LiquidConfig } from "liquidforge/codegen"

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
 * One click to submit, which is not the same as one click to publish.
 *
 * There is no backend here and adding one to accept arbitrary posts would mean
 * hosting, moderation and spam, none of which this project has any business
 * carrying yet. What it can do is remove every step between "I made a thing"
 * and "it is in front of the maintainer": this builds a GitHub issue with the
 * entry already filled in and a link that reopens the exact look, so submitting
 * is pressing the button GitHub puts on its own form.
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
