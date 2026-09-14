import type { Metadata } from "next"
import Link from "next/link"
import { SiteNav } from "@/components/site-nav"
import { ContactForm } from "@/components/contact-form"

export const metadata: Metadata = {
  title: "Privacy — Liquidforge",
  description: "What the Liquidforge site, library and MCP server collect, why, where it goes, and how to have it removed.",
}

const UPDATED = "14 September 2026"

/**
 * The privacy policy.
 *
 * Written against what the code actually does, surface by surface, because
 * Liquidforge is four different things — a website, a library, a local MCP
 * server and a hosted one — that handle data in four different ways, and a
 * single generic paragraph would be wrong about at least three of them.
 */
export default function PrivacyPage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="label mb-3">Privacy policy</p>
        <h1 className="display text-[clamp(2.2rem,6vw,3.4rem)]">What Liquidforge knows about you.</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-bone-dim">
          Very little, on purpose. There are no accounts, no analytics, no advertising and no tracking cookies. This
          page says exactly what each part of Liquidforge collects, why, who else sees it, and how long it is kept.
          Last updated {UPDATED}.
        </p>

        <Section title="Who runs it">
          <p>
            Liquidforge is an independent open-source project maintained by Meet Chauhan. It covers this website
            (liquidforge-pi.vercel.app, including the Studio and the community gallery), the <code>liquidforge</code> npm
            package, the <code>liquidforge-mcp</code> MCP server and its Claude Desktop extension, and the hosted MCP
            endpoint at <code>/api/mcp</code>. To reach the maintainer, use the <a href="#contact">contact form</a> below.
          </p>
        </Section>

        <Section title="This website and the Studio">
          <Item term="Requests to the site">
            The site is hosted on Vercel. Like any web host, Vercel receives the request details your browser sends —
            IP address, user agent, the page requested — and keeps them in operational logs under{" "}
            <a href="https://vercel.com/legal/privacy-policy">Vercel&apos;s privacy policy</a>. Liquidforge does not add
            analytics, tracking pixels or third-party scripts, and fonts are served from this site rather than from
            Google.
          </Item>
          <Item term="Posting to the gallery">
            When you post, the title, name, link, object and look you enter are stored in a Postgres database hosted by
            Neon, and shown publicly. To stop floods, the server stores a salted, truncated hash of your IP address with
            the post; the address itself is never stored, and the hash cannot be turned back into it. Posts stay up until
            you ask for one to be removed or it is taken down for breaking the rules.
          </Item>
          <Item term="Live cursors">
            On pages that show other visitors&apos; cursors, your cursor position, a display name and a colour are relayed
            to other people on the same page while you are there. They are held in memory only and never stored.
          </Item>
          <Item term="Colours from a website">
            When you ask the Studio to read a website&apos;s colours, the address you enter is fetched by this site&apos;s
            server, along with up to six of that site&apos;s stylesheets. The result may be cached for up to an hour so the
            same address is not fetched twice; the address is not otherwise stored.
          </Item>
          <Item term="Things your browser fetches directly">
            Some features load data straight from other services, which then receive your IP address under their own
            policies: 3D model catalogues on the Assets page (Sketchfab, Poly Haven, Hugging Face, GitHub and the three.js
            examples), any model or image URL you give the Studio, and any JSON URL or GitHub repository you connect on
            the Live page.
          </Item>
          <Item term="Stored in your browser">
            Your display name for posts and your saved placement on the Place demo are kept in your browser&apos;s local
            storage, and a random identity for live cursors in session storage. None of it is sent anywhere except as
            described above; clear your site data to remove it.
          </Item>
          <Item term="The contact form">
            Messages you send are stored in the same database, with the topic, the text, the reply address if you choose
            to leave one, and a salted hash of your IP address for rate limiting. They are used only to answer you and
            are deleted within twelve months, or sooner on request.
          </Item>
        </Section>

        <Section title="The npm package and <liquid-forge> element">
          <p>
            The <code>liquidforge</code> library runs entirely in your visitors&apos; browsers. It contains no telemetry and
            sends nothing to the maintainer. It loads only what you configure it to load — models, images, SVGs, and JSON
            URLs for data binding. If you load the element script from jsDelivr, that request is handled under{" "}
            <a href="https://www.jsdelivr.com/terms/privacy-policy-jsdelivr-net">jsDelivr&apos;s privacy policy</a>.
          </p>
        </Section>

        <Section title="The MCP server and Claude Desktop extension">
          <p>
            <code>liquidforge-mcp</code>, whether run with <code>npx</code> or installed as the Claude Desktop extension,
            runs on your own computer. It has no telemetry and sends nothing to the maintainer. What it does touch:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              Searching for models calls the public catalogues named above; the Objaverse index ships inside the
              extension, and the npm package fetches it from this website.
            </li>
            <li>Reading a website&apos;s colours fetches that website from your computer.</li>
            <li>
              Rendering starts a Chromium-based browser already installed on your computer, headless, and loads any model
              URL in the look being rendered. Images stay on your machine unless you or your AI client send them on.
            </li>
            <li>
              Proposing a placement writes a <code>liquidforge.proposal.json</code> file into the project you name, and
              nothing else.
            </li>
          </ul>
          <p className="mt-3">
            Your AI client — Claude or another — decides what it sends to the tools and what it does with their results,
            under its own privacy policy.
          </p>
        </Section>

        <Section title="The hosted MCP endpoint">
          <p>
            <code>https://liquidforge-pi.vercel.app/api/mcp</code> handles each request independently and keeps no
            record of the tool calls or their arguments beyond the standard request logs Vercel keeps. Reading a
            website&apos;s colours through it fetches that website from Vercel&apos;s servers, and only public addresses are
            allowed.
          </p>
        </Section>

        <Section title="Who else sees data">
          <p>
            No data is sold or shared for advertising. The service providers involved are Vercel (hosting and request
            logs), Neon (the database for gallery posts and contact messages), and the catalogues and websites your own
            actions fetch from. Gallery posts are public by design.
          </p>
        </Section>

        <Section title="Keeping and removing data">
          <p>
            Gallery posts are kept until removed. Contact messages are deleted within twelve months. Hosting logs are
            kept for Vercel&apos;s standard retention period. To have a post or a message removed, or to ask what is held
            about you, send a message below with the topic &ldquo;Privacy or data removal&rdquo;; requests are handled
            within thirty days. Liquidforge is not directed at children under 13 and does not knowingly collect their
            data.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If this policy changes, the date at the top changes with it, and anything that collects more than it does
            today will be described here before it ships.
          </p>
        </Section>

        <section id="contact" className="mt-12 border-t border-rule pt-8">
          <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-bone/55">Contact</h2>
          <p className="mt-3 mb-5 text-[14px] leading-relaxed text-bone-dim">
            Questions about this policy, removal requests, or anything else. See also the{" "}
            <Link href="/mcp">MCP server documentation</Link>.
          </p>
          <ContactForm defaultTopic="privacy" />
        </section>
      </main>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-rule pt-7">
      <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-bone/55">{title}</h2>
      <div className="mt-4 space-y-4 text-[14px] leading-relaxed text-bone/75 [&_a]:text-bone [&_a]:underline [&_a]:underline-offset-2 [&_code]:font-mono [&_code]:text-[12px] [&_code]:text-bone">
        {children}
      </div>
    </section>
  )
}

function Item({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:gap-5">
      <p className="font-mono text-[11px] text-bone/45 sm:pt-0.5">{term}</p>
      <p>{children}</p>
    </div>
  )
}
