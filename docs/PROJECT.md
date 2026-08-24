# Sidervale — project context

Technical orientation for anyone (human or agent) picking this repo up. Public-safe: strategy, timelines and commercial planning live outside the repo.

---

## What this is

The global successor to **Nocturne v1** — a stargazing go/no-go planner. v1 covered 7 curated Ontario dark-sky sites and is frozen at its `v1.0` tag as a hand-built artifact. Sidervale takes the same product thesis global.

**Product thesis:** every competitor scores _a point you are standing at_. Sidervale scores _destinations you might drive to_, on each of the next seven nights, with one fused number and a visual night strip. That framing is un-owned.

## Provenance — what came from v1 and in what condition

| Ported                               | State                                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/engines/*`                  | **As-is, and correct.** Pure functions, only suncalc + luxon. Carry both v1 bug fixes (day-seam, moon probe). Well tested.                           |
| `src/app/night-strip/*`              | **Good.** One `input.required<ScoredNight>()`, no injection, no DOM access, no lifecycle. Geometry all flows through one `toPercent`. 15 real tests. |
| `src/styles.scss` `:root` tokens     | **Portable, needs tidy.** See "Known issues".                                                                                                        |
| Light-pollution `L.tileLayer` config | **Do not modify casually.** Reverse-engineered parameters (`tileSize: 1024`, `zoomOffset: -2`, `maxNativeZoom: 6`). Attribution now in the README.   |
| `src/app/map-view/*`                 | **Needs splitting.** Does four jobs at once — see "Known issues".                                                                                    |
| `src/app/services/*`                 | Works; `WeatherService` needs the dead constructor removed before the site list changes.                                                             |

### Already done in this repo (differs from v1)

- Renamed throughout; `localStorage` cache key namespaced `sidervale:forecast:*` so it cannot read stale Nocturne entries.
- **`suncalc` pinned to exactly `2.0.1`** — no caret. This is load-bearing, see below.
- Removed the unused `openmeteo` dependency (the code uses raw `fetch`) and the unreferenced `services/utils.ts`.
- Added `.nvmrc`, an `engines` field, and `format` / `format:check` scripts.
- Dropped the stale `ng test` VS Code launch config (it pointed at Karma; this project uses Vitest via `@angular/build:unit-test`).

---

## Things that will bite you

**1. `suncalc` must stay pinned at `2.0.1`.** This build returns altitudes in **degrees**; older majors returned radians. `getMoonOverlap`'s up/down probe reads `p.altitude` directly, so a silent minor bump could reinterpret every moon calculation without failing loudly. There should be a unit-assertion test guarding this — if it isn't there yet, add it.

**2. Open-Meteo's free tier is non-commercial.** No ads, no subscriptions, no in-app purchases. Free tier is 10,000 calls/day. Measured: client-side fetching at 200 sites caps out around **50 users/day**. A shared server-side cache on a 3-hour TTL makes it ~1,600 calls/day for 200 sites _regardless of user count_ — that inversion is the change that makes global coverage possible at all. The first dollar of revenue requires a licensed feed (Meteosource from ~$9/mo, Open-Meteo Standard ~$29/mo).

**3. An observing night is a local calendar concept, not an instant.** Passing `Date` around is what caused the v1 day-seam bug — twice. `siteToday()` is the v1-sized mitigation; the intended fix is a real domain type:

```ts
/** The night that BEGINS on this local calendar date at this site. */
type ObservingNight = { readonly siteId: string; readonly localDate: string }; // 'YYYY-MM-DD'
```

Make it impossible to construct an ambiguous night rather than relying on callers to remember.

**4. Scale changes which bugs matter.** Rare per-site defects become daily at 300 sites. The moon-probe inversion was roughly one bad night per site per year — invisible at 7 sites, several wrong site-nights per refresh at 300.

**5. `localStorage` does not scale.** Measured 10.8 KB per site cached. 200 sites ≈ 2.1 MB; 800 ≈ 8.4 MB, past the ~5 MB quota, and parsing is synchronous on the main thread.

**6. The fan-out recompute is quadratic.** `tonightScores` reads the whole forecast `Map`, and `storeForecast` replaces that Map on every arriving forecast — so each arrival re-scores every site. Per-site scoring is 0.405 ms, so one pass over 800 sites is 332 ms, but the worst case at 200 sites is ~16 s of main-thread work. Batch arrivals, or key each site's score off only its own forecast.

---

## Known issues carried over from v1

- **`MapView` does four jobs** — Leaflet host, marker manager, overlay toggle, and it owns ~100 lines of detail-panel template, with no input/output boundary. Split into a dumb `map-canvas` and a separate `site-panel`.
- **`WeatherService`'s constructor** loads `manitoulin-eco-park` into an unused local and discards it. It non-null-asserts a specific site and will **throw at boot** the moment that site leaves the dataset. Delete it.
- **Map viewport is hardcoded** to Toronto (`center: [43.65, -79.38], zoom: 8`). Derive from the site set's bounds.
- **Design tokens** — `--hline`, `--hpitch`, `--moon-ink` are used only as inline fallbacks and never declared; `--cloud-ink` is only set by the density classes. Declare all four in `:root`. Also a tier-colour collision: markers and the score chip use `--poor`, but the week-dot uses `--redshift`, which is simultaneously the selection accent. Pick one.
- **The week strip hardcodes 7 days** and an English-only `dayLabels` array indexed by weekday.
- **`getMoonOverlap` discards event kind.** All four rise/set events are pushed into one `DateTime[]` and the walk merely toggles — which is _why_ a bad seed inverts the whole window. Carry `{ at, kind: 'rise' | 'set' }` so each event sets absolute state; a bad seed would then only affect the stretch before the first event.
- **Accessibility** on the mobile sheet: no `aria-expanded`, the label never flips between Expand/Collapse, no focus trap, no Esc-to-close.
- **`map-view.scss` is 4.79 kB** against a 4.00 kB warn budget. Splitting `MapView` fixes it.
- **Leaflet is CommonJS**, which costs some build optimization. Expected; nothing to do short of replacing Leaflet.

---

## Testing conventions (inherited, worth keeping)

- Section banners: `// ── LAYER 1: property/invariant tests ──`, `// ── LAYER 2: accuracy against independent sources ──`.
- Narrow unions by throwing, not by `!`: `if (!w.hasTrueDarkness) throw new Error('expected darkness');`
- Accuracy tests assert against **named external sources** within a tolerance, rather than golden values.
- Local factory helpers over shared fixture files.
- **Build dates with `Date.UTC`**, never local-time constructors — the latter mean a different instant on every machine and will pass on a UTC CI runner while a timezone bug is live.
- **Fixtures use round numbers on purpose.** The night-strip tests use an exact 8-hour civil axis so every expected percentage is a clean eighth; a failure then tells you _which_ boundary moved.

