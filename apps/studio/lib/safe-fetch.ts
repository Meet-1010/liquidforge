import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

/**
 * Fetching a URL a stranger typed, from this server.
 *
 * Every address is checked before a byte is requested, including the address
 * each redirect points at: only public http and https hosts, never this
 * machine or anything on a private network, with hard limits on time and size.
 * Shared by every route that reads someone else's website.
 */

export const PAGE_LIMIT = 1_500_000
export const SHEET_LIMIT = 800_000
const TIMEOUT_MS = 8000

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

/** Fetch with redirects followed by hand, so every hop is checked, and the body capped. */
export async function fetchBytes(start: string, limit: number, accept = "*/*"): Promise<{ bytes: Buffer; type: string; url: string; truncated: boolean }> {
  let url = new URL(start)
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url)
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "Mozilla/5.0 (compatible; liquidforge/1.0; +https://liquidforge-pi.vercel.app)", accept },
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new Error("A redirect with nowhere to go")
      url = new URL(location, url)
      continue
    }
    if (!response.ok || !response.body) throw new Error(`The site answered ${response.status}`)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    let truncated = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.length
      if (size >= limit) {
        truncated = true
        break
      }
    }
    await reader.cancel().catch(() => {})
    return { bytes: Buffer.concat(chunks).subarray(0, limit), type: response.headers.get("content-type") ?? "", url: url.toString(), truncated }
  }
  throw new Error("Too many redirects")
}

export async function fetchText(start: string, limit: number, accept = "text/html,text/css,*/*"): Promise<{ text: string; url: string }> {
  const { bytes, url } = await fetchBytes(start, limit, accept)
  return { text: new TextDecoder().decode(bytes), url }
}
