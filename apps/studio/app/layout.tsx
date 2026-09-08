import type { Metadata } from "next"
import { Instrument_Serif, JetBrains_Mono } from "next/font/google"
import "./globals.css"

/**
 * A serif display face in a developer tool is deliberate.
 *
 * Mono-on-dark is the house style of every generated landing page; setting the
 * headlines in a printed serif and keeping mono strictly for functional text
 * gives the page an editorial register instead of a dashboard one.
 */
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "Liquidforge — liquid hero sections, one component",
  description:
    "Drop a liquid chrome, glass or molten hero into any React app with one component. Forge the object in your browser from text, an SVG, an image or a shape — 45 colourways across five material families.",
  keywords: ["liquid", "chrome", "webgl", "hero section", "react", "three.js", "shader", "glass"],
  openGraph: {
    title: "Liquidforge",
    description: "Liquid hero sections, one component. Forge the object in your browser.",
    type: "website",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
