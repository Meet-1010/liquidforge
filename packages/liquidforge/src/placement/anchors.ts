import type { PlacementPath } from "./types"

export interface ResolvedAnchors {
  /** The scroll progress each point is pinned to, where an anchor resolved. */
  pinned: Array<number | undefined>
  /** The horizontal position each `followX` point takes from its element. */
  xs: Array<number | undefined>
  /** Whether any point on the path has an anchor at all. */
  any: boolean
}

/**
 * Work out, from the page as it is laid out right now, when each anchored
 * point should be reached.
 *
 * A point at screen height `y` pinned to an element is reached at the scroll
 * position where that element's anchor line is also at `y`. With the page
 * scrolled by `s`, an element whose top is at document height `D` sits at
 * `D - s` on screen, so the moment is `s = D + ay·h - y·vh`, as a fraction of
 * the scrollable range. That is the whole calculation, and it is why a
 * checkpoint survives a copy edit: change the copy, `D` changes, and the moment
 * follows.
 *
 * An anchor whose selector matches nothing resolves to `undefined`, and the
 * point quietly falls back to its own `at` or to distance — a renamed id should
 * cost precision, not the whole route.
 */
export function resolveAnchors(path: PlacementPath | undefined): ResolvedAnchors {
  const points = path?.points ?? []
  const pinned: Array<number | undefined> = new Array(points.length).fill(undefined)
  const xs: Array<number | undefined> = new Array(points.length).fill(undefined)
  const any = points.some((point) => point.anchor)
  if (!any || typeof document === "undefined") return { pinned, xs, any }

  const vh = window.innerHeight
  const vw = window.innerWidth
  const range = document.documentElement.scrollHeight - vh
  const scrolled = window.scrollY

  points.forEach((point, i) => {
    const anchor = point.anchor
    if (!anchor?.selector) return
    let element: Element | null = null
    try {
      element = document.querySelector(anchor.selector)
    } catch {
      return
    }
    if (!element) return
    const rect = element.getBoundingClientRect()
    const line = rect.top + scrolled + (anchor.ay ?? 0.5) * rect.height
    pinned[i] = range > 0 ? Math.max(0, Math.min(1, (line - point.y * vh) / range)) : 0
    if (anchor.followX && vw > 0) xs[i] = (rect.left + (anchor.ax ?? 0.5) * rect.width) / vw
  })

  return { pinned, xs, any }
}

/**
 * A stable selector for an element the user clicked in the editor.
 *
 * Preference order is robustness under edits: an id survives almost anything,
 * a data attribute survives restyling, and a structural path — the last resort —
 * survives nothing much but is better than no anchor at all. The editor warns
 * when it had to use one.
 */
export function selectorFor(element: Element): { selector: string; robust: boolean } {
  if (element.id && !/^\d/.test(element.id)) {
    return { selector: `#${CSS.escape(element.id)}`, robust: true }
  }
  for (const name of ["data-testid", "data-section", "data-id", "data-anchor"]) {
    const value = element.getAttribute(name)
    if (value) return { selector: `[${name}="${CSS.escape(value)}"]`, robust: true }
  }

  const parts: string[] = []
  let node: Element | null = element
  while (node && node !== document.body && parts.length < 6) {
    if (node.id && !/^\d/.test(node.id)) {
      parts.unshift(`#${CSS.escape(node.id)}`)
      break
    }
    const parent: Element | null = node.parentElement
    const tag = node.tagName.toLowerCase()
    if (!parent) {
      parts.unshift(tag)
      break
    }
    const siblings = Array.from(parent.children).filter((child) => child.tagName === node!.tagName)
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag)
    node = parent
  }
  return { selector: parts.join(" > "), robust: false }
}
