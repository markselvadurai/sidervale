import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DateTime, Interval } from 'luxon';
import { vi } from 'vitest';

import { SitePanel } from './site-panel';
import { NightInfo, ScoredNight, SitesService } from '../services/sites';
import { ObservingNight, observingNightOf, plusNights } from '../models/observing-night';
import { Site } from '../models/site';

// WeekEntry is internal to the service; derive it so the fixture cannot drift from the source.
type WeekEntry = ReturnType<SitesService['weekScores']>[number];

// ── an exact 8-hour civil axis, built in UTC: every clock string below is machine-independent ──
const utc = (day: number, hour: number) =>
  DateTime.fromMillis(Date.UTC(2026, 7, day, hour), { zone: 'utc' });
const CIVIL_DUSK = utc(25, 21);
const DARK_START = utc(25, 22);
const DARK_END = utc(26, 4);
const CIVIL_DAWN = utc(26, 5);

const SITE: Site = {
  id: 'test-site',
  name: 'Torrance Barrens',
  coordinates: { lat: 45.6621, lng: -81.9679 },
  timezone: 'America/Toronto',
  // the 'other' sentinel must be filtered out of the subtitle
  designations: [
    { authority: 'rasc', type: 'dark-sky-preserve', year: 1999 },
    { authority: 'darksky', type: 'other', year: null },
  ],
  countries: ['canada'],
  provinces: ['on'],
  brightness: { ratio: 0.05, mpsas: 21.95, zone: '1a', atlasYear: 2024 },
  urls: { darksky: 'https://example.org/ds', rasc: 'https://example.org/rasc' },
};

const NIGHT_CORE = {
  hasTrueDarkness: true as const,
  darknessWindow: { start: DARK_START, end: DARK_END },
  civilDusk: CIVIL_DUSK,
  civilDawn: CIVIL_DAWN,
  moonSegments: [],
  // moon up for the last two dark hours: 02:00–04:00
  moonDarkSegments: [Interval.fromDateTimes(utc(26, 2), DARK_END) as Interval<true>],
  darkDuration: '6h 0m', // 22:00 → 04:00
  moonIllumination: 43,
  moonOverlapDisplay: '2h 10m',
  cloudHours: [],
  moonAltitude: [],
};
const CLEAR_NIGHT: ScoredNight = {
  ...NIGHT_CORE,
  score: 74,
  tier: 'clear',
  cloudDataAvailable: true,
  cloudAvg: 18,
};
const ASTRONOMY_ONLY: ScoredNight = {
  ...NIGHT_CORE,
  score: 58,
  tier: 'marginal',
  cloudDataAvailable: false,
  cloudAvg: null,
};

const FIRST_NIGHT = observingNightOf(SITE, utc(25, 20)); // 16:00 EDT — unambiguously that night
const NIGHTS = Array.from({ length: 7 }, (_, i) => plusNights(FIRST_NIGHT, i));

// deliberately distinct labels: the shipped single letters contain duplicates that would hide
// an off-by-one in the strip
const WEEK: WeekEntry[] = [
  {
    night: NIGHTS[0],
    label: 'D1',
    hasTrueDarkness: true,
    score: 74,
    tier: 'clear',
    cloudDataAvailable: true,
  },
  {
    night: NIGHTS[1],
    label: 'D2',
    hasTrueDarkness: true,
    score: 58,
    tier: 'marginal',
    cloudDataAvailable: true,
  },
  {
    night: NIGHTS[2],
    label: 'D3',
    hasTrueDarkness: true,
    score: 22,
    tier: 'poor',
    cloudDataAvailable: true,
  },
  {
    night: NIGHTS[3],
    label: 'D4',
    hasTrueDarkness: true,
    score: 81,
    tier: 'clear',
    cloudDataAvailable: true,
  },
  {
    night: NIGHTS[4],
    label: 'D5',
    hasTrueDarkness: true,
    score: 42,
    tier: 'marginal',
    cloudDataAvailable: true,
  },
  {
    night: NIGHTS[5],
    label: 'D6',
    hasTrueDarkness: true,
    score: 35,
    tier: 'marginal',
    cloudDataAvailable: true,
  },
  { night: NIGHTS[6], label: 'D7', hasTrueDarkness: false },
];

