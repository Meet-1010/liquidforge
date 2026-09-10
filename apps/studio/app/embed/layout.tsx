import type { ReactNode } from "react"

/** No nav, no padding — an embed is a surface in someone else's page. */
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return children
}
