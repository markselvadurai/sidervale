# 0007 — The design overhaul lands in phases, and accounts leave the v2.0 scope lock

**Status:** accepted
**Date:** 2026-08-25

## Context

A UI overhaul was commissioned from Claude Design against a written brief (`docs/DESIGN-BRIEF.local.md`).
It came back as three "turns" that are not the same kind of work: turn 1 (artboards 1a–1f) is a
restyle of what ships; turn 2 adds drive-time "reach", a ranked list, a night scrubber and an events
ribbon; turn 3 adds accounts, sync, alerts and an observing profile that re-weights the score.

A 12-agent review read every artboard and checked all 71 proposals against the repository:
**29 ready, 36 needs work, 19 blocked** (`docs/DESIGN-INTAKE.local.md`). The blocked set is not a
matter of effort — five items need data that does not exist in any of the 293 records, one needs a
backend, and five violate a constraint that fails silently in production.

The brief did not carry `HANDOFF.local.md` §4, which defers accounts, alerts and sky-event overlays
from v2.0 by name. The design therefore proposed all three in good faith.

## Options

- **Take the design wholesale.** Rejected: a fifth of it cannot be built as drawn, and two of the
  most prominent pieces (drive time, accounts) each imply infrastructure the project does not have.
- **Take turn 1 only and discard turns 2–3.** Rejected: the review found that the ranked list — the
  single highest value-per-hour item in the return — is buildable today from data already in the
  artifact, and would have been thrown away with the rest of turn 2.
- **Phase it by what the data and hosting can already support.** Chosen.

## Decision

**Direction and type.** Artboard **1b (airglow)** is the visual target. Typography stays **Archivo +
IBM Plex Mono**; the design's proposed Inter is declined — the current pairing is more distinctive
for a product positioned as an instrument, and a competitor defaulting to Inter is likely. The
design's type _scale_, radius scale and component specs (1f) are adopted.

**Phase A — restyle.** Turn 1 plus the accessibility and defect findings the review turned up in the
shipped app. Gated behind regression coverage: `site-panel.spec.ts` carried two assertions against a
component the restyle rewrites, so the coverage lands first. That gate immediately proved itself —
it surfaced a live defect where darkless week-strip days rendered a bare `<div>`, missing both
`.score-label` and the `--active` binding their siblings carry, so they could never show as selected.

**Phase B — features needing no new data.** The ranked list without its drive-time column (the
artifact already carries score, tier, cloudAvg, coverage, moonIllumination, moonOverlapMinutes,
darkStart and darkEnd for all 293 sites × 7 nights); the BEST / BRIGHT TARGETS / PACK UP night-window
breakdown; a directions handoff; a device-local watchlist under the `sidervale:` namespace.

**Phase C — accounts.** The v2.0 scope lock on accounts is **lifted**. The backend architecture is a
separate decision and is deliberately not made here — a follow-up record will carry it. Note that
accounts do **not** collide with the Open-Meteo non-commercial constraint; only monetising them
would, and that decision has not been taken.

**Not adopted, with reasons.** Drive time, leave/arrive hours and "dark left on arrival" (no road
data in any record, no routing host in the CSP, no backend to hold a key). Location search (no
gazetteer; every geocoder is a blocked host). Phosphor icons (refused twice by `style-src` and
`font-src`; inline SVG instead — never widen `_headers` for icons). The 1c graticule (a fixed-pixel
screen grid that does not pan or scale). Eclipse entries in the events ribbon (suncalc 2.0.1 does no
eclipse computation; any date shown would be invented). The six hard-coded map labels (no prominence
field exists to derive the set from). The per-hour scrubber (no hourly data for 292 of 293 sites).
Red-light mode **as drawn** — measured on the mock's own `#0a0405` ground, poor `#7d332c` is 2.31:1
and darkless `#6b2b24` is 1.93:1, both under the 3:1 non-text floor for the marker ring; and
`#ff7a68` emits enough green and blue to defeat dark adaptation, which is the feature's entire
premise. The concept is kept; the palette is not.

## Consequences

- Direction 1b introduces motion in four places. The app has **no** `prefers-reduced-motion` guard
  today; one is now required, not optional.
- Lifting the accounts lock adds a backend, an ops burden and a recurring cost to a project that has
  had none of the three. It also puts a promise in the sign-in modal — "NO TRACKING" — that the
  chosen vendor must actually let us keep.
- Phase B ships a watchlist that lives only on the device. If accounts arrive later, that data must
  migrate rather than be silently replaced.
- The ranked list depends on joining the artifact (keyed by site id, carrying no names or
  coordinates) against `sites.json`. The two loads fail independently, so the list needs a defined
  state for "scores loaded, sites did not" and its inverse.
- Turn 3's artboard 3b renders a real email address and usage counts. It must be replaced with a
  placeholder before that project is shared further.
