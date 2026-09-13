# liquidforge-mcp

MCP server for [Liquidforge](https://github.com/Meet-1010/liquidforge) — liquid 3D hero sections for React.

It teaches a coding agent the library, recommends a colourway for the site the agent is looking at, and hands over the handful of failures that produce no error and no clue when you write this by hand.

## Add it to a client

**This package is not on npm yet**, so `npx liquidforge-mcp` will not resolve.
Run it from a checkout until it is published:

```bash
git clone https://github.com/Meet-1010/liquidforge
cd liquidforge
npm install
npm run build:all
```

Then point your client at the built entry point, by absolute path:

```bash
claude mcp add liquidforge -- node /absolute/path/to/liquidforge/packages/liquidforge-mcp/dist/index.js
```

Cursor — `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "liquidforge": {
      "command": "node",
      "args": ["/absolute/path/to/liquidforge/packages/liquidforge-mcp/dist/index.js"]
    }
  }
}
```

Codex — `~/.codex/config.toml`:

```toml
[mcp_servers.liquidforge]
command = "node"
args = ["/absolute/path/to/liquidforge/packages/liquidforge-mcp/dist/index.js"]
```

Once it is published, all three become `npx -y liquidforge-mcp` with no args.

Check it works before wiring it up — this starts the server, calls every tool
once, and prints a pass/fail line each:

```bash
npm test --workspace=liquidforge-mcp
```

## Tools

| tool | |
| --- | --- |
| `liquidforge_get_started` | What the library is, how to install it, which tool to reach for next. Start here |
| `liquidforge_get_docs` | Documentation by topic — including `blend` and `shader`, the two that matter, and `placement` for the editor |
| `liquidforge_list_collections` | Ten families, 90 colourways, with palettes |
| `liquidforge_inspect_preset` | One colourway's exact numbers |
| `liquidforge_recommend_preset` | Pick a family and colourway for a described site |
| `liquidforge_generate_component` | Turn an explicit config into paste-ready TSX |
| `liquidforge_generate_placement` | Put an object on a site that already exists: placement file, component, dev save route and the in-place editor, with what to delete afterwards |
| `liquidforge_search_models` | Search five open 3D catalogues, ~46,900 models |
| `liquidforge_get_model_import` | Resolve a catalogue id to a loadable `.glb` URL |

`liquidforge_recommend_preset` makes two separate judgements. The **family** comes from register — chrome reads restrained, magma reads loud — scored from the description. The **colourway** comes from hue: given a brand colour, the palette closest to it in OKLab wins, because sRGB distance would call a dark navy and a dark brown close.

The one hard constraint is background. Only Pearl is lit for a light page; the other four are built to sit on a dark ground, so a light page with Mercury is not a near miss, it is unreadable.

`liquidforge_search_models` ranks for **silhouette**, not popularity. This
material reflects an environment and carries almost no interior detail, so a
recognisable outline survives and a 1.6-million-triangle scan of grass does
not — heavy models are ranked down, and animation is not offered as a filter
because every clip is dropped when the meshes are baked into one surface.

The Objaverse index is read from the repository checkout when there is one, and
otherwise fetched over HTTPS. `LIQUIDFORGE_OBJAVERSE_INDEX` overrides both with
a path or a URL.

## Development

```bash
npm run build
npm test        # starts the server over stdio and calls every tool once
npm run inspect # MCP Inspector
```

## Licence

MIT © Meet Chauhan
