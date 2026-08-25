# Dataset pipeline

Builds Sidervale's global site dataset from certified-place registries. Offline batch — nothing
here runs in the browser or touches the request path.

```bash
npm run harvest      # refresh raw/ snapshots from the live sources (~6 requests total)
npm run test:tools   # parser tests (vitest, node environment)
```

## Stage 1 — harvest (this directory)

| Source      | Mechanism                                                                                                  | Yield                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| darksky.org | Open WP REST (`darksky_place`, 3 pages) + the FacetWP marker blob on the directory page, joined on post id | 275 certified places, 270 with coordinates |
| rasc.ca     | The dark-sky sites table + the Google My Maps KML the page itself links                                    | 28 sites, 24 with coordinates              |

Snapshots land in `raw/` and are committed: reruns diff meaningfully, and downstream stages are
reproducible without network access.

## Rules learned from the sources

- **DarkSky Approved Lodging shares the `darksky_place` post type** — hotels, filtered by taxonomy
  slug, never by judgment.
- **Google Maps embeds are not a coordinate source.** One place's embed centers ~340 km from the
  site. Only the marker blob and the KML count.
- **KML coordinates are `lng,lat`** — reversed from everything else here.
- **Multi-parcel sites (Cypress Hills ×4, Beaver Hills ×3, Grasslands ×2) quarantine** rather than
  silently taking the first pin: "which point is the destination" is a human decision.
- Pin↔site matching is by normalized name prefix (diacritics stripped, `&` ≡ `and`), threshold 8,
  ties quarantine. Deterministic — no model produces or matches a fact.

## Quarantine (current, by reason)

- `no-coordinates`: 5 DarkSky places without map markers; RASC's LeTerrain (2025 — newer than
  their map, dated Mar 2024).
- `multi-parcel`: the three RASC multi-parcel preserves above.

These need human-chosen destination points before they enter the merged dataset.

## Stage 2 — merge (`npm run merge`, no network)

Merges the raw snapshots into `merged.json` (302 sites). Dedup needs **two independent signals**
— normalized-name prefix ≥ 8 _and_ distance ≤ 30 km — to auto-merge; either signal alone is a
review pair for a human, never an auto-merge. Where both sources carry coordinates, DarkSky's is
canonical, the delta is recorded, and > 5 km quarantines as `coordinate-disagreement`. Current
result: one auto-merge (Mont-Mégantic, pins 4.57 km apart inside the reserve), zero review pairs.

## Stage 3 — enrich (`npm run enrich`, no network)

Adds each site's IANA timezone via `tz-lookup` on its coordinates — offline, deterministic, never
inferred. Doubles as a coordinate-error detector: `Etc/*` (open ocean) and `Antarctica/*` zones
quarantine as `suspicious-timezone`, since a lat/lng swap or sign flip usually lands in water.
Current result: 293/293 coordinate-bearing sites resolve to real zones across 50 timezones,
zero suspicious.

## Stage 4 — brightness (`npm run brightness`, fetches atlas tiles once, then cached)

Samples zenith sky brightness for every located site from the **Lorenz 2024 atlas binary tiles**
(`binary_tiles/2024/…dat.gz`) at the atlas's native 30″ grid — his own delta-compression format,
constants and zone table verbatim from his overlay page. Output per site: artificial/natural
brightness `ratio`, total `mpsas` (natural sky = 22.0), and his LP `zone` (0–7b). Year 2024 keeps
the numbers consistent with the overlay tiles the app displays; a 2025 atlas exists — upgrade both
together. Current result: 293/293 sampled from 96 tiles; the two bright-zone alarms are an urban
star park and a nocturnal preserve, bright by design.

## Stage 5 — emit (`npm run emit`, no network)

Validates and writes `public/data/sites.json`, the app-facing dataset: 293 sites with id, name, coordinates,
timezone, designations, regions, brightness, and source URLs. A site missing any requirement is
**excluded with its reasons listed** — currently the 9 quarantined records. Duplicate ids throw.

Resolving the 9 needs a human: pick destination points for the multi-parcel preserves (also give
the Beaver Hills / Cypress Hills composites short display names — their auto-slugs are unusable),
and source coordinates for the five markerless DarkSky places and LeTerrain.

## Later stages (not built yet)

Wikidata QIDs as cross-check; LLM-drafted descriptions with abstention (per `docs/PROJECT.md`);
nearest-town / drive-distance via a routing API.
