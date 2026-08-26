/** A Bortle reading: one class, or the two the published mappings cannot separate. */
export type BortleReading = { low: number; high: number; label: string };

// John E. Bortle's 2001 Sky & Telescope scale is VISUAL — it defines no sky-brightness
// numbers at all. Every mag/arcsec² boundary here comes from a later mapping, and the
// published mappings differ, so we carry two and report a range wherever they disagree.
//
//   A — Wikipedia's table, SQM column credited to Dark Skies Awareness (read 2026-08-26);
//       corroborated by the EFSEC sky-glow appendix at 21.75 / 21.60 / 21.30.
//   B — a widely-republished variant (pallie.ai, read 2026-08-26). Not an authority: it is
//       here to expose boundary ambiguity, not to arbitrate it. Its published bright end is
//       self-contradictory (class 6 and 7 ranges overlap), so below 19.1 both tables agree.
//
// Uncalibrated against measurement, twice over: our mpsas is MODELLED from the Lorenz atlas
// rather than metered, and SQM itself loses accuracy darker than ~21.5 — which is exactly
// where most dark-sky sites sit. Wikipedia's half-step "4.5" row is folded into 4; Bortle
// is an integer scale and a chip reading "Bortle 4.5" would invent a class he never wrote.
const TABLE_A: [number, number][] = [
  [21.76, 1],
  [21.6, 2],
  [21.3, 3],
  [20.3, 4],
  [19.25, 5],
  [18.5, 6],
  [18.0, 7],
  [17.0, 8],
  [-Infinity, 9],
];

const TABLE_B: [number, number][] = [
  [21.7, 1],
  [21.5, 2],
  [21.3, 3],
  [20.4, 4],
  [19.1, 5],
  [18.5, 6],
  [18.0, 7],
  [17.0, 8],
  [-Infinity, 9],
];

/** Class titles as tabulated in source A, so the words are cited too, not paraphrased. */
const LABELS: Record<number, string> = {
  1: 'Excellent dark-sky site',
  2: 'Typical truly dark site',
  3: 'Rural sky',
  4: 'Brighter rural',
  5: 'Suburban sky',
  6: 'Bright suburban sky',
  7: 'Suburban/urban transition',
  8: 'City sky',
  9: 'Inner-city sky',
};

function classify(table: [number, number][], mpsas: number): number {
  const band = table.find(([floor]) => mpsas >= floor);
  // the -Infinity floor makes this unreachable for any real number; NaN is a dataset defect
  if (!band) throw new Error(`cannot classify a non-finite mpsas: ${mpsas}`);
  return band[1];
}

/** Bortle class from modelled zenith brightness — a range where the sources disagree. */
export function bortleFor(mpsas: number): BortleReading {
  const a = classify(TABLE_A, mpsas);
  const b = classify(TABLE_B, mpsas);
  const high = Math.max(a, b);
  // label the WORSE sky of an ambiguous pair — never promise the darker of the two
  return { low: Math.min(a, b), high, label: LABELS[high] };
}
