// Minimal HTML text utilities for the harvesters — enough for these two sources, no DOM.

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: ' ' };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m);
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

/** Tag-stripped, entity-decoded, whitespace-collapsed text of an HTML fragment. */
export function textOf(fragment: string): string {
  return decodeEntities(stripTags(fragment))
    .replace(/[\s ]+/g, ' ')
    .trim();
}
