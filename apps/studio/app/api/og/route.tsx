import { ImageResponse } from "next/og"
import { PRESETS, presetName } from "liquidforge/presets"
import { getStore } from "@/lib/store"

/**
 * The picture a link shows when someone pastes it.
 *
 * Every share of this project used to unfurl blank — no image, no colour,
 * nothing — which for a thing whose entire argument is how it looks was the
 * single most expensive omission in the product.
 *
 * This draws the colourway rather than the object: satori renders HTML, not
 * WebGL, so there is no way to put the real surface in here without a headless
 * GPU. What it can do is show the actual palette at actual size, which is the
 * part that differs between one post and the next — and it costs nothing to
 * store, so a colourway edited later has a correct preview immediately.
 */

/*
 * Node, not edge.
 *
 * This reads a post to draw it, and the store reaches for `node:fs` when there
 * is no database configured — neither that nor `node:crypto` exists on the edge
 * runtime, and declaring it there took the whole dev server down with a
 * resolution failure rather than a clear error.
 */
export const runtime = "nodejs"

const size = { width: 1200, height: 630 }

export async function GET(request: Request) {
  const url = new URL(request.url)
  const id = url.searchParams.get("id")
  const presetId = url.searchParams.get("preset") ?? "mercury-1"

  let title = url.searchParams.get("title") ?? "liquidforge"
  let author = url.searchParams.get("author") ?? ""
  let preset = PRESETS[presetId] ?? PRESETS["mercury-1"]

  if (id) {
    try {
      const post = await (await getStore()).get(id)
      if (post) {
        title = post.title
        author = post.author
        preset = PRESETS[post.preset] ?? preset
      }
    } catch {
      // A missing row is not a reason to serve no picture.
    }
  }

  const light = preset.background === "light"
  const ground = light ? "#f2f0ec" : preset.background === "mid" ? "#272b35" : "#050506"
  const ink = light ? "#111111" : "#ffffff"
  const palette = preset.palette.slice(0, 6)

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: ground,
          color: ink,
          fontFamily: "monospace",
          padding: 64,
          justifyContent: "space-between",
        }}
      >
        {/* The palette, at a size where you can actually read the colours —
            which is the one thing that differs post to post. */}
        <div style={{ display: "flex", height: 268, borderRadius: 24, overflow: "hidden" }}>
          {palette.map((colour, index) => (
            <div
              key={index}
              style={{
                flex: index === 0 ? 2 : 1,
                background: colour,
                display: "flex",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
          <div style={{ fontSize: 62, letterSpacing: "-0.02em", display: "flex" }}>{title}</div>
          <div style={{ display: "flex", gap: 20, fontSize: 24, opacity: 0.55 }}>
            {author && <span>{author}</span>}
            <span>
              {preset.label} · {presetName(preset.id) ?? ""}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, opacity: 0.4, marginTop: 12 }}>
          <span>liquidforge</span>
          <span>{preset.family}</span>
        </div>
      </div>
    ),
    size,
  )
}
