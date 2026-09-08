/**
 * The isolation trap, made loud.
 *
 * `mix-blend-mode: difference` on the headline is the signature move for this
 * kind of hero — the text inverts to the complement of whatever liquid is
 * behind it, teal over orange, olive over pink — and it is one CSS line:
 *
 * ```css
 * .blend { mix-blend-mode: difference; color: #fff; }
 * ```
 *
 * But no ancestor may create a stacking context. A `z-index`, a `transform`, a
 * `filter`, an `opacity` below 1 on *any* parent isolates the blend group, and
 * the text then composites against that parent's transparent backdrop instead
 * of against the canvas. It renders flat white over the object, with no error
 * and no clue as to why (§5.7).
 *
 * That failure is invisible and expensive, and consumers will hit it in their
 * own layouts rather than in ours, so this walks the ancestor chain in
 * development and names the exact element and property responsible.
 */

interface Isolator {
  element: HTMLElement
  property: string
  value: string
}

/** Find the nearest ancestor that would isolate a blend group, if any. */
export function findBlendIsolator(element: HTMLElement): Isolator | null {
  if (typeof window === "undefined" || !window.getComputedStyle) return null

  let node: HTMLElement | null = element.parentElement
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node)

    if (style.isolation === "isolate") return { element: node, property: "isolation", value: "isolate" }
    if (style.transform !== "none") return { element: node, property: "transform", value: style.transform }
    if (style.filter !== "none") return { element: node, property: "filter", value: style.filter }
    if (style.backdropFilter && style.backdropFilter !== "none") {
      return { element: node, property: "backdrop-filter", value: style.backdropFilter }
    }
    if (style.perspective !== "none") return { element: node, property: "perspective", value: style.perspective }
    if (style.mixBlendMode !== "normal") {
      return { element: node, property: "mix-blend-mode", value: style.mixBlendMode }
    }
    if (style.willChange !== "auto" && /transform|opacity|filter/.test(style.willChange)) {
      return { element: node, property: "will-change", value: style.willChange }
    }
    if (/paint|layout|strict|content/.test(style.contain ?? "")) {
      return { element: node, property: "contain", value: style.contain }
    }

    const opacity = Number.parseFloat(style.opacity)
    if (Number.isFinite(opacity) && opacity < 1) {
      return { element: node, property: "opacity", value: style.opacity }
    }

    if (style.zIndex !== "auto" && style.position !== "static") {
      return { element: node, property: "z-index", value: style.zIndex }
    }

    node = node.parentElement
  }

  return null
}

let warned = false

/** Warn once per page, in development only. */
export function warnIfBlendIsolated(element: HTMLElement | null): void {
  if (!element || warned) return
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return

  const isolator = findBlendIsolator(element)
  if (!isolator) return
  warned = true

  const description =
    isolator.element.id
      ? `#${isolator.element.id}`
      : isolator.element.className
        ? `.${String(isolator.element.className).trim().split(/\s+/).join(".")}`
        : isolator.element.tagName.toLowerCase()

  console.warn(
    [
      "liquidforge: blend content will render flat white, not inverted.",
      "",
      `An ancestor (${description}) sets ${isolator.property}: ${isolator.value}, which creates a`,
      "stacking context. That isolates the blend group, so the text composites against",
      "that element's transparent backdrop instead of against the canvas.",
      "",
      "Fix: remove that property from the ancestor, or move it outside the hero.",
      "Handle painting order with DOM order instead — canvas first, content after.",
    ].join("\n"),
    isolator.element,
  )
}
