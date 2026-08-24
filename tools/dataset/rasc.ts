// Parsers for RASC's dark-sky sites table and the Google My Maps KML it links.

import { LatLng } from './darksky';
import { decodeEntities, textOf } from './html';

export type RascSite = {
  name: string;
  orgUrl: string | null;
  provinces: string[];
  year: number | null;
  program: 'dark-sky-preserve' | 'urban-star-park' | 'nocturnal-preserve' | 'other';
  typeText: string;
  rascUrl: string | null;
};

export type KmlPin = { name: string } & LatLng;

export type RascSnapshot = {
  source: 'rasc.ca';
  harvestedAt: string;
  sites: (RascSite & { coordinates: LatLng | null; parcels: KmlPin[] })[];
  unmatchedPins: KmlPin[];
  quarantine: { name: string; reason: string }[];
};

const PROGRAMS = [
  ['dark-sky preserve', 'dark-sky-preserve'],
  ['urban star park', 'urban-star-park'],
  ['nocturnal preserve', 'nocturnal-preserve'],
] as const;

function programOf(typeText: string): RascSite['program'] {
  const t = typeText.toLowerCase();
  return PROGRAMS.find(([needle]) => t.includes(needle))?.[1] ?? 'other';
}

export function parseRascTable(html: string): RascSite[] {
  const table = (html.match(/<table[^>]*>[\s\S]*?<\/table>/g) ?? []).find((t) =>
    t.includes('Dark-Sky Site'),
  );
  if (!table) throw new Error('dark-sky sites table not found');

  const rows = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  return rows
    .map((row) => row.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? [])
    .filter((cells) => cells.length >= 5)
    .map((cells) => {
      const orgHref = cells[0].match(/href="([^"]*)"/)?.[1] ?? null;
      const rascHref = cells[4].match(/href="([^"]*)"/)?.[1] ?? null;
      const typeText = textOf(cells[3]);
      const yearMatch = textOf(cells[2]).match(/\d{4}/);
      return {
        name: textOf(cells[0]),
        orgUrl: orgHref?.startsWith('http') ? orgHref : null,
        provinces: textOf(cells[1])
          .split('/')
          .map((p) => p.trim())
          .filter(Boolean),
        year: yearMatch ? Number(yearMatch[0]) : null,
        program: programOf(typeText),
        typeText,
        rascUrl: rascHref?.startsWith('http') ? rascHref : null,
      };
    });
}

export function parseKmlPlacemarks(kml: string): KmlPin[] {
  const placemarks = kml.match(/<Placemark>[\s\S]*?<\/Placemark>/g) ?? [];
  return placemarks.map((pm) => {
    const rawName = pm.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? '';
    const coords = pm.match(/<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/)?.[1];
    if (!coords) throw new Error(`placemark without coordinates: ${rawName}`);
    // KML order is lng,lat[,alt] — the reverse of every other source here.
    const [lng, lat] = coords.split(',').map(Number);
    const name = textOf(rawName.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, ''));
    return { name, lat, lng };
  });
}

/** Lowercased, diacritic- and punctuation-free key for prefix matching; & ≡ and. */
function normKey(s: string): string {
  return s
    .replace(/&/g, ' and ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function commonPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

const MIN_MATCH = 8;

export function matchPinsToSites(
  sites: RascSite[],
  pins: KmlPin[],
): { parcelsBySite: Map<string, KmlPin[]>; unmatchedPins: KmlPin[] } {
  const keys = sites.map((s) => normKey(s.name));
  const parcelsBySite = new Map<string, KmlPin[]>();
  const unmatchedPins: KmlPin[] = [];

  for (const pin of pins) {
    const pinKey = normKey(pin.name);
    const scores = keys.map((k) => commonPrefixLength(pinKey, k));
    const best = Math.max(...scores);
    const winners = scores.filter((s) => s === best).length;
    if (best < MIN_MATCH || winners > 1) {
      unmatchedPins.push(pin);
      continue;
    }
    const site = sites[scores.indexOf(best)];
    parcelsBySite.set(site.name, [...(parcelsBySite.get(site.name) ?? []), pin]);
  }
  return { parcelsBySite, unmatchedPins };
}

export function buildRascSnapshot(
  sites: RascSite[],
  pins: KmlPin[],
  harvestedAt: string,
): RascSnapshot {
  const { parcelsBySite, unmatchedPins } = matchPinsToSites(sites, pins);

  const withCoords = sites.map((site) => {
    const parcels = parcelsBySite.get(site.name) ?? [];
    return {
      ...site,
      parcels,
      coordinates: parcels.length === 1 ? { lat: parcels[0].lat, lng: parcels[0].lng } : null,
    };
  });

  return {
    source: 'rasc.ca',
    harvestedAt,
    sites: withCoords,
    unmatchedPins,
    quarantine: withCoords
      .filter((s) => s.coordinates === null)
      .map((s) => ({
        name: s.name,
        reason: s.parcels.length === 0 ? 'no-coordinates' : 'multi-parcel',
      })),
  };
}