describe('SitePanel rendering', () => {
  let fixture: ComponentFixture<SitePanel>;

  const selectedSite = signal<Site | null>(SITE);
  const nightInfo = signal<NightInfo | null>(CLEAR_NIGHT);
  const selectedNightLabel = signal('Tue · Aug 25');
  const weekScores = signal<WeekEntry[]>(WEEK);
  const bestNight = signal<ObservingNight | null>(NIGHTS[3]); // 81 is the highest score in WEEK
  const selectedNight = signal<ObservingNight | null>(NIGHTS[0]);
  const forecastPending = signal(false);
  const selectNight = vi.fn();

  const stub = {
    selectedSite: selectedSite.asReadonly(),
    nightInfo: nightInfo.asReadonly(),
    selectedNightLabel: selectedNightLabel.asReadonly(),
    weekScores: weekScores.asReadonly(),
    bestNight: bestNight.asReadonly(),
    selectedNight: selectedNight.asReadonly(),
    forecastPending: forecastPending.asReadonly(),
    selectNight,
  } satisfies Pick<
    SitesService,
    | 'selectedSite'
    | 'nightInfo'
    | 'selectedNightLabel'
    | 'weekScores'
    | 'bestNight'
    | 'selectedNight'
    | 'forecastPending'
    | 'selectNight'
  >;

  const text = (sel: string): string =>
    (fixture.nativeElement.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const all = (sel: string): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll(sel));
  const texts = (sel: string): string[] =>
    all(sel).map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim());

  beforeEach(async () => {
    selectedSite.set(SITE);
    nightInfo.set(CLEAR_NIGHT);
    selectedNightLabel.set('Tue · Aug 25');
    weekScores.set(WEEK);
    bestNight.set(NIGHTS[3]);
    selectedNight.set(NIGHTS[0]);
    forecastPending.set(false);
    selectNight.mockClear();

    await TestBed.configureTestingModule({
      imports: [SitePanel],
      providers: [{ provide: SitesService, useValue: stub }],
    }).compileComponents();

    fixture = TestBed.createComponent(SitePanel);
    await fixture.whenStable();
  });

  it('the sheet handle announces its state and its action', async () => {
    const handle = fixture.nativeElement.querySelector('.panel__handle') as HTMLButtonElement;
    expect(handle.getAttribute('aria-expanded')).toBe('false');
    expect(handle.getAttribute('aria-label')).toBe('Expand panel');

    handle.click();
    await fixture.whenStable();

    expect(handle.getAttribute('aria-expanded')).toBe('true');
    expect(handle.getAttribute('aria-label')).toBe('Collapse panel');
  });

  it('renders nothing while no site is selected', async () => {
    selectedSite.set(null);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.panel')).toBeNull();
  });

  it('heads the panel with the site name and a measured-brightness subtitle', () => {
    expect(text('.header h2')).toBe('Torrance Barrens');
    // 21.95 from the fixture; 'dark-sky-preserve' titlecased; the 'other' designation dropped
    expect(text('.header .subtitle')).toBe('21.95 MPSAS · Dark Sky Preserve');
  });

  it('heads the night with four stats, none of them invented', () => {
    // from the fixture alone: no moon segments on the civil axis; moon owns the dark window
    // from 02:00 so the best stretch is 22:00–02:00; cloudAvg 18; darkDuration 6h 0m.
    // Drive time is absent on purpose — the ORS job does not exist, and a stubbed
    // "2h 45m" would be a fabricated fact.
    expect(texts('.stat__label')).toEqual(['Moonset', 'Cloud', 'Best window', 'Darkness']);
    expect(texts('.stat__value')).toEqual(['Down all night', '18%', '22:00', '6h 0m']);
  });

  it('says the forecast is missing rather than showing a confident zero', async () => {
    nightInfo.set(ASTRONOMY_ONLY);
    await fixture.whenStable();
    expect(texts('.stat__value')[1]).toBe('No forecast');
  });

  it('states the Bortle class beside the exact brightness it was derived from', () => {
    // 21.95 is class 1 under both published mappings, so no range is warranted
    expect(text('.chip--bortle')).toBe('Bortle 1');
    expect(fixture.nativeElement.querySelector('.chip--bortle').getAttribute('title')).toBe(
      'Excellent dark-sky site',
    );
  });

  it('widens to a range where the published mappings disagree', async () => {
    // 21.73 falls between the two tables' class-1 floors — claiming either would be a guess
    selectedSite.set({ ...SITE, brightness: { ...SITE.brightness, mpsas: 21.73 } });
    await fixture.whenStable();
    expect(text('.chip--bortle')).toBe('Bortle 1–2');
    // the exact modelled value stays on screen, so the chip never has to carry precision
    expect(text('.header .subtitle')).toBe('21.73 MPSAS · Dark Sky Preserve');
  });

  it('renders the score as a dial filled in proportion to it, with the verdict in words', () => {
    expect(text('.verdict__when')).toBe('TUE · AUG 25');
    expect(text('.dial__score')).toBe('74');
    // the arc length is data, not decoration: --fill drives the conic sweep
    const dial = fixture.nativeElement.querySelector('.dial') as HTMLElement;
    expect(dial.style.getPropertyValue('--fill')).toBe('74');
    const scoring = fixture.nativeElement.querySelector('.scoring') as HTMLElement;
    expect(scoring.classList.contains('scoring--clear')).toBe(true);
    // the word is the colour-blind-safe channel — it must survive alongside the hue
    expect(text('.verdict__tier')).toBe('Clear');
  });

  it('marks a cloudless score as astronomy-only rather than naming a tier', async () => {
    nightInfo.set(ASTRONOMY_ONLY);
    await fixture.whenStable();
    expect(text('.dial__score')).toBe('58');
    const scoring = fixture.nativeElement.querySelector('.scoring') as HTMLElement;
    expect(scoring.classList.contains('scoring--caveat')).toBe(true);
    expect(scoring.classList.contains('scoring--marginal')).toBe(false);
    expect(text('.verdict__tier')).toBe('Astronomy only');
  });

  it('replaces the whole scoring block on a darkless night', async () => {
    nightInfo.set({ hasTrueDarkness: false });
    await fixture.whenStable();
    expect(text('.darkless')).toBe('No astronomical darkness tonight');
    expect(fixture.nativeElement.querySelector('.scoring')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-night-strip')).toBeNull();
    expect(fixture.nativeElement.querySelector('.score-strip')).toBeNull();
    // the footer survives — it describes the site, not the night
    expect(text('.footer')).toBe('ON · America/Toronto');
  });

  it('says the night out loud: moonless dark, moon up, then pack up', () => {
    expect(texts('.windows__range')).toEqual(['22:00 – 02:00', '02:00 – 04:00', '04:00 – 05:00']);
    expect(texts('.windows__label')).toEqual([
      'Moonless dark',
      'Moon up · 43%',
      'Astronomical twilight',
    ]);
    expect(texts('.windows__tag')).toEqual(['BEST', 'BRIGHT TARGETS', 'PACK UP']);
  });

  it('states the darkness window, the moon and the cloud average', () => {
    const rows = texts('.detail dd');
    expect(rows[0]).toBe('22:00 - 04:00 · 6h 0m true dark');
    expect(rows[1]).toBe('43% illum · 2h 10m in the dark window');
    expect(rows[2]).toBe('18% avg during dark window');
  });

  it('distinguishes a pending forecast from a failed one', async () => {
    nightInfo.set(ASTRONOMY_ONLY);
    forecastPending.set(true);
    await fixture.whenStable();
    expect(texts('.detail dd')[2]).toBe('forecast loading…');

    forecastPending.set(false);
    await fixture.whenStable();
    expect(texts('.detail dd')[2]).toBe('forecast unavailable — astronomy only');
  });

  it('renders one week-strip entry per night, tier-coded in order', () => {
    const items = all('.score-strip .score-item');
    expect(items).toHaveLength(7);
    expect(texts('.score-strip .score-item')).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);

    const dotTier = all('.score-strip .score-dot').map((dot) =>
      (['clear', 'marginal', 'poor', 'darkless'] as const).find((t) =>
        dot.classList.contains(`score-dot--${t}`),
      ),
    );
    expect(dotTier).toEqual([
      'clear',
      'marginal',
      'poor',
      'clear',
      'marginal',
      'marginal',
      'darkless',
    ]);
  });

  it('haloes only the best night and activates only the selected label', () => {
    const haloed = all('.score-strip .score-dot').map((d) =>
      d.classList.contains('score-dot--best'),
    );
    expect(haloed).toEqual([false, false, false, true, false, false, false]);

    const active = all('.score-strip .score-label').map((l) =>
      l.classList.contains('score-label--active'),
    );
    expect(active).toEqual([true, false, false, false, false, false, false]);
  });

  it('labels every week night the same way, darkless included', () => {
    // the darkless entry is still selectable and must not be styled as an orphan
    expect(all('.score-strip .score-label')).toHaveLength(7);
  });

  it('selects the night that was clicked', () => {
    all('.score-strip .score-item')[2].click();
    expect(selectNight).toHaveBeenCalledTimes(1);
    expect(selectNight).toHaveBeenCalledWith(NIGHTS[2]);
  });

  it('footers the site with its region and zone, and credits the registries', () => {
    expect(text('.footer')).toBe('ON · America/Toronto');
    expect(text('.more .note')).toBe('Sky brightness zone 1a · 2024 world atlas');
    const links = all('.more a').map((a) => (a as HTMLAnchorElement).href);
    expect(links).toEqual(['https://example.org/ds', 'https://example.org/rasc']);
  });
});
