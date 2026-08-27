// Matching sites to Wikimedia images. The rule this file exists to enforce: a photo of the
// WRONG place is the same class of defect as a wrong coordinate — it does not error, it just
// lies confidently. So a candidate is only accepted when its own coordinates put it at the
// site, and only when its licence is free for commercial use.

import { distanceKm } from '../../src/app/engines/geo';
import { decodeEntities } from './html';

export type ExtMetadata = Record<string, { value: string } | undefined>;

export type WikiPage = {
  title: string;
  pageimage?: string;
  coordinates?: { lat: number; lon: number }[];
};

export type ImageInfo = {
  url?: string;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
};

export type SiteImage = {
  url: string;
  width: number;
  height: number;
  artist: string;
  licence: string;
  licenceUrl: string;
  sourcePage: string;
};

/** Licences that permit commercial use, so a paid tier later cannot strand the dataset.
 *  Anything not on this list — NC, ND, fair use, GFDL-only, blank — is quarantined. */
const FREE_LICENCE = /^(cc0|public domain|pd(-|$)|cc by(-sa)?[\s-]*\d)/i;
const UNFREE = /\bn[cd]\b|non[- ]?commercial|no[- ]?deriv/i;

/** MediaWiki accepts underscored titles and answers with spaced ones, so a lookup keyed on
 *  the requested form loses every file with a space in its name. Key both sides through this. */
export function fileKey(title: string): string {
  return title.replace(/_/g, ' ').trim();
}

// Commons wraps an unattributed upload in boilerplate: "No machine-readable author provided.
// <name> assumed (based on copyright claims)." The name inside is the credit; the rest is noise.
const ASSUMED =
  /^no machine-readable author provided\.\s*(.*?)\s*assumed \(based on copyright claims\)\.?$/i;

function cleanArtist(raw: string): string {
  const assumed = ASSUMED.exec(raw);
  const name = (assumed ? assumed[1] : raw).trim();
  // the boilerplate with nobody inside it names nobody
  return /^no machine-readable author provided/i.test(name) ? '' : name;
}

export function isUsableLicence(shortName: string): boolean {
  const s = shortName.trim();
  if (!s) return false;
  if (UNFREE.test(s)) return false;
  return FREE_LICENCE.test(s);
}

/** Artist and licence as plain text — Wikimedia returns both wrapped in markup. */
export function licenceOf(meta: ExtMetadata): {
  artist: string;
  licence: string;
  licenceUrl: string;
} {
  const val = (k: string) => (meta[k]?.value ?? '').toString();
  const artist = cleanArtist(decodeEntities(val('Artist').replace(/<[^>]+>/g, '')).trim());
  return {
    artist: artist || 'Unknown author',
    licence: decodeEntities(val('LicenseShortName').replace(/<[^>]+>/g, '')).trim(),
    licenceUrl: val('LicenseUrl').trim(),
  };
}

/** The nearest candidate whose OWN coordinates place it at the site, or null. Search rank is
 *  ignored: "Cherry Creek State Park" outranks the right park for a name query, 1900 km away. */
export function nearestVerifiedPage(
  site: { lat: number; lng: number },
  pages: WikiPage[],
  maxKm: number,
): { page: WikiPage; km: number } | null {
  let best: { page: WikiPage; km: number } | null = null;
  for (const page of pages) {
    const coord = page.coordinates?.[0];
    // no coordinates is not "probably fine" — it is unverifiable, so it is unusable
    if (!coord || !page.pageimage) continue;
    const km = distanceKm(site, { lat: coord.lat, lng: coord.lon });
    if (km > maxKm) continue;
    if (!best || km < best.km) best = { page, km };
  }
  return best;
}

/** A file plus its metadata becomes either a creditable image or a quarantine reason. */
export function toSiteImage(
  fileTitle: string,
  info: ImageInfo,
  meta: ExtMetadata,
): SiteImage | { reason: string } {
  const { artist, licence, licenceUrl } = licenceOf(meta);
  if (!isUsableLicence(licence)) {
    return { reason: `licence not free for commercial use: ${licence || '(none given)'}` };
  }
  if (!info.thumburl || !info.thumbwidth || !info.thumbheight) {
    return { reason: 'no thumbnail returned' };
  }
  return {
    url: info.thumburl,
    width: info.thumbwidth,
    height: info.thumbheight,
    artist,
    licence,
    licenceUrl,
    sourcePage: `https://commons.wikimedia.org/wiki/${fileTitle}`,
  };
}
