"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { LiquidCanvas, resolvePreset } from "liquidforge"
import { configFromPreset, decodeState, type LiquidConfig } from "liquidforge/codegen"
import type { Quality } from "liquidforge"
import { ExportModal } from "@/components/export-modal"
import { MaterialPanel } from "@/components/material-panel"
import { ObjectPanel } from "@/components/object-panel"
import { SiteNav } from "@/components/site-nav"
import { Button, Collapsible, Panel, Segmented, Slider, Toggle } from "@/components/ui"

export default function StudioPage() {
  return (
    <Suspense fallback={null}>
      <Studio />
    </Suspense>
  )
}

function Studio() {
  const params = useSearchParams()
  const [config, setConfig] = useState<LiquidConfig>(() => configFromPreset())
  const [exporting, setExporting] = useState(false)

  // A shared link carries the whole editor state, so opening one has to land on
  // exactly the look it was made from rather than on the default.
  useEffect(() => {
    const encoded = params.get("c")
    if (!encoded) return
    const decoded = decodeState(encoded)
    if (decoded) setConfig(decoded)
  }, [params])

  const preset = resolvePreset(config.preset, {
    family: config.family,
    palette: config.palette,
    surface: config.surface,
    shading: config.shading,
    background: config.background,
  })

  return (
    <div className="flex h-screen flex-col">
      <SiteNav />

      <div className="flex min-h-0 flex-1 flex-col-reverse lg:flex-row">
        <aside className="w-full shrink-0 overflow-y-auto border-rule lg:w-[340px] lg:border-r">
          <ObjectPanel
            object={config.object}
            onChange={(object) => setConfig({ ...config, object })}
          />

          <MaterialPanel config={config} onChange={setConfig} />

          <Collapsible title="Scene" hint="motion, quality, layout">
            <Segmented
              label="Quality"
              value={config.quality}
              options={[
                { value: "auto" as Quality, label: "Auto" },
                { value: "high" as Quality, label: "High" },
                { value: "balanced" as Quality, label: "Mid" },
                { value: "low" as Quality, label: "Low" },
              ]}
              onChange={(quality) => setConfig({ ...config, quality })}
            />
            <p className="font-mono text-[10px] leading-relaxed text-bone/30">
              Auto measures frame times and walks the pixel ratio to suit the machine. The fixed
              tiers are for when you would rather know exactly what a visitor gets.
            </p>
            <Slider
              label="Auto-rotate"
              min={0}
              max={1.2}
              step={0.02}
              value={config.motion.autoRotate ?? 0}
              onChange={(autoRotate) =>
                setConfig({ ...config, motion: { ...config.motion, autoRotate } })
              }
            />
            <Toggle
              label="Drag to rotate"
              checked={config.motion.draggable ?? false}
              onChange={(draggable) =>
                setConfig({ ...config, motion: { ...config.motion, draggable } })
              }
            />
            <Toggle
              label="Transparent background"
              checked={config.transparent}
              onChange={(transparent) => setConfig({ ...config, transparent })}
            />
            <Segmented
              label="Layout"
              value={config.layout}
              options={[
                { value: "overlay" as const, label: "Overlay" },
                { value: "split" as const, label: "Split" },
              ]}
              onChange={(layout) => setConfig({ ...config, layout })}
            />
            <Toggle
              label="Blend the headline"
              checked={config.blend}
              onChange={(blend) => setConfig({ ...config, blend })}
            />
          </Collapsible>

          <Panel title="Export">
            <Button variant="primary" onClick={() => setExporting(true)}>
              Copy the component
            </Button>
          </Panel>
        </aside>

        <main className="relative min-h-[320px] flex-1">
          <LiquidCanvas
            object={config.object}
            preset={preset}
            quality={config.quality}
            motion={config.motion}
            transparent={config.transparent}
            style={{ height: "100%", minHeight: 0 }}
          />
        </main>
      </div>

      {exporting && <ExportModal config={config} onClose={() => setExporting(false)} />}
    </div>
  )
}
