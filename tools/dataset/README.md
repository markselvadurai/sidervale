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

## Later stages (not built yet)

Enrich (timezone via `tz-lookup`, sky brightness from the Lorenz 2024 raster, Wikidata QIDs as
cross-check) → validate → emit the app dataset. Per `docs/PROJECT.md`: deterministic facts only
from deterministic sources; LLM judges for prose and arbitration with abstention.
