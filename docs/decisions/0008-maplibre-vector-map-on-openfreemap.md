# 0008 — MapLibre GL on OpenFreeMap, with markers as data

**Status:** accepted, amended same day (v6 → v5; see the worker post-mortem below)
**Date:** 2026-08-25

## Context

Three pressures arrived together.

1. **The look was a hack.** The indigo ground was `sepia(1) hue-rotate(195deg)` over raster
   pixels, because raster tiles cannot be restyled. Every further visual ambition hit that wall,
   and a canvas-wide CSS filter would also have tinted the light-pollution overlay, which encodes
   its data in colour.
2. **Labels were impossible.** The design intake's verdict was literally "no declutter layer
   available in Leaflet", and both design returns wanted zoom-gated site labels.
3. **CARTO is retiring keyless raster tiles.** Their docs now state the `basemaps.cartocdn.com`
   raster endpoints "require an API key and are being retired", serving unkeyed requests under an
   "API key required" watermark, and say the same is coming to their vector tiles. Probed on
   2026-08-25: our tiles still return a clean 200, so we were not yet watermarked — but the
   migration stopped being optional.

## Options

- **Stay on Leaflet, add a CARTO key.** A sixty-second stopgap, and still the right emergency
  lever. Rejected as a destination: it keeps the styling ceiling and the label ceiling, and
  pushes an API key into a static bundle where every visitor can read it.
- **MapLibre + a keyed vector provider** (MapTiler, CARTO vector, Stadia). Rejected: MapTiler's
  free tier is ~100k _requests_ when using a third-party client like MapLibre — roughly 2–4k map
  views. Stadia is viable and needs no key (domain auth) but is non-commercial-only and 200k
  tiles/month. Both make a key or a Worker load-bearing sooner than necessary.
- **MapLibre + OpenFreeMap.** Chosen.

## Decision

**MapLibre GL JS, styled from OpenFreeMap's `dark`.** Verified by direct probe: style 200 with
47 layers, a real `application/vnd.mapbox-vector-tile` tile, glyphs 200. Keyless, no
registration, no stated limits, and **one CSP host** — `tiles.openfreemap.org` serves style,
tiles, glyphs and sprites alike. The indigo ground is now paint on the style's own layers, not a
filter over everything.

**Markers became data.** `sitesToFeatures(sites, scores, selectedId)` is a pure function
returning a GeoJSON FeatureCollection; tier, score, kind, selection and the accessible label are
feature _properties_, and `map-style.ts` turns them into paint expressions. Two consequences:

- **The whole marker layer is unit-testable without WebGL.** jsdom has no WebGL2, so a
  component-level map test was never going to exist; the decisions all live in pure functions
  instead, which is stronger coverage than the DOM assertions it replaces.
- **`setData` is a diff**, so the `iconKeys` cache that existed to stop 293 DOM rebuilds per
  clock tick is deleted rather than ported.

**Accessibility improved rather than regressed.** Leaflet made all 293 markers focusable buttons
— which was never a usable keyboard experience. A GL canvas has no affordances at all, so the
app now renders a visually-hidden, labelled site list from the same feature data, with each entry
surfacing on focus. Fewer tab stops, real names, and it works when the canvas cannot.

**Lazy-loaded behind the router.** MapLibre is ~989 kB raw. Loading the map route lazily moved it
out of the initial bundle, which **fell from 517 kB to 400 kB raw (136 kB → 98 kB transfer)** —
smaller than before the migration, since Leaflet left too.

**Drive times will not use a Worker** (revising the plan this replaced). The deciding factor is
caching permission, not price: Google's and Mapbox's terms do not permit precomputing and
publishing a drive-time table, while **OpenRouteService's ToS contains no prohibition on storing
results**, and its Matrix endpoint takes 3,500 routes per request — one origin against all 293
sites is a single call against a 500/day free quota. So drive times become a weekly GitHub
Actions job writing static `drive-times/{regionId}.json`: no key in the client, no new CSP host,
no backend on the request path. ORS output is CC-BY-SA 4.0 and OSM data is ODbL, so the published
table is a share-alike derived work requiring attribution — fine for a free open project, and the
deeper reason the open engines were the only legally viable choice.

## Consequences

- **Amendment — the library shipped at v5.24.0, not v6.** v6.6.0 produced two structural
  failures. First, `maxBounds` threw `Cannot read properties of null` from the constructor *and*
  as the first statement of the `load` handler — where it silently aborted every `addSource`/
  `addLayer` after it (a blank map with working chrome). The original text of this record claimed
  moving it after `load` fixed it; that was wrong — the call was dropped entirely, since
  `renderWorldCopies: false` already provides the one-world behaviour. Second, and decisive:
  v6's worker RPC **boots and then never replies** — instrumented end-to-end: 14 actor messages
  posted to the worker (`AT`/`RMT` tile requests), zero responses, zero errors, while the same
  module demonstrably boots in a hand-made blob worker. Tiles were requested and never arrived,
  forever, silently. Two structural bugs in one major is a component problem, not a wiring
  problem; the mature v5 line renders correctly on the first try (verified: `loaded: true`,
  tiles loaded, 58 circles at world zoom, 7 collision-managed labels over Ontario, selection
  ring, overlay toggle). Revisit v6 only with a changelog in hand and a rendering smoke test.
  Also kept from the debugging: MapLibre reports WebGL failure **asynchronously**, so a
  `try`/`catch` around the constructor never fires; support is checked up front with a `webgl2`
  context probe, which doubles as the no-WebGL fallback for real users.
- **A real fallback exists now.** WebGL2 is not universal — old devices, disabled GPU
  acceleration, some remote sessions. The app says so and keeps working: the site index and
  ranked list still answer the question the product exists for.
- **CSP grew** by `worker-src 'self' blob:` and `child-src 'self' blob:` (MapLibre's default
  worker is a blob module that re-imports the library by URL), plus `tiles.openfreemap.org` in
  **both** `connect-src` and `img-src` — vector assets are `fetch`, not `<img>`, so `img-src`
  alone does not cover them. The `blob:` entries are load-bearing: dev has no CSP, so a missing
  `worker-src blob:` would render perfectly locally and ship a blank map to production. Do not
  "tighten" them away without replacing the worker mechanism first.
- **The light-pollution overlay is the fragile carry-over.** Leaflet's `tileSize: 1024` +
  `zoomOffset: -2` has no MapLibre equivalent; the source now declares the 1024px tiles directly
  with `maxzoom: 6`. **Verify visually against a known light-polluted area** before trusting it —
  PROJECT.md marks these as reverse-engineered parameters.
- **OpenFreeMap is one person, donation-funded, explicitly "AS-IS, AS-AVAILABLE" with no SLA.**
  Accepted knowingly: the style URL is a single constant, and the stack plus weekly planet dumps
  are open source, so the failure mode is a weekend's migration to **Protomaps PMTiles on R2**
  (~$0–2/month) rather than a dead map. That fallback is the documented escape hatch.
- **Tile rendering could not be verified from the agent's browser** — MapLibre fetches tiles
  inside a Web Worker that main-thread instrumentation cannot observe, and screenshots are
  unavailable in this environment. Structure, style load, sprites, attribution and controls were
  all confirmed; appearance requires a human.
