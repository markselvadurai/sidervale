# Decision records

Short records of decisions that were not obvious, so the reasoning survives the moment.

Nocturne v1 kept these as a numbered list in its README. That worked at seven sites and one developer; it won't hold for a repo where much of the code is AI-directed and the author needs to defend every choice cold, months later. One file per decision, numbered, never edited after the fact — supersede instead.

## Format

`NNNN-short-kebab-title.md`, four sections, short:

```markdown
# NNNN — Title

**Status:** accepted | superseded by NNNN
**Date:** YYYY-MM-DD

## Context

What forced a decision. The constraint, the bug, the measurement.

## Options

What was actually considered, including the one a reasonable person would assume.

## Decision

What was chosen, and the specific reason the alternatives lost.

## Consequences

What this costs, what it rules out, what to watch for.
```

## What earns a record

- Anything where the obvious choice was rejected — those are the ones you will be asked about.
- Anything where a measurement changed the answer. Cite the number.
- Anything a future reader would otherwise "clean up" without realising it was load-bearing.

Not: routine implementation, or decisions the code already states plainly.

## A note on honesty

If a decision turns out to be wrong, or a test proves weaker than it looked, **amend the record rather than quietly fixing it**. v1's log documents a fix that was applied to one of four call sites and was machine-timezone-dependent besides; that entry is more useful than a tidy one would have been, and it is the entry most likely to start a good conversation in an interview.
