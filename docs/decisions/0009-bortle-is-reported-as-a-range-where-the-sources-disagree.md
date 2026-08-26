# 0009 — Bortle is reported as a range wherever the published mappings disagree

**Status:** accepted
**Date:** 2026-08-26

## Context

Both design returns put a Bortle chip on every site: on ranked rows, in the site card, and as an
axis under the light-pollution legend. It is the vocabulary amateur astronomers actually think in,
and we hold a modelled sky brightness (`brightness.mpsas`) for all 293 sites, so the chip looked
like pure presentation over data we already own.

Researching the conversion changed that. Three things, each verified rather than assumed:

1. **Bortle's scale defines no numbers.** The 2001 _Sky & Telescope_ article is a **visual**
   scale — naked-eye limiting magnitude, whether the Milky Way casts a shadow, what colour the
   sky is near the horizon. Every mag/arcsec² boundary in circulation was attached later by
   someone else.
2. **The later mappings disagree.** Wikipedia's table (SQM column credited to Dark Skies
   Awareness) floors class 1 at 21.76 and class 2 at 21.6; a widely-republished variant floors
   them at 21.7 and 21.5. A third table found in search (21.89 / 21.69) could not be corroborated
   and was dropped rather than averaged in.
3. **The disagreement is wider than the bands it divides.** Class 2 spans 21.6–21.76 — **0.16
   mag** — while the sources differ by up to ~0.1 mag about where each of its edges sits.

Stacked on top: our mpsas is _modelled_ from the Lorenz atlas, not metered, and SQM itself is
documented as losing accuracy darker than ~21.5 — which is precisely where dark-sky sites live.
46% of our dataset sits in class 1.

A chip reading a confident "Bortle 1" on 135 sites would therefore be false precision, on a scale
whose own author never defined the number and whose interpreters do not agree.

## Options

- **A single class from one cited table** — "Bortle 2", as the first mockup shows. The obvious
  choice, and the one a reasonable person would assume. Rejected: a 21.65 site is class 2 under
  one published table and class 3 under another, and nothing on screen would admit it.
- **A single class with an approximation marker** — "Bortle ≈2". Simplest engine, and one
  character carries the epistemics. Rejected as still understating: the ambiguity is concentrated
  at the dark end, where nearly all our sites are.
- **A symmetric ±0.1 mag margin around each boundary.** Rejected on measurement: it ranges 42% of
  the dataset (74% at ±0.2), because it widens on both sides of a boundary rather than only
  across the span the sources actually dispute.
- **Don't derive Bortle at all** — keep the exact mpsas and the Lorenz zone, both primary values
  from the atlas we sample. The most defensible option, and the one to fall back to if the chip
  ever proves misleading. Rejected because it drops the vocabulary both mockups use and most
  amateur astronomers think in.
- **Range where two published tables disagree.** Chosen.

## Decision

**Carry two published tables and report the class as a range wherever they disagree.**
`bortleFor(mpsas)` in `src/app/engines/bortle.ts` classifies under both and returns
`{ low, high, label }`; `bortleText` renders `Bortle 1` when they agree and `Bortle 1–2` when they
do not. Measured against the real dataset: **87% of sites read as a single class, 13% as a range**
— which is also, unprompted, the form the second mockup used ("Bortle 2–3").

The range is not a margin we invented. It **is** the disagreement, so it narrows on its own if a
better-attested table ever replaces one of these.

Three smaller calls, all in service of not overstating:

- **The label describes the _worse_ sky of an ambiguous pair.** Given 1–2 we say "Typical truly
  dark site", never "Excellent dark-sky site". We do not promise the darker of two skies we
  cannot tell apart.
- **Wikipedia's half-step "4.5" row is folded into 4.** Bortle is an integer scale; a chip
  reading "Bortle 4.5" would invent a class he never wrote.
- **Class titles are quoted from the cited table**, not paraphrased, because the names vary
  between sources too.

The exact modelled mpsas stays on screen beside the chip. The precise number is always available;
the chip is the human-readable gloss, and is allowed to be honestly vague.

## Consequences

- **The ranked list gains a dimension the score does not have.** `computeScore` takes darkness
  hours, moon overlap, moon illumination and cloud — it never sees sky brightness. A site can
  score 89 under a Bortle 4 sky, and until now nothing in the row said so.
- **A non-finite mpsas throws** rather than silently classifying as inner-city. That is a dataset
  defect and the pipeline's quarantine discipline should catch it upstream; failing loudly here
  keeps a bad row from rendering as a confident fact.
- **Classes 8 and 9 are unreachable with today's data** (the dataset floor is 18.01 mag, which is
  class 7). The bands exist for totality and are covered by tests, not by real sites.
- **This is a `reference`-grade dependency on two web pages.** Both are cited inline with the date
  they were read. If either changes, the engine does not — the numbers are copied into the
  source, not fetched.
- **Not done: a measured comparison.** The honest next step, if Bortle ever needs to be load
  bearing, is to check a handful of sites against published SQM _readings_ (DarkSky certification
  documents often contain them) rather than against another table. That would test the atlas
  model, not just the mapping.
