// Deterministic name normalization shared by pin-matching and cross-source dedup.

/** Lowercased, diacritic- and punctuation-free key for prefix matching; & ≡ and. */
export function normKey(s: string): string {
  return s
    .replace(/&/g, ' and ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** URL-safe stable id from a display name. */
export function slugify(name: string): string {
  return name
    .replace(/&/g, ' and ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
