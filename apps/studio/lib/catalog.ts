/**
 * Asset search.
 *
 * Implemented in `liquidforge/catalog` so the Studio and the MCP server search
 * the same five catalogues through one code path. The default Objaverse loader
 * already fetches `/objaverse-index.json`, which is exactly where this app
 * serves it from, so nothing needs configuring here.
 */
export {
  PROVIDERS,
  TOTAL_ASSETS,
  HEAVY_POLYCOUNT,
  searchAssets,
  randomAsset,
  resolveAssetUrl,
  fetchSketchfabMetadata,
  configureCatalog,
  type AssetResult,
  type RandomOptions,
  type ProviderId,
  type ProviderMeta,
  type SearchOptions,
  type SearchOutcome,
} from "liquidforge/catalog"
