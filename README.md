# Sidervale

**Which dark-sky site is worth the drive tonight — and if not tonight, which night this week?**

Sidervale computes the true-darkness window, moon interference, and cloud cover for 293 certified dark-sky destinations worldwide, fuses them into a single 0–100 score, and answers the only question that matters before a three-hour drive: _go, or wait for Thursday._

**Live at [sidervale.com](https://sidervale.com).**

> **Status: beta.** The global dataset, the scoring engines, and the precompute pipeline are live; mobile builds are the next milestone. Sidervale is the global successor to [Nocturne](https://nocturne.markselvadurai.com), which covered seven Ontario sites.

---

## Why this exists

The astronomy-weather category is mature but oddly shaped. Most apps are either planetariums that bolted on a forecast, or dense hourly grids aimed at people with a telescope in the back garden. Almost none answer the question a traveller actually has — not _what will the sky be like here_, but **which of these places should I drive to, and on which night**.

The North American leader states publicly that it has no plans to work outside the US and Canada. The closest analogues elsewhere are iOS-only. Web and Android are open, and so is the destination framing.

## How it works

Three layers, strictly ordered: **pure engines → a reactive store → derived display state.** Nothing downstream recomputes what upstream owns.

### Engines (`src/app/engines/`)

Pure functions. No Angular, no DOM, fully unit-tested — which is what lets the same code run in the browser _and_ server-side in the precompute pipeline, unchanged.

- **`siteToday(site, now?)`** — noon on the site's current calendar day. Takes `now` as a parameter so it is testable without faking a clock.
- **`getDarknessWindow(site, date)`** — the astronomical-darkness window (sun below −18°) plus civil twilight boundaries (−6°), for the night _starting on_ a given date. Anchors the incoming instant to noon **in the site's timezone**, because an observing night is a local calendar concept: SunCalc resolves a night from the UTC day of the `Date` it is handed, so an evening instant would otherwise name tomorrow's night. Nights with no true darkness (high latitudes in summer) are a first-class state, not an error.
- **`getMoonOverlap(site, window)`** — how much of any window the moon is above the horizon, via a state-machine walk over rise/set events. The initial up/down probe uses SunCalc's own criterion — upper limb clear of the horizon, centre altitude ≈ −0.35° — rather than a hand-tuned threshold, because a probe that disagrees with the event stream inverts the parity of the entire walk.
- **`avgCloudDuring(forecast, window)`** — mean cloud cover across a window, reporting coverage so partial data is distinguishable from complete data.
- **`computeScore(...)`** — the fusion.

### The scoring model

```
score = 100 × f(darkness) × g(moon) × h(clouds)
```

- **f — darkness duration**: a clamped ramp with a floor of 0.85. A short window isn't proportionally bad, it's disqualifying, so duration can only move the score by 15%.
- **g — moon penalty**: `1 − 0.7 × overlap × illumination`. A full moon up all night costs 70%, never 100% — bright targets survive moonlight, faint ones don't.
- **h — cloud penalty**: `(1 − cover/100)^1.25`. The exponent makes mid-range cloud hurt more than linearly. 100% cloud is a hard gate: score 0 regardless of everything else.
- With no forecast available the score is `100 × f × g`, flagged, and rendered in a muted "astronomy only" style rather than hiding a working degraded mode.

**Calibration honesty:** the ramp and both exponents are reasoned estimates, not fitted parameters. `k = 1.25` in particular is a field-calibration candidate.

Tier thresholds: **≥65 clear · 35–64 marginal · <35 poor**, shared by every consumer from one function.

## The dataset

293 sites, built from certified-place registries — [DarkSky International](https://darksky.org/)'s place directory and the [RASC](https://rasc.ca/) dark-sky site list — then enriched with per-site timezone and sky brightness sampled from the Lorenz 2024 atlas. The pipeline is an offline batch under [`tools/dataset/`](tools/dataset/README.md): harvest → merge → enrich → emit, each stage tested, with raw snapshots committed so reruns diff meaningfully and downstream stages reproduce without network access. Sites the sources can't place unambiguously (multi-parcel preserves, missing coordinates) are quarantined for a human decision, never guessed.

That pipeline README also records the rules the sources taught us — Google Maps embeds off by 340 km, KML shipping coordinates as `lng,lat` — and is worth reading on its own.

## The precompute loop

Scoring every site for every night in the browser would spend each visitor's first seconds recomputing the same answers. Instead, a [GitHub Actions workflow](.github/workflows/precompute.yml) runs the **same engine code** server-side every 3 hours and force-pushes a single `scores.json` artifact to an orphan `data` branch — one commit deep, no history growth. The client fetches that artifact, judges its freshness at read time against the live clock, and if it's stale or unreachable falls back to astronomy-only scoring computed locally. The degraded mode is designed, not accidental.

CI runs the test suite under a timezone matrix — `UTC` and `America/Toronto` — because a UTC-only runner hides exactly the day-seam bugs this project exists to get right.

## Lineage

Sidervale is a deliberate fork, not a rewrite. Nocturne v1 was hand-built and is frozen at its `v1.0` tag as a record of that; its README carries the full decision log, including two bugs whose fixes are inherited here:

- **The UTC day-seam.** Resolving "which night" from a `Date` is ambiguous, and the ambiguity bites hardest in the evening hours when people actually open a stargazing app. Fixed by anchoring in the site's timezone inside the engine.
- **The moon-probe parity inversion.** Paraphrasing a dependency's threshold instead of using its own criterion produced a dead band that reported moonless nights with the moon up throughout.

Both lessons shaped this codebase: the engine owns _which night you meant_, and thresholds come from the source they must agree with.

Significant choices since the fork are recorded in an internal decision log — including the ones that turned out wrong: later records correct earlier reasoning in place rather than rewriting it.

## Stack

Angular 21 (signals-first, standalone) · TypeScript · MapLibre GL on [OpenFreeMap](https://openfreemap.org/) vector tiles (keyless — a test asserts the basemap URL carries no credential) · SunCalc (pinned) · Luxon · Open-Meteo · Vitest.

Requires Node ≥ 22.12.

```bash
npm install
npm start          # dev server
npm test           # engine + component suites
npm run format     # prettier
```

Dataset and precompute tooling has its own scripts — see [`tools/dataset/README.md`](tools/dataset/README.md) and [`tools/precompute/README.md`](tools/precompute/README.md).

## Attribution

Site registry from [DarkSky International](https://darksky.org/) and the [Royal Astronomical Society of Canada](https://rasc.ca/). Light-pollution overlay tiles and site sky-brightness data from the [David Lorenz world atlas](https://djlorenz.github.io/astronomy/lp/) (2024 edition). Weather data from [Open-Meteo](https://open-meteo.com/) (CC BY 4.0, non-commercial). Basemap by [OpenFreeMap](https://openfreemap.org/) © [OpenMapTiles](https://openmaptiles.org/), data from © OpenStreetMap contributors.
