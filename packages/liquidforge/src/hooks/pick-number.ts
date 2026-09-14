/** Read a number out of a parsed JSON response by dot path. */
export function pickNumber(json: unknown, path?: string): number | undefined {
  let node: unknown = json
  for (const key of path ? path.split(".") : []) {
    if (node === null || typeof node !== "object") return undefined
    node = (node as Record<string, unknown>)[key]
  }
  const value = typeof node === "string" ? Number(node) : node
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

