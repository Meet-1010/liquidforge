"use client"

import { notFound } from "next/navigation"
import { use, useState } from "react"
import { PRESETS } from "liquidforge"
import { demoBySlug } from "@/components/demos/catalog"
import { DemoBar } from "@/components/demos/chrome"
import { AuroraLabs, Form01, Meridian, Ridge, Vessel } from "@/components/demos/sites"

/**
 * One demo site, running for real.
 *
 * Full pages rather than thumbnails, because the question these answer — does
 * this look like it belongs on a website — cannot be answered by a crop. The
 * bar at the top is the only thing that is not part of the pretend site.
 */
export default function DemoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const demo = demoBySlug(slug)
  const [swatch, setSwatch] = useState("obsidian-2")

  if (!demo) notFound()

  const site = (() => {
    switch (demo.slug) {
      case "aurora-labs":
        return <AuroraLabs demo={demo} />
      case "vessel":
        return <Vessel demo={demo} />
      case "form-01":
        return (
          <Form01
            demo={{ ...demo, preset: PRESETS[swatch] ?? demo.preset }}
            swatch={swatch}
            onSwatch={setSwatch}
          />
        )
      case "meridian":
        return <Meridian demo={demo} />
      default:
        return <Ridge demo={demo} />
    }
  })()

  return (
    <>
      <DemoBar title={`${demo.name} — ${demo.kind}`} uses={demo.uses} />
      {site}
    </>
  )
}