### Mutation testing is the standard here

Every test written for the v1 fixes was verified by deliberately breaking the code and confirming the test failed. This is not optional ceremony — it caught two tests that asserted less than their names claimed, and one broken measurement harness that reported "zero failures" for a mutation already watched to fail.

**Apply mutations one at a time.** Batched mutations mask each other: in one run a mutation appeared uncaught, and re-running it alone showed the test did catch it — a second mutation had coincidentally hidden the first.

---

## Roadmap

1. **Scaffold** — CI (`npm ci && build && test && format:check`), `public/_redirects` and `_headers`, one formatting commit. v1 had prettier installed but never run, so files are split between 2- and 4-space indentation.
2. **Domain model** — the `ObservingNight` type.
3. **Global site dataset** — DarkSky International certified places (~270, 22 countries) plus RASC's 28 Canadian sites, ≈300 total. Certification _is_ the curation rule.
4. **Precompute pipeline** — scheduled job runs the pure engines in Node, writes static JSON.
5. **Client** — viewport queries, canvas markers, split `MapView`.

### On the dataset build

Sources are **structured, not scraped**: Wikidata SPARQL (free, keyless, returns coordinates, designations, official sites), the DarkSky registry, OSM Overpass, RASC's list. HTML scraping is only for the long tail, which is where quality collapses.

**A model must never produce a fact.** Coordinates, timezone (`tz-lookup` on lat/lng), Bortle (sample the light-pollution raster), and drive distances all come from deterministic sources. A hallucinated coordinate does not error — it silently produces a confident forecast for the wrong place, which is the worst failure this product can have.

LLM judges are for arbitration and prose only: deduplication across sources, normalizing descriptions, classifying site type, flagging "this is a hotel marketing page, not a public site" — **with abstention**. Disagreement or low confidence means quarantine for human review, never majority-wins. Ship a fixed eval set so judge changes can be measured.

---

## Decision records

Non-obvious decisions go in `docs/decisions/` as short ADRs. See that folder's README for the format.
