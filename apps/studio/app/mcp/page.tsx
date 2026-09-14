import type { Metadata } from "next"
import Link from "next/link"
import { SiteNav } from "@/components/site-nav"
import { ContactForm } from "@/components/contact-form"
import { CopyButton } from "@/components/ui"

export const metadata: Metadata = {
  title: "MCP server — Liquidforge",
  description:
    "Give Claude and other AI clients Liquidforge: recommend, render and write liquid 3D looks for React, Webflow and Framer. Install as a Claude Desktop extension, with npx, or add the hosted connector.",
}

const SITE = "https://liquidforge-pi.vercel.app"
const VERSION = "0.2.0"

const TOOLS: Array<{ name: string; what: string; where: "both" | "local" }> = [
  { name: "liquidforge_get_started", what: "Learn the library and which tool to use next.", where: "both" },
  { name: "liquidforge_get_docs", what: "Documentation by topic, including the two failures that give no error.", where: "both" },
  { name: "liquidforge_list_collections", what: "Twelve material families and 108 colourways, with palettes.", where: "both" },
  { name: "liquidforge_inspect_preset", what: "One colourway's exact numbers, before overriding one.", where: "both" },
  { name: "liquidforge_recommend_preset", what: "Pick a colourway for a site you describe.", where: "both" },
  { name: "liquidforge_palette_from_url", what: "Read a website's brand colours from its CSS and build a colourway from them.", where: "both" },
  { name: "liquidforge_generate_component", what: "Write the React component, or a Webflow, Framer or plain HTML embed.", where: "both" },
  { name: "liquidforge_search_models", what: "Search five open 3D catalogues — about 46,900 models.", where: "both" },
  { name: "liquidforge_get_model_import", what: "Resolve a catalogue model to a URL the component can load.", where: "both" },
  { name: "liquidforge_generate_placement", what: "Float an object over an existing site, along a scroll path with checkpoints.", where: "both" },
  { name: "liquidforge_breed_presets", what: "Cross two colourways into a litter of new ones.", where: "both" },
  { name: "liquidforge_render", what: "Render a look to an image with a browser on your computer, so the AI can see it.", where: "local" },
  { name: "liquidforge_propose_placement", what: "Leave a placement in your project for the in-place editor to approve.", where: "local" },
]

const PROMPTS = [
  {
    prompt: "Add a liquid hero to my landing page — it's for a subwoofer brand, dark and a bit alien. Show me two options before you write it.",
    uses: "recommend_preset, render, generate_component",
  },
  {
    prompt: "Make the hero match stripe.com's colours and give me the Webflow embed.",
    uses: "palette_from_url, generate_component",
  },
  {
    prompt: "Find a helmet model that would look good as ferrofluid, and write the React component for it.",
    uses: "search_models, get_model_import, generate_component",
  },
  {
    prompt: "Something between Mercury 3 and Magma 4 — breed a few and render the best one.",
    uses: "breed_presets, render",
  },
  {
    prompt: "Put a floating chrome knot on my blog that melts into our logo as you scroll past the pricing section.",
    uses: "generate_placement, propose_placement",
  },
]

