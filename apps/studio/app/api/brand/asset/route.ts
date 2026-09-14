import { sanitizeSvg } from "@/lib/brand"
import { fetchBytes } from "@/lib/safe-fetch"

/**
 * A logo image from another site, served from this one.
 *
 * The object forge traces a silhouette by reading an image's pixels, which a
 * browser only allows for images the page's own origin serves (or that send
 * CORS headers, which logos rarely do). Only images, only public addresses,
 * at most 2 MB, and an SVG is stripped of anything executable and served with
 * a policy that would stop a script even if one survived.
 */

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const TYPES = /^image\/(png|jpeg|webp|gif|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)\b/i

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url") ?? ""
  try {
    const { bytes, type, truncated } = await fetchBytes(raw, 2_000_000, "image/*")
    if (truncated) return new Response("That image is too large", { status: 413 })
    const svg = /svg/i.test(type) || /^\s*(<\?xml[^>]*>\s*)?<svg\b/i.test(bytes.subarray(0, 400).toString())
    if (!svg && !TYPES.test(type)) return new Response("That address isn't an image", { status: 415 })
    const body = svg ? Buffer.from(sanitizeSvg(bytes.toString())) : bytes
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": svg ? "image/svg+xml" : type,
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "x-content-type-options": "nosniff",
        "cache-control": "public, max-age=86400",
      },
    })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Could not fetch that image", { status: 422 })
  }
}
