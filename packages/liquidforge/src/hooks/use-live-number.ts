import { useEffect, useState } from "react"
import { pickNumber } from "./pick-number"

export interface LiveNumberOptions {
  /**
   * Where the number is in the JSON: a dot path such as `"stargazers_count"` or
   * `"data.totals.signups"`. Omit when the response is the number itself.
   */
  path?: string
  /** Milliseconds between polls. @default 30000, and never faster than 5000 */
  every?: number
}

/**
 * A number from a JSON endpoint, kept fresh.
 *
 * The companion to the `data` prop: point it at anything that answers with
 * JSON — a repository's API, your own `/api/stats` — and it polls while the tab
 * is visible, pausing when it is not so a background tab costs nothing.
 *
 * ```tsx
 * const stars = useLiveNumber("https://api.github.com/repos/vercel/next.js", { path: "stargazers_count" })
 * <LiquidHero data={stars === undefined ? undefined : { value: stars, max: 150_000, milestones: [140_000] }} />
 * ```
 */
export function useLiveNumber(url: string | null | undefined, options: LiveNumberOptions = {}): number | undefined {
  const { path, every = 30_000 } = options
  const [value, setValue] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!url || typeof window === "undefined") return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const interval = Math.max(5_000, every)

    const poll = async () => {
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch(url, { headers: { accept: "application/json" } })
          if (response.ok) {
            const next = pickNumber(await response.json(), path)
            if (!cancelled && next !== undefined) setValue(next)
          }
        } catch {
          // A failed poll keeps the last value; the next one may succeed.
        }
      }
      if (!cancelled) timer = setTimeout(poll, interval)
    }
    const onVisible = () => {
      if (document.visibilityState === "visible" && timer) {
        clearTimeout(timer)
        void poll()
      }
    }
    void poll()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [url, path, every])

  return value
}