export default function McpPage() {
  const claudeCode = "claude mcp add liquidforge -- npx -y liquidforge-mcp"
  const cursor = `{
  "mcpServers": {
    "liquidforge": { "command": "npx", "args": ["-y", "liquidforge-mcp"] }
  }
}`
  const codex = `[mcp_servers.liquidforge]
command = "npx"
args = ["-y", "liquidforge-mcp"]`

  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-4xl px-5 py-14">
        <p className="label mb-3">MCP server · v{VERSION}</p>
        <h1 className="display text-[clamp(2.2rem,6vw,3.6rem)]">Liquidforge, for your AI.</h1>
        <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-bone-dim">
          Give Claude — or Cursor, Codex, any MCP client — the whole library. It can recommend a look for your site, read
          your brand colours from your website, render a preview it can actually see, find a 3D model, and write the
          finished component or a Webflow, Framer or HTML embed. Free, open source, and it runs on your own computer.
        </p>

        <section className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-3">
          <Option
            title="Claude Desktop"
            badge="Easiest"
            body="Download the extension and double-click it — or drag it into Claude Desktop. It carries everything it needs, including Node."
          >
            <a
              href={`/downloads/liquidforge-${VERSION}.mcpb`}
              download
              className="inline-flex rounded-[var(--radius-pill)] bg-bone px-4 py-2 font-mono text-[11px] text-ink transition-colors hover:bg-bone-dim"
            >
              Download liquidforge.mcpb
            </a>
            <p className="mt-2 font-mono text-[10px] text-bone/35">
              Or Settings → Extensions → Advanced → Install Extension. About 10 MB.
            </p>
          </Option>
          <Option title="Claude Code, Cursor, Codex" body="Runs the published npm package with npx. Node 18.18 or newer.">
            <Snippet code={claudeCode} />
            <details className="mt-2 font-mono text-[11px] text-bone/60">
              <summary className="cursor-pointer text-bone/45 hover:text-bone">Cursor and Codex</summary>
              <p className="mt-2 text-[10px] text-bone/35">.cursor/mcp.json</p>
              <Snippet code={cursor} />
              <p className="mt-2 text-[10px] text-bone/35">~/.codex/config.toml</p>
              <Snippet code={codex} />
            </details>
          </Option>
          <Option
            title="Claude on the web or phone"
            body="No install: add the hosted connector by URL in Settings → Connectors → Add custom connector. Rendering and proposals need your computer, so those two tools are local-only."
          >
            <Snippet code={`${SITE}/api/mcp`} />
          </Option>
        </section>

        <section className="mt-14">
          <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-bone/55">Try asking</h2>
          <ul className="mt-4 divide-y divide-rule rounded-[var(--radius-lg)] border border-rule">
            {PROMPTS.map((entry) => (
              <li key={entry.prompt} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[1fr_15rem] sm:gap-6">
                <p className="text-[14px] leading-relaxed text-bone/85">&ldquo;{entry.prompt}&rdquo;</p>
                <p className="font-mono text-[10px] leading-relaxed text-bone/35 sm:text-right">{entry.uses}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-bone/55">Tools</h2>
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-rule">
            <table className="w-full min-w-[34rem] text-left">
              <tbody className="divide-y divide-rule">
                {TOOLS.map((tool) => (
                  <tr key={tool.name}>
                    <td className="px-4 py-2.5 align-top font-mono text-[11px] text-bone/85">{tool.name}</td>
                    <td className="px-4 py-2.5 text-[13px] leading-relaxed text-bone/65">{tool.what}</td>
                    <td className="px-4 py-2.5 text-right align-top font-mono text-[10px] text-bone/35">
                      {tool.where === "local" ? "local only" : "everywhere"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 font-mono text-[10px] leading-relaxed text-bone/35">
            Every tool is read-only except render (writes an image if you ask it to save one) and propose placement
            (writes one proposal file into your project). Nothing is deleted or sent anywhere you don&apos;t ask for.
          </p>
        </section>

        <section className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-bone/55">Setup notes</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-bone/70">
              <li>No account, no API key, no configuration required.</li>
              <li>
                Rendering finds Chrome, Edge, Brave or Chromium by itself. If yours lives somewhere unusual, set it in the
                extension&apos;s settings, or set <code className="font-mono text-[12px] text-bone">LIQUIDFORGE_BROWSER</code>.
              </li>
              <li>
                The components it writes need <code className="font-mono text-[12px] text-bone">npm install liquidforge three</code>;
                the Webflow and Framer embeds need nothing.
              </li>
              <li>
                Try looks by hand in the <Link className="text-bone underline underline-offset-2" href="/studio">Studio</Link>.
              </li>
            </ul>
          </div>
          <div>
            <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-bone/55">Privacy</h2>
            <p className="mt-4 text-[13px] leading-relaxed text-bone/70">
              The server runs on your computer with no telemetry. It only contacts the model catalogues you search, the
              websites you ask it to read, and model URLs in a look you render. The hosted connector keeps no record of
              your tool calls. Full details in the{" "}
              <Link className="text-bone underline underline-offset-2" href="/privacy">
                privacy policy
              </Link>
              .
            </p>
          </div>
        </section>

        <section id="support" className="mt-14 border-t border-rule pt-8">
          <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-bone/55">Support</h2>
          <p className="mt-3 mb-5 text-[14px] leading-relaxed text-bone-dim">
            Something not working, or a tool you wish it had? Send a message.
          </p>
          <ContactForm defaultTopic="mcp" />
        </section>
      </main>
    </>
  )
}

function Option({ title, badge, body, children }: { title: string; badge?: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[var(--radius-lg)] border border-rule bg-ink-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[12px] text-bone">{title}</h3>
        {badge && <span className="rounded-[var(--radius-pill)] bg-bone px-2 py-0.5 font-mono text-[9px] text-ink">{badge}</span>}
      </div>
      <p className="mt-2 mb-4 flex-1 text-[13px] leading-relaxed text-bone/60">{body}</p>
      <div>{children}</div>
    </div>
  )
}

function Snippet({ code }: { code: string }) {
  return (
    <div className="mt-1 flex items-start gap-2 rounded-[var(--radius-sm)] border border-rule bg-ink px-2.5 py-2">
      <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[10.5px] leading-relaxed text-bone/80">{code}</pre>
      <CopyButton text={code} label="Copy" variant="ghost" />
    </div>
  )
}
