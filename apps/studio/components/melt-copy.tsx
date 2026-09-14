import { meltPageFor } from "@/lib/melt-site"

/** One page of the made-up site: the words that change while the object melts. */
export function MeltCopy({ href }: { href: string }) {
  const page = meltPageFor(href)
  return (
    <div key={page.href} className="animate-[melt-copy_0.6s_ease-out_both] space-y-4">
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase opacity-55">{page.eyebrow}</p>
      <h2 className="display text-[clamp(2rem,4.8vw,3.4rem)] leading-[1.02]">{page.headline}</h2>
      <p className="max-w-md text-[15px] leading-relaxed opacity-70">{page.body}</p>
      <span className="inline-block rounded-[var(--radius-pill)] border border-current px-4 py-2 font-mono text-[11px] opacity-80">{page.cta}</span>
    </div>
  )
}
