import type { MetadataRoute } from "next"

/**
 * Enough of a manifest that "Add to Home Screen" gets the chrome drop rather
 * than a screenshot of the page, and Android can mask the icon to its own shape.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Liquidforge Studio",
    short_name: "Liquidforge",
    description: "Forge an object in the browser, tune the liquid material live, and copy the component.",
    start_url: "/studio",
    display: "standalone",
    background_color: "#0b0b0f",
    theme_color: "#0b0b0f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
