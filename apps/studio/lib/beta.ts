/**
 * The beta: ideas that work, before they are finished.
 *
 * Everything listed here is a real, working experiment — not a mock-up — but
 * rough enough that it lives behind a door you choose to open. Entering is a
 * flag in this browser and nothing else; there is no account and no waitlist.
 */

export type BetaSection = "clip" | "about-them" | "formats" | "together"

export interface Experiment {
  slug: string
  title: string
  /** One line: what you do and what you get. */
  pitch: string
  section: BetaSection
  /** What is still rough, said plainly on the experiment's own page. */
  rough: string
}

export const SECTIONS: Record<BetaSection, { title: string; blurb: string }> = {
  clip: { title: "The clip itself", blurb: "Moments worth filming because they look impossible." },
  "about-them": { title: "Made about you", blurb: "The object is your face, your name, your drawing, your song, your brand." },
  formats: { title: "Formats that travel", blurb: "Getting the look to wherever people already are." },
  together: { title: "Together", blurb: "Reasons to answer someone else's, and to come back." },
}

export const EXPERIMENTS: Experiment[] = [
  {
    slug: "vertical",
    title: "Vertical, with sound",
    pitch: "Render any look as a 9:16, 4:5, square or landscape clip with your track under it, with each app's buttons drawn where they'll sit.",
    section: "formats",
    rough: "the safe-zone guides are approximate and the apps change their layouts; audio is AAC where the browser can encode it.",
  },
  {
    slug: "cinema",
    title: "Cinema render",
    pitch: "Better than the screen can draw: every frame rendered at double size, real motion blur, 60 fps — slower to make, sharper to watch.",
    section: "formats",
    rough: "4× supersampling with heavy blur multiplies render time twenty-fold; long 60 fps clips can take minutes.",
  },
  {
    slug: "mark",
    title: "The mark on every export",
    pitch: "A small Liquidforge mark on your clips and a badge for your site — free, optional, and never a paywall.",
    section: "together",
    rough: "the badge is plain HTML; there is no click tracking and no referral credit yet.",
  },
]

export const BETA_KEY = "liquidforge:beta"

export function hasEnteredBeta(): boolean {
  try {
    return localStorage.getItem(BETA_KEY) === "1"
  } catch {
    return false
  }
}

export function enterBeta(): void {
  try {
    localStorage.setItem(BETA_KEY, "1")
  } catch {
    // A private window: the beta still opens for this visit.
  }
}

export function leaveBeta(): void {
  try {
    localStorage.removeItem(BETA_KEY)
  } catch {
    // Nothing stored to remove.
  }
}
