import { describe, expect, it } from 'vitest';
import {
  ExtMetadata,
  fileKey,
  isUsableLicence,
  licenceOf,
  nearestVerifiedPage,
  toSiteImage,
  WikiPage,
} from './commons';

const CHERRY = { lat: 41.6628, lng: -77.8261 }; // Cherry Springs State Park, from our dataset

const page = (title: string, lat: number | null, lng = 0, file = 'A.jpg'): WikiPage => ({
  title,
  pageimage: file,
  coordinates: lat === null ? undefined : [{ lat, lon: lng }],
});

const meta = (over: Record<string, string> = {}): ExtMetadata => {
  const base: Record<string, string> = {
    LicenseShortName: 'CC BY-SA 3.0',
    LicenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    Artist: '<a href="/wiki/User:KW">Kevin Wigell</a>',
  };
  return Object.fromEntries(
    Object.entries({ ...base, ...over }).map(([k, v]) => [k, { value: v }]),
  ) as ExtMetadata;
};

describe('nearestVerifiedPage', () => {
  // The live search for "Cherry Springs State Park" really does offer Cherry Creek State Park
  // in Colorado as its second hit. Name similarity is not evidence; coordinates are.
  it('rejects a same-sounding park 1900 km away', () => {
    const hit = nearestVerifiedPage(
      CHERRY,
      [
        page('Cherry Creek State Park', 39.63056, -104.84583),
        page('Cherry Springs State Park', 41.66384, -77.82321),
      ],
      25,
    );
    expect(hit?.page.title).toBe('Cherry Springs State Park');
    expect(hit?.km).toBeLessThan(1);
  });

  it('returns null rather than the closest of a bad set', () => {
    // nothing within reach: a photo of the wrong place is worse than no photo
    expect(nearestVerifiedPage(CHERRY, [page('Cherry Creek State Park', 39.63, -104.85)], 25)).toBe(
      null,
    );
  });

  it('ignores a candidate with no coordinates at all — unverifiable is not usable', () => {
    // 'Cherry Springs Airport' has no coords in the live API and must never be picked
    expect(nearestVerifiedPage(CHERRY, [page('Cherry Springs Airport', null)], 25)).toBe(null);
  });

  it('ignores a candidate with no image, however close it sits', () => {
    const near = { ...page('Cherry Springs State Park', 41.6638, -77.8232), pageimage: undefined };
    expect(nearestVerifiedPage(CHERRY, [near], 25)).toBe(null);
  });

  it('takes the NEAREST verified candidate, not the first one search returned', () => {
    const hit = nearestVerifiedPage(
      CHERRY,
      [
        page('Ranked first but 20 km out', 41.84, -77.83),
        page('Ranked second, on top', 41.6638, -77.8232),
      ],
      25,
    );
    expect(hit?.page.title).toBe('Ranked second, on top');
  });

  it('honours the radius exactly at its edge', () => {
    // 0.1 degree of latitude is 11.12 km by the haversine the app already ships
    const near = page('Edge', 41.6628 + 0.1, -77.8261);
    expect(nearestVerifiedPage(CHERRY, [near], 12)?.page.title).toBe('Edge');
    expect(nearestVerifiedPage(CHERRY, [near], 11)).toBe(null);
  });
});

describe('isUsableLicence', () => {
  it.each(['CC0', 'Public domain', 'PD-USGov', 'CC BY 4.0', 'CC BY-SA 3.0', 'CC BY-SA 4.0'])(
    'accepts %s — free to use commercially, so monetising later stays open',
    (l) => expect(isUsableLicence(l)).toBe(true),
  );

  it.each([
    'CC BY-NC 4.0',
    'CC BY-NC-SA 3.0',
    'CC BY-ND 4.0',
    'Fair use',
    'All rights reserved',
    'GFDL',
    '',
  ])('rejects %s', (l) => expect(isUsableLicence(l)).toBe(false));

  it('rejects a non-commercial licence even though it starts like an accepted one', () => {
    // 'CC BY-NC' begins with 'CC BY' — a prefix test would wave it through
    expect(isUsableLicence('CC BY-NC 4.0')).toBe(false);
  });
});

