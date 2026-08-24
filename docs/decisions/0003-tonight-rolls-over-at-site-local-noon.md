# 0003 — "Tonight" rolls over at site-local noon

**Status:** amended 2026-08-24 — see below
**Date:** 2026-08-24

> **Amendment (same day):** Mark revised the boundary after the 10am pushback: the morning dead zone
> was real, so "tonight" now advances at **sunrise**, not noon — "current night if possible, else
> next night." This lives in `currentObservingNight` (engines, where SunCalc is allowed), while the
> model's `observingNightOf` keeps the noon rule as the never-undefined fallback for polar day/night,
> where suncalc reports no sunrise. The original record below stands as written; only the boundary
> choice was superseded. The UI-labeling requirement carries over unchanged.

## Context

`observingNightOf(site, now)` decides which night a clock instant belongs to. v1's `siteToday` used
the site-local calendar day, so at 3:30am it named the night _beginning that evening_ — while the
user was standing under the night that began yesterday. Going global makes the pre-dawn hours a
mainstream case, not an edge: they are exactly when field users open the app.

## Options

1. **Calendar-day (v1 semantics).** Simple, but mislabels every pre-dawn use.
2. **Dawn-based boundary.** Matches intuition best, but needs SunCalc in the model layer, and has
   no defined answer at high latitudes in June, when there is no dawn event at all.
3. **Noon-to-noon observing day.** Chosen. Before site-local noon an instant belongs to the night
   that began yesterday; from noon onward, to the coming night.

## Decision

Option 3, implemented as `now.setZone(site.timezone).minus({ hours: 12 }).toISODate()`. This is the
standard astronomical convention — Julian dates roll over at noon for precisely this reason — so it
is defensible, deterministic, and never undefined. Decided with Mark on 2026-08-24; his condition:
the UI must make the labeling visible so "tonight" is never ambiguous to the user.

## Consequences

- Pre-dawn users see the night in progress. This diverges from `siteToday`, which still carries v1
  semantics until it is retired during the engine integration.
- The morning dead zone (dawn to noon) labels the _finished_ night as "tonight." Any answer is stale
  there; this one is at least honest about which night it describes. The UI labeling requirement
  covers this window.
- The boundary is pinned from both sides in tests (11:59 → yesterday, 12:00 → today), and off-by-one
  mutations of the shift are caught.
