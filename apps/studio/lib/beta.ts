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
    slug: "reflect",
    title: "Your page, in the chrome",
    pitch: "The object reflects the actual site around it. Scroll, and your headline, your photos and your buttons slide across its surface.",
    section: "clip",
    rough: "the reflection is a snapshot of the page, retaken when it changes, not live video of it; Chrome's trial of live HTML in canvas would make it live.",
  },
  {
    slug: "timeline",
    title: "A timeline of melts",
    pitch: "MELT, then DRIP at two seconds, then a ferrofluid knot at six. Set the moments and every change morphs — never a cut — in a clip ready to post.",
    section: "clip",
    rough: "words and six shapes only for now; very different outlines, like a long word into a sphere, pass through a brief blend of both.",
  },
  {
    slug: "hands",
    title: "Push it with your hand",
    pitch: "Allow the camera and your hand becomes the cursor: push the surface with an open palm, pinch to pull a strand out of it. Nothing leaves your device.",
    section: "clip",
    rough: "one hand at a time, and it needs decent light; the first start downloads about 20 MB of tracking model and code.",
  },
  {
    slug: "pour",
    title: "Pour it",
    pitch: "Tilt your phone and the liquid sloshes to the low side. Tip it far enough and it pours off the object, runs down the screen and pools at the bottom.",
    section: "clip",
    rough: "iPhones ask for motion access first; the drips are drawn flat over the page rather than in 3D, and the pool evaporates after a while.",
  },
  {
    slug: "melt",
    title: "Melt between pages",
    pitch: "Click a link and the object doesn't cut away — it melts into the next page's object, in the next page's colours, while the address changes underneath.",
    section: "clip",
    rough: "works where the canvas lives in a layout that survives navigation (Next.js, Remix, SvelteKit); a full page reload still starts fresh.",
  },
  {
    slug: "visualizer",
    title: "Song to visualizer",
    pitch: "Drop in a track. Every kick splashes, hard hits make it boil, the cover art picks the colours — and the render lands on the beat exactly, with the song under it.",
    section: "about-them",
    rough: "hits are found in the bass, so songs without a kick drum get fewer of them; the tempo shown is an estimate.",
  },
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
    slug: "doodle",
    title: "Doodle to chrome",
    pitch: "Draw anything with a finger. Lift it, and a second later the drawing is a liquid object you can touch — and film.",
    section: "about-them",
    rough: "the outline is traced from the pixels you draw, so thin or broken strokes lose detail; thick joined strokes work best.",
  },
  {
    slug: "talk",
    title: "Talk to it",
    pitch: "“Gold.” “Slower.” “Make it feel expensive.” Say or type what you want and the surface changes while you watch.",
    section: "about-them",
    rough: "it understands a vocabulary of materials, colours and directions, not free-form sentences; speech input needs Chrome, Edge or Safari.",
  },
  {
    slug: "words",
    title: "Words to object",
    pitch: "Type “an octopus” and pick from open icon silhouettes and 3D models — then it's liquid. No generation fees, no queue.",
    section: "about-them",
    rough: "icons are found by name, not generated, so unusual words may return nothing; outline-style icons extrude as thin frames.",
  },
  {
    slug: "profile-kit",
    title: "Every profile size, from a name",
    pitch: "Type a handle and get X, YouTube, LinkedIn, Twitch and Discord banners, an avatar and wallpapers — each rendered for its shape, in one zip.",
    section: "about-them",
    rough: "stills only for now; platforms crop banners differently on phones, so very long names can be clipped.",
  },
  {
    slug: "stream",
    title: "Stream overlay",
    pitch: "Your name, liquid, in the corner of your stream. Chat ripples it, cheers and subs splash it, a raid makes it erupt — one OBS browser source, no login.",
    section: "formats",
    rough: "Twitch only, read from chat, so follows don't show (those need Twitch's authorised API); YouTube isn't wired yet.",
  },
  {
    slug: "crowd",
    title: "Crowd surface",
    pitch: "Everyone on the page is a ripple. On launch day the liquid shows how many people are there by how much it moves — and every screenshot counts them.",
    section: "together",
    rough: "browsers connect to each other directly, which comfortably holds dozens per room rather than thousands; a few strict office networks block direct connections.",
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