describe('licenceOf', () => {
  it('strips the markup Wikimedia wraps the artist in', () => {
    expect(licenceOf(meta()).artist).toBe('Kevin Wigell');
  });

  it('decodes entities rather than printing them at a reader', () => {
    expect(licenceOf(meta({ Artist: 'Jean &amp; Marie D&#039;Arc' })).artist).toBe(
      "Jean & Marie D'Arc",
    );
  });

  it('carries the licence and its url through verbatim', () => {
    const l = licenceOf(meta());
    expect(l.licence).toBe('CC BY-SA 3.0');
    expect(l.licenceUrl).toBe('https://creativecommons.org/licenses/by-sa/3.0');
  });

  it('falls back to a named holder rather than an empty byline', () => {
    expect(licenceOf(meta({ Artist: '' })).artist).toBe('Unknown author');
  });
});

describe('toSiteImage', () => {
  const info = {
    url: 'https://upload/full.jpg',
    thumburl: 'https://upload/480px.jpg',
    thumbwidth: 480,
    thumbheight: 320,
  };

  it('emits a usable image with everything needed to credit it', () => {
    const r = toSiteImage('File:A.jpg', info, meta());
    if ('reason' in r) throw new Error('expected an image, got ' + r.reason);
    expect(r).toEqual({
      url: 'https://upload/480px.jpg',
      width: 480,
      height: 320,
      artist: 'Kevin Wigell',
      licence: 'CC BY-SA 3.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      sourcePage: 'https://commons.wikimedia.org/wiki/File:A.jpg',
    });
  });

  it('quarantines a non-commercial licence instead of shipping it', () => {
    const r = toSiteImage('File:A.jpg', info, meta({ LicenseShortName: 'CC BY-NC 4.0' }));
    expect(r).toEqual({ reason: 'licence not free for commercial use: CC BY-NC 4.0' });
  });

  it('quarantines a missing licence rather than guessing one', () => {
    const r = toSiteImage('File:A.jpg', info, meta({ LicenseShortName: '' }));
    expect('reason' in r).toBe(true);
  });

  it('quarantines when the API returned no thumbnail to use', () => {
    const r = toSiteImage('File:A.jpg', { url: 'https://upload/full.jpg' }, meta());
    expect(r).toEqual({ reason: 'no thumbnail returned' });
  });
});

describe('fileKey', () => {
  // MediaWiki accepts underscored titles and answers with spaced ones. Keying a lookup on the
  // requested form silently loses every file whose name contains a space — which is most of
  // them, and cost three of the first four sites in the trial harvest.
  it('matches the underscored request to the spaced response', () => {
    expect(fileKey('File:Lliurona_Albanyà_Catalonia.jpg')).toBe(
      fileKey('File:Lliurona Albanyà Catalonia.jpg'),
    );
  });

  it('does not collapse genuinely different files', () => {
    expect(fileKey('File:A B.jpg')).not.toBe(fileKey('File:A C.jpg'));
  });
});

describe('licenceOf artist cleanup', () => {
  it("keeps the name out of Commons' no-machine-readable-author boilerplate", () => {
    const raw =
      'No machine-readable author provided. Christos Vittoratos assumed (based on copyright claims).';
    expect(licenceOf(meta({ Artist: raw })).artist).toBe('Christos Vittoratos');
  });

  it('leaves an ordinary byline alone', () => {
    expect(licenceOf(meta({ Artist: 'Kevin Wigell' })).artist).toBe('Kevin Wigell');
  });

  it('falls back when the boilerplate names nobody', () => {
    expect(licenceOf(meta({ Artist: 'No machine-readable author provided.' })).artist).toBe(
      'Unknown author',
    );
  });
});
