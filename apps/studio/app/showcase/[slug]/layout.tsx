import type { ReactNode } from "react"
import { DEMO_SLUGS } from "@/components/demos/slugs"

/** Server-side, so the static export knows which demo pages exist. */
export function generateStaticParams() {
  return DEMO_SLUGS.map((slug) => ({ slug }))
}

export default function DemoLayout({ children }: { children: ReactNode }) {
  return children
}
