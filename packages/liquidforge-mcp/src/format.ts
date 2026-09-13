/**
 * Response shaping shared by every tool.
 *
 * Each tool returns the same envelope: a text block in the requested format
 * plus `structuredContent`, so a client that understands structured output can
 * read fields directly instead of parsing prose back out of markdown.
 */

import { z } from "zod"
import { CHARACTER_LIMIT } from "./constants.js"

export const ResponseFormat = z
  .enum(["markdown", "json"])
  .default("markdown")
  .describe("Output format: 'markdown' for human-readable, 'json' for machine-readable")

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/** The standard success envelope, truncated if the text runs long. */
export function reply(
  markdown: string,
  structured: Record<string, unknown>,
  format: "markdown" | "json",
): ToolResult {
  return {
    content: [{ type: "text", text: format === "json" ? jsonText(structured) : truncate(markdown) }],
    structuredContent: structured,
  }
}

/**
 * JSON that is still JSON when it is too long.
 *
 * Truncating the string and appending a note — what `truncate` does for
 * markdown — turns JSON into something no parser will read, and an agent that
 * asked for JSON has no way to recover from that. It surfaced the day the
 * catalogue grew past the limit: every client asking for the colourways as
 * JSON started getting a syntax error. So: indented if it fits, compact if
 * that fits, and otherwise a small valid object that says what happened.
 */
function jsonText(structured: Record<string, unknown>): string {
  const pretty = JSON.stringify(structured, null, 2)
  if (pretty.length <= CHARACTER_LIMIT) return pretty
  const compact = JSON.stringify(structured)
  if (compact.length <= CHARACTER_LIMIT) return compact
  return JSON.stringify({
    truncated: true,
    characters: compact.length,
    limit: CHARACTER_LIMIT,
    message:
      "This response is too large to send as text. Ask for one collection or one topic at a time. The full result is also in structuredContent.",
  })
}

export function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true }
}

export function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text
  const keep = text.slice(0, CHARACTER_LIMIT - 220)
  return `${keep}\n\n---\n\n_Response truncated at ${CHARACTER_LIMIT} characters. Ask for one collection, or one topic, at a time._`
}

/** `- **key** — value` lines. */
export function definitionList(entries: Array<[string, string]>): string {
  return entries.map(([key, value]) => `- **${key}** — ${value}`).join("\n")
}

export function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`
  const rule = `| ${headers.map(() => "---").join(" | ")} |`
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n")
  return [head, rule, body].join("\n")
}
