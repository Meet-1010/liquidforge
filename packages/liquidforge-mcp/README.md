<p align="center"><img src="https://liquidforge-pi.vercel.app/icons/icon-192.png" width="96" height="96" alt="Liquidforge"></p>

# liquidforge-mcp

MCP server for [Liquidforge](https://liquidforge-pi.vercel.app) — liquid 3D hero sections for React, Webflow, Framer and plain HTML.

Give Claude, Cursor, Codex or any MCP client the whole library. It can recommend a look for a site, read a website's brand colours from its CSS, render a preview it can actually see, search about 46,900 open 3D models, and write the finished React component or a Webflow, Framer or HTML embed. It also knows the two failures that give no error when this is written by hand.

Free, MIT-licensed, no account and no API key. It runs on your own computer.

Full documentation: **https://liquidforge-pi.vercel.app/mcp**

## Install

### Claude Desktop — one click

Download [`liquidforge-0.2.0.mcpb`](https://liquidforge-pi.vercel.app/downloads/liquidforge-0.2.0.mcpb) and double-click it, or drag it into Claude Desktop. The extension carries its own dependencies.

### Claude Code

```bash
claude mcp add liquidforge -- npx -y liquidforge-mcp
```

### Cursor — `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "liquidforge": { "command": "npx", "args": ["-y", "liquidforge-mcp"] }
  }
}
```

### Codex — `~/.codex/config.toml`

```toml
[mcp_servers.liquidforge]
command = "npx"
args = ["-y", "liquidforge-mcp"]
```

### Claude on the web or phone — no install

Add a custom connector (Settings → Connectors → Add custom connector) with the URL:

```
https://liquidforge-pi.vercel.app/api/mcp
```

The hosted connector has every tool except `liquidforge_render` and `liquidforge_propose_placement`, which need your computer.

Node 18.18 or newer for `npx`.

## Tools

| tool | | read-only |
| --- | --- | --- |
| `liquidforge_get_started` | What the library is, how to install it, which tool to reach for next. Start here | yes |
| `liquidforge_get_docs` | Documentation by topic — including `blend` and `shader`, the two that fail silently, and `placement` | yes |
| `liquidforge_list_collections` | Twelve families, 108 colourways, with palettes | yes |
| `liquidforge_inspect_preset` | One colourway's exact numbers | yes |
| `liquidforge_recommend_preset` | Pick a family and colourway for a described site | yes |
| `liquidforge_palette_from_url` | Read a website's brand colours from its CSS and build a colourway from them | yes |
| `liquidforge_generate_component` | The React component — or a Webflow, Framer or plain HTML embed with `target` | yes |
| `liquidforge_render` | Render a look to a PNG with a Chromium-based browser on this computer, and return the image | writes only if asked to save |
| `liquidforge_search_models` | Search five open 3D catalogues, ~46,900 models, ranked for silhouette | yes |
| `liquidforge_get_model_import` | Resolve a catalogue id to a loadable `.glb` URL | yes |
| `liquidforge_generate_placement` | Float an object over an existing site, along a scroll path with checkpoints | yes |
| `liquidforge_propose_placement` | Leave a placement in the project for the in-place editor to approve | writes one proposal file |
| `liquidforge_breed_presets` | Cross two colourways into a litter of children, deterministic by seed | yes |

Every tool carries a title and `readOnlyHint` / `destructiveHint` annotations. Nothing is ever deleted.

## Try asking

- "Add a liquid hero to my landing page — it's for a subwoofer brand, dark and a bit alien. Show me two options before you write it." *(recommend_preset, render, generate_component)*
- "Make the hero match stripe.com's colours and give me the Webflow embed." *(palette_from_url, generate_component)*
- "Find a helmet model that would look good as ferrofluid, and write the React component for it." *(search_models, get_model_import, generate_component)*
- "Something between Mercury 3 and Magma 4 — breed a few and render the best one." *(breed_presets, render)*
- "Put a floating chrome knot on my blog that melts into our logo as you scroll past the pricing section." *(generate_placement, propose_placement)*

## Configuration

| variable | |
| --- | --- |
| `LIQUIDFORGE_BROWSER` | Path to Chrome, Edge, Brave or Chromium for `liquidforge_render`, when one is not found automatically |
| `LIQUIDFORGE_OBJAVERSE_INDEX` | Path or URL for the Objaverse category index. The extension ships a copy; npm installs fetch it from the Liquidforge website |

## How the recommendations work

`liquidforge_recommend_preset` makes two separate judgements. The **family** comes from register — chrome reads restrained, magma reads loud, ferrofluid reads physical and strange — scored from the description. The **colourway** comes from hue: given a brand colour, the palette closest to it in OKLab wins, because sRGB distance would call a dark navy and a dark brown close. Pearl and Jade are the families lit for a light page.

`liquidforge_palette_from_url` reads colours from what a site declares rather than from a screenshot: brand tokens such as `--primary` and colours on buttons and links count most, vivid colours outrank body text, and greys decide whether the page is light or dark instead of entering the palette.

`liquidforge_search_models` ranks for **silhouette**, not popularity. The material reflects an environment and carries little interior detail, so a recognisable outline survives and a 1.6-million-triangle scan of grass does not.

## Privacy Policy

The server runs on your computer and has no telemetry — it sends nothing to the maintainer. It contacts only: the public 3D catalogues when you search (Sketchfab, Poly Haven, Hugging Face, GitHub, three.js examples), the Liquidforge website for the Objaverse index when installed from npm, websites you ask it to read colours from, and model URLs in a look you render. Rendering uses a browser already installed on your machine, headless, and images stay local unless you or your AI client send them on. Proposing a placement writes a single `liquidforge.proposal.json` into the project you name. The hosted connector processes each request independently and keeps no record of tool calls beyond standard hosting logs.

Full policy, including the website and gallery: **https://liquidforge-pi.vercel.app/privacy**

## Support

Questions, bug reports and requests: **https://liquidforge-pi.vercel.app/mcp#support**

## Development

```bash
npm install
npm run build --workspace=liquidforge
npm test --workspace=liquidforge-mcp        # starts the server and calls every tool
node packages/liquidforge-mcp/scripts/build-mcpb.mjs   # builds the Claude Desktop extension
```

MIT © Meet Chauhan
