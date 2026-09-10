"use client"

import { Suspense, use, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { LiquidCanvas, resolvePreset } from "liquidforge"
import { decodeState, type LiquidConfig } from "liquidforge/codegen"
import type { Post } from "@/lib/store/types"

/**
 * One surface, nothing else.
 *
 * The widest door in the product: an iframe works in Notion, Figma, Webflow, a
 * blog, a README preview — everywhere that will never have a React app to put
 * the component into, which is most places anyone will ever see this.
 *
 * `/embed/<post id>` renders a post; `/embed/x?c=<state>` renders a config
 * directly, so a link from the Studio embeds without posting anything first.
 */
export default function EmbedPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={null}>
      <Embed id={use(params).id} />
    </Suspense>
  )
}

function Embed({ id }: { id: string }) {
  const search = useSearchParams()
  const [config, setConfig] = useState<LiquidConfig | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    const encoded = search.get("c")
    if (encoded) {
      const decoded = decodeState(encoded)
      if (decoded) {
        setConfig(decoded)
        return
      }
    }
    if (!id || id === "x") {
      setMissing(true)
      return
    }
    fetch(`/api/community?limit=200`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { posts?: Post[] } | null) => {
        const post = data?.posts?.find((entry) => entry.id === id)
        if (!post) {
          setMissing(true)
          return
        }
        setConfig({
          object: post.object,
          preset: post.preset,
        } as LiquidConfig)
      })
      .catch(() => setMissing(true))
  }, [id, search])

  if (missing) {
    return (
      <div className="grid h-screen place-items-center bg-ink font-mono text-[11px] text-bone/40">
        Nothing to show here.
      </div>
    )
  }
  if (!config) return <div className="h-screen bg-ink" />

  const preset = resolvePreset(config.preset, {
    family: config.family,
    palette: config.palette,
    surface: config.surface,
    shading: config.shading,
    background: config.background,
  })

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <LiquidCanvas
        object={config.object}
        preset={preset}
        transparent={search.get("transparent") === "1"}
        quality={(search.get("quality") as never) ?? "auto"}
        style={{ height: "100%", minHeight: 0 }}
      />
    </div>
  )
}
