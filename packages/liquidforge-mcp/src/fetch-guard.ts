/**
 * Fetching a URL somebody else typed, safely.
 *
 * On the user's own machine the palette tool may fetch anything the user can —
 * a site on their intranet included, which is a reasonable thing to ask about.
 * Hosted, the same request would come from our server, so every address, and
 * every address a redirect points at, has to be a public one.
 */

import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

function isPrivate(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number)
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
    )
  }
  const v6 = address.toLowerCase()
  if (v6.startsWith("::ffff:")) return isPrivate(v6.slice(7))
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80")
}

export async function assertPublic(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http and https addresses")
  if (url.username || url.password) throw new Error("Addresses with credentials are not fetched")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("That address is not on the public internet")
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivate(address))) {
    throw new Error("That address is not on the public internet")
  }
}

export interface FetchOptions {
  /** Refuse private and loopback addresses, checking every redirect. */
  publicOnly?: boolean
  limit: number
  timeoutMs?: number
}

export async function fetchText(start: string, options: FetchOptions): Promise<{ text: string; url: string }> {
  let url = new URL(start)
  for (let hop = 0; hop < 5; hop++) {
    if (options.publicOnly) await assertPublic(url)
    const response = await fetch(url, {
      redirect: options.publicOnly ? "manual" : "follow",
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; liquidforge-mcp)", accept: "text/html,text/css,*/*" },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new Error("A redirect with nowhere to go")
      url = new URL(location, url)
      continue
    }
    if (!response.ok || !response.body) throw new Error(`${url.host} answered ${response.status}`)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (size < options.limit) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
    }
    await reader.cancel().catch(() => {})
    return { text: new TextDecoder().decode(Buffer.concat(chunks).subarray(0, options.limit)), url: response.url || url.toString() }
  }
  throw new Error("Too many redirects")
}
