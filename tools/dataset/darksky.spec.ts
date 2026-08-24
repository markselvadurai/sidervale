import { describe, expect, it } from 'vitest';
import { buildDarkskySnapshot, DarkskyPost, parseDarkskyPlace, parseFwpMarkers } from './darksky';

// Mirrors the real page: window.FWP_JSON = {...}; inline in a script tag.
const FWP_HTML = `<script>window.FWP_JSON = {"prefix":"fwp_","preload_data":{"settings":{"map":{"locations":[{"position":{"lat":-26.149607,"lng":20.257002},"post_id":11881},{"position":{"lat":44.9,"lng":-79.5},"post_id":42}]}}}};</script>`;

function makePost(overrides: Partial<DarkskyPost>): DarkskyPost {
  return {
    id: 38201,
    slug: 'karlu-karlu-australia',
    link: 'https://darksky.org/places/karlu-karlu-australia/',
    title: { rendered: 'Karlu Karlu, Australia' },
    class_list: [
      'post-38201',
      'darksky_place',
      'idsp_type-international-dark-sky-sanctuary',
      'locations_terms-australia',
    ],
    content: {
      rendered:
        '<h3>Area</h3><p>18.02 km²</p><h3>Designated</h3><p>2026</p><h3>Category</h3><p>International Dark Sky Sanctuary</p>',
    },
    ...overrides,
  };
}

describe('parseFwpMarkers', () => {
  it('extracts the post_id → lat/lng table from the inline blob', () => {
    const markers = parseFwpMarkers(FWP_HTML);
    expect(markers.size).toBe(2);
    expect(markers.get(11881)).toEqual({ lat: -26.149607, lng: 20.257002 });
    expect(markers.get(42)).toEqual({ lat: 44.9, lng: -79.5 });
  });

  it('throws loudly when the blob is missing rather than returning empty', () => {
    expect(() => parseFwpMarkers('<html><body>no blob here</body></html>')).toThrow(/FWP_JSON/);
  });
});

describe('parseDarkskyPlace', () => {
  it('reads name, taxonomies, and the fact box from a real-shaped post', () => {
    const p = parseDarkskyPlace(makePost({}));
    expect(p).toEqual({
      postId: 38201,
      slug: 'karlu-karlu-australia',
      name: 'Karlu Karlu, Australia',
      url: 'https://darksky.org/places/karlu-karlu-australia/',
      categories: ['international-dark-sky-sanctuary'],
      countries: ['australia'],
      designatedYear: 2026,
      categoryText: 'International Dark Sky Sanctuary',
      areaText: '18.02 km²',
      status: 'certified',
    });
  });

  it('decodes HTML entities in names', () => {
    const p = parseDarkskyPlace(
      makePost({ title: { rendered: 'Mont-M&#233;gantic &amp; Friends' } }),
    );
    expect(p.name).toBe('Mont-Mégantic & Friends');
  });

  it('marks approved lodging so it can be excluded', () => {
    const p = parseDarkskyPlace(
      makePost({ class_list: ['darksky_place', 'idsp_type-darksky-approved-lodging'] }),
    );
    expect(p.status).toBe('lodging');
  });

  it('marks posts with no certification category', () => {
    const p = parseDarkskyPlace(makePost({ class_list: ['darksky_place'] }));
    expect(p.status).toBe('uncategorized');
  });

  it('yields null year when the fact box lacks a Designated section', () => {
    const p = parseDarkskyPlace(makePost({ content: { rendered: '<p>prose only</p>' } }));
    expect(p.designatedYear).toBeNull();
    expect(p.categoryText).toBeNull();
  });
});

describe('buildDarkskySnapshot', () => {
  it('joins markers, excludes lodging, quarantines markerless places, sorts by slug', () => {
    const posts = [
      makePost({ id: 2, slug: 'zebra-park' }),
      makePost({ id: 11881, slug: 'alpha-park' }),
      makePost({ id: 3, slug: 'hotel', class_list: ['idsp_type-darksky-approved-lodging'] }),
    ];
    const markers = new Map([[11881, { lat: -26.149607, lng: 20.257002 }]]);
    const snap = buildDarkskySnapshot(posts, markers, '2026-08-24T00:00:00Z');

    expect(snap.places.map((p) => p.slug)).toEqual(['alpha-park', 'zebra-park']);
    expect(snap.places[0].coordinates).toEqual({ lat: -26.149607, lng: 20.257002 });
    expect(snap.places[1].coordinates).toBeNull();
    expect(snap.quarantine).toEqual([{ slug: 'zebra-park', reason: 'no-coordinates' }]);
    expect(snap.excluded).toEqual([{ slug: 'hotel', reason: 'lodging' }]);
    expect(snap.harvestedAt).toBe('2026-08-24T00:00:00Z');
  });
});
