import type { DetailedHTMLProps, HTMLAttributes } from "react"

/** Google's <model-viewer>, loaded from jsDelivr on the AR experiment's page. */
declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        "ios-src"?: string
        alt?: string
        ar?: boolean | string
        "ar-modes"?: string
        "ar-scale"?: string
        autoplay?: boolean | string
        "auto-rotate"?: boolean | string
        "camera-controls"?: boolean | string
        "shadow-intensity"?: string
        exposure?: string
        "environment-image"?: string
      }
    }
  }
}
