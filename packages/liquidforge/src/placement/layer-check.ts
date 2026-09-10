/**
 * The trap in `layer: -1`.
 *
 * Putting a decorative object behind the page's text is the common case, and
 * `z-index: -1` is the obvious way to ask for it. It also has one failure mode
 * that produces no error, no warning, and nothing on screen: a negative z-index
 * paints *behind* the block backgrounds of its ancestors, so if `html` or
 * `body` has an opaque background — which nearly every real page does — the
 * object is painted and then covered over.
 *
 * You cannot tell this apart from "the object failed to load" by looking, which
 * is what makes it worth a warning that names the real cause.
 */
export function warnIfPaintedBehindBackground(node: Element | null, id: string): void {
  if (typeof window === "undefined" || !node) return

  const opaque = [document.documentElement, document.body].find((element) => {
    if (!element) return false
    const background = getComputedStyle(element).backgroundColor
    if (!background || background === "transparent") return false
    // rgba(…, 0) is the other spelling of transparent.
    const alpha = /rgba?\([^)]*,\s*([\d.]+)\s*\)$/.exec(background)
    return alpha ? Number(alpha[1]) > 0 : true
  })

  if (!opaque) return

  const where = opaque === document.body ? "body" : "html"
  console.warn(
    `liquidforge: the spot "${id}" has a negative layer, and <${where}> has an opaque background ` +
      `(${getComputedStyle(opaque).backgroundColor}), so the object is painted behind it and will not be visible.\n\n` +
      `Two ways out:\n` +
      `  · Set the placement's layer to 0 and give your page content "position: relative; z-index: 1", ` +
      `which puts the object above the background and below your text.\n` +
      `  · Or move that background off <${where}> onto a wrapper element.`,
  )
}
