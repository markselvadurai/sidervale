// Parsers for DarkSky International's places registry (WP REST + FacetWP marker blob).

import { decodeEntities, textOf } from './html';

export type LatLng = { lat: number; lng: number };

export type DarkskyPost = {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  class_list: string[];
  content: { rendered: string };
};

export type DarkskyPlace = {
  postId: number;
  slug: string;
  name: string;
  url: string;
  categories: string[];
  countries: string[];
  designatedYear: number | null;
  categoryText: string | null;
  areaText: string | null;
  status: 'certified' | 'lodging' | 'uncategorized';
};

export type DarkskySnapshot = {
  source: 'darksky.org';
  harvestedAt: string;
  places: (Omit<DarkskyPlace, 'status'> & { coordinates: LatLng | null })[];
  excluded: { slug: string; reason: string }[];
  quarantine: { slug: string; reason: string }[];
};

const LODGING = 'darksky-approved-lodging';

export function parseFwpMarkers(html: string): Map<number, LatLng> {
  const at = html.indexOf('window.FWP_JSON');
  if (at === -1) throw new Error('FWP_JSON blob not found in page');
  const start = html.indexOf('{', at);
  const blob = JSON.parse(html.slice(start, jsonEnd(html, start)));
  const locations = blob?.preload_data?.settings?.map?.locations;
  if (!Array.isArray(locations)) throw new Error('FWP_JSON blob has no map.locations');
  return new Map(
    locations.map((l: { post_id: number; position: LatLng }) => [
      l.post_id,
      { lat: l.position.lat, lng: l.position.lng },
    ]),
  );
}

/** Index one past the brace that closes the object opening at `start` (string-aware). */
function jsonEnd(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  throw new Error('FWP_JSON blob is unterminated');
}

function factBox(content: string, heading: string): string | null {
  const m = content.match(new RegExp(`<h3>\\s*${heading}\\s*</h3>\\s*<p>([^<]*)`, 'i'));
  return m ? textOf(m[1]) : null;
}

export function parseDarkskyPlace(post: DarkskyPost): DarkskyPlace {
  const categories = post.class_list
    .filter((c) => c.startsWith('idsp_type-'))
    .map((c) => c.slice('idsp_type-'.length));
  const countries = post.class_list
    .filter((c) => c.startsWith('locations_terms-'))
    .map((c) => c.slice('locations_terms-'.length));
  const designated = factBox(post.content.rendered, 'Designated');
  const yearMatch = designated?.match(/\d{4}/);

  return {
    postId: post.id,
    slug: post.slug,
    name: decodeEntities(post.title.rendered).trim(),
    url: post.link,
    categories,
    countries,
    designatedYear: yearMatch ? Number(yearMatch[0]) : null,
    categoryText: factBox(post.content.rendered, 'Category'),
    areaText: factBox(post.content.rendered, 'Area'),
    status: categories.includes(LODGING)
      ? 'lodging'
      : categories.length === 0
        ? 'uncategorized'
        : 'certified',
  };
}

export function buildDarkskySnapshot(
  posts: DarkskyPost[],
  markers: Map<number, LatLng>,
  harvestedAt: string,
): DarkskySnapshot {
  const parsed = posts.map(parseDarkskyPlace);
  const certified = parsed
    .filter((p) => p.status === 'certified')
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return {
    source: 'darksky.org',
    harvestedAt,
    places: certified.map(({ status, ...p }) => ({
      ...p,
      coordinates: markers.get(p.postId) ?? null,
    })),
    excluded: parsed
      .filter((p) => p.status !== 'certified')
      .map((p) => ({ slug: p.slug, reason: p.status })),
    quarantine: certified
      .filter((p) => !markers.has(p.postId))
      .map((p) => ({ slug: p.slug, reason: 'no-coordinates' })),
  };
}
