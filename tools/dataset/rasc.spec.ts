import { describe, expect, it } from 'vitest';
import { buildRascSnapshot, matchPinsToSites, parseKmlPlacemarks, parseRascTable } from './rasc';

// Mirrors the real Drupal table: junk <p> tags between cells, a literal "√" href,
// multi-link name cells, and multi-valued provinces.
const TABLE_HTML = `
<table><tbody>
<tr><th>Dark-Sky Site</th><th>Province</th><th>Year Designated</th><th>Type</th><th>Site Information</th></tr>
<tr>
<td><a href="√" target="_blank">Johns Family Nature Conservancy Regional Park</a></td><p>&#13;</p>
<td class="rtecenter">BC</td>
<td class="rtecenter">2023</td>
<td class="rtecenter">Nocturnal Preserve</td>
<td class="rtecenter"><a href="https://rasc.ca/lpa/johns-family-park" target="_blank">Learn more</a></td>
</tr>
<tr>
<td>Cypress Hills (<a href="https://example.com/park">Cypress Hills Interprovincial Park</a>, <a href="https://example.com/walsh">Fort Walsh National Historic Site</a>)</td>
<td class="rtecenter">AB/SK</td>
<td class="rtecenter">2004</td>
<td class="rtecenter">Dark-Sky Preserve</td>
<td class="rtecenter"><a href="https://rasc.ca/lpa/cypress-hills-interprovincial-park">Learn more</a></td>
</tr>
<tr>
<td><a href="https://parks.canada.ca/kejimkujik">Kejimkujik National Park and National Historic Site</a></td>
<td class="rtecenter">NS</td>
<td class="rtecenter">2010</td>
<td class="rtecenter">Dark-Sky Preserve</td>
<td class="rtecenter"><a href="https://rasc.ca/lpa/kejimkujik-national-park">Learn more</a></td>
</tr>
<tr>
<td>Ann and Sandy Cross Conservation Area</td>
<td class="rtecenter">AB</td>
<td class="rtecenter">2015</td>
<td class="rtecenter">Nocturnal Preserve</td>
<td class="rtecenter"><a href="https://rasc.ca/lpa/ann-sandy-cross-conservation-area">Learn more</a></td>
</tr>
</tbody></table>`;

// Real quirks: CDATA wrapper, non-breaking space, lng-before-lat coordinate order.
const KML = `<?xml version="1.0"?><kml><Document><Folder>
<Placemark><name><![CDATA[Ann & Sandy Cross Conservation Area ]]></name>
<Point><coordinates>-114.234151,50.876035,0</coordinates></Point></Placemark>
<Placemark><name>Cypress Hills- Cypress Hills Interprovincial Park Centre Block</name>
<Point><coordinates>-109.49825,49.659225,0</coordinates></Point></Placemark>
<Placemark><name>Cypress Hills-  Fort Walsh National Historic Site</name>
<Point><coordinates>-109.8819655,49.5729338,0</coordinates></Point></Placemark>
<Placemark><name>Kejimkujik National Park and National Historic Site</name>
<Point><coordinates>-65.213655,44.435209,0</coordinates></Point></Placemark>
</Folder></Document></kml>`;

describe('parseRascTable', () => {
  it('parses all data rows with names, provinces, years, programs, links', () => {
    const sites = parseRascTable(TABLE_HTML);
    expect(sites).toHaveLength(4);

    expect(sites[0].name).toBe('Johns Family Nature Conservancy Regional Park');
    expect(sites[0].orgUrl).toBeNull(); // the literal "√" href is not a URL
    expect(sites[0].provinces).toEqual(['BC']);
    expect(sites[0].year).toBe(2023);
    expect(sites[0].program).toBe('nocturnal-preserve');
    expect(sites[0].rascUrl).toBe('https://rasc.ca/lpa/johns-family-park');

    expect(sites[1].name).toBe(
      'Cypress Hills (Cypress Hills Interprovincial Park, Fort Walsh National Historic Site)',
    );
    expect(sites[1].orgUrl).toBe('https://example.com/park');
    expect(sites[1].provinces).toEqual(['AB', 'SK']);
    expect(sites[1].program).toBe('dark-sky-preserve');
  });
});

describe('parseKmlPlacemarks', () => {
  it('unwraps CDATA, strips non-breaking spaces, and reads lng-before-lat order', () => {
    const pins = parseKmlPlacemarks(KML);
    expect(pins).toHaveLength(4);
    expect(pins[0].name).toBe('Ann & Sandy Cross Conservation Area');
    // KML coordinates are lng,lat — a swap here is a wrong-hemisphere bug
    expect(pins[0].lat).toBe(50.876035);
    expect(pins[0].lng).toBe(-114.234151);
  });
});

describe('matchPinsToSites', () => {
  it('assigns pins by normalized prefix, collecting multi-parcel pins per site', () => {
    const sites = parseRascTable(TABLE_HTML);
    const pins = parseKmlPlacemarks(KML);
    const { parcelsBySite, unmatchedPins } = matchPinsToSites(sites, pins);

    expect(parcelsBySite.get(sites[1].name)).toHaveLength(2); // both Cypress pins
    expect(parcelsBySite.get(sites[2].name)).toHaveLength(1); // Kejimkujik
    expect(parcelsBySite.get(sites[0].name)).toBeUndefined(); // Johns has no pin
    // the pin says "Ann & Sandy", the table says "Ann and Sandy" — must still match
    expect(parcelsBySite.get(sites[3].name)).toHaveLength(1);
    expect(unmatchedPins).toEqual([]);
  });
});

describe('buildRascSnapshot', () => {
  it('single-pin sites get coordinates; multi-parcel and pinless sites quarantine', () => {
    const sites = parseRascTable(TABLE_HTML);
    const pins = parseKmlPlacemarks(KML);
    const snap = buildRascSnapshot(sites, pins, '2026-08-24T00:00:00Z');

    const bySite = Object.fromEntries(snap.sites.map((s) => [s.name.slice(0, 7), s]));
    expect(bySite['Kejimku'].coordinates).toEqual({ lat: 44.435209, lng: -65.213655 });
    expect(bySite['Cypress'].coordinates).toBeNull();
    expect(bySite['Cypress'].parcels).toHaveLength(2);
    expect(bySite['Johns F'].coordinates).toBeNull();

    expect(snap.quarantine).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'multi-parcel' }),
        expect.objectContaining({ reason: 'no-coordinates' }),
      ]),
    );
    expect(snap.unmatchedPins).toHaveLength(0);
  });
});
