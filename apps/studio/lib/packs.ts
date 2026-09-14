import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import { neon } from "@neondatabase/serverless"

/**
 * Creator packs on the server: handles, edit keys, and the database.
 *
 * There are no accounts. Claiming a handle returns a long random key once;
 * only its SHA-256 is stored, and every change to the pack has to present the
 * key. A key that high in entropy needs no salt — nobody is guessing it from a
 * dictionary — and comparing hashes in constant time keeps it from leaking a
 * byte at a time.
 */

export const HANDLE = /^[a-z0-9_]{3,24}$/
export const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/
export const MAX_LOOKS = 24

const RESERVED = new Set(["admin", "api", "beta", "liquidforge", "studio", "support", "official", "staff", "moderator", "help", "null", "undefined"])

export function normaliseHandle(raw: string): string {
  return decodeURIComponent(raw).trim().replace(/^@/, "").toLowerCase()
}

export function isReserved(handle: string): boolean {
  return RESERVED.has(handle)
}

export function slugFor(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "look"
}

export function newKey(): { key: string; hash: string } {
  const key = `lfk_${randomBytes(24).toString("base64url")}`
  return { key, hash: hashOf(key) }
}

function hashOf(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

export function keyMatches(presented: string | null, storedHash: string): boolean {
  if (!presented) return false
  const a = Buffer.from(hashOf(presented), "hex")
  const b = Buffer.from(storedHash, "hex")
  return a.length === b.length && timingSafeEqual(a, b)
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? ""
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null
}

export function database() {
  const url = process.env.DATABASE_URL
  return url ? neon(url) : null
}
