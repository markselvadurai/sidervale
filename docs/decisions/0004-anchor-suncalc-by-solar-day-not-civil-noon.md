# 0004 — Anchor suncalc by the night's solar day, not civil noon

**Status:** accepted
**Date:** 2026-08-24

## Context

Since v1, the engine handed suncalc "noon in the site's timezone" to name a night, and the belief
"noon is the one local hour that never crosses the UTC-day seam" was written into a comment. An
adversarial review of the ObservingNight integration refuted it by execution: suncalc 2.0.1 resolves
"which day" from the **UTC calendar day** of the Date it receives, and for civil offsets past UTC+12
at **east** longitude, local noon of day D is ~23:00Z on D−1. At Aoraki/Mt Cook (Pacific/Auckland,
NZDT = UTC+13, lng 170°E) every night labeled D got night D−1's darkness window, and "tonight"
flipped at midnight instead of sunrise — all southern summer, at sites the global dataset will
certainly include. Kiritimati (UTC+14 but **west** longitude) self-corrects, which is why the
existing tests never caught it.

## Decision

The engine anchors suncalc calls at the **mean-solar-transit instant nearest the site's civil noon**
on the night's date (`solarAnchor` in `engines/astronomy.ts`): transit phase `12h − lng/15` UTC,
snapped to the nearest whole solar day from the night's civil noon. This is the
threshold-comes-from-the-dependency rule again, one level up: suncalc thinks in solar days, so the
anchor must be expressed in its terms, not in civil-clock terms.

`noonOf` keeps civil-noon semantics — it names calendar days for labels and week arithmetic, where
civil time is correct. Only the suncalc boundary uses `solarAnchor`.

Also fixed in the same pass: `observingNightOf`'s noon rule became a wall-clock comparison
(`hour < 12`) — the previous `minus({ hours: 12 })` was exact-time arithmetic that rolled over at
11:00/13:00 local on DST transition days.

## Consequences

- New tests pin both regimes: Aoraki (UTC+13 east, previously wrong) and Kiritimati (UTC+14 west,
  previously right). Longitude-sign and rounding mutations of `solarAnchor` are caught.
- The equation of time (±16 min around the mean transit) is ignored; the snap is to whole days, so
  a 16-minute error cannot move the anchor across one.
- v1 (Nocturne) shares the civil-noon anchor but is Ontario-only, where it is correct; v1 stays
  frozen, no backport.
- Lesson recorded: the false comment survived one full review cycle because every fixture was
  west-of-Greenwich. Fixture diversity is coverage.
