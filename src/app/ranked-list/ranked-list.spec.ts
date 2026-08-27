import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import { RankedList } from './ranked-list';
import { SitesService, TonightScore } from '../services/sites';
import { HomeService } from '../services/home';
import { Site } from '../models/site';

const site = (id: string, name: string): Site => ({
  id,
  name,
  coordinates: { lat: 45, lng: -81 },
  timezone: 'America/Toronto',
  designations: [],
  countries: ['canada'],
  provinces: [],
  brightness: { ratio: 0.05, mpsas: 21.5, zone: '2', atlasYear: 2024 },
  urls: {},
});

const scored = (score: number, cloud = true): TonightScore => ({
  hasTrueDarkness: true,
  score,
  tier: score >= 65 ? 'clear' : score >= 35 ? 'marginal' : 'poor',
  cloudDataAvailable: cloud,
});

// names chosen so alphabetical order DISAGREES with score order — an accidental
// name-sort cannot pass the ranking tests
const ALPHA = site('alpha', 'Alpha Flats');
const MID = site('mid', 'Zebra Ridge');
const TOP = site('top', 'Quiet Valley');
const ASTRO = site('astro', 'Cloudless Gap');
const DARK = site('dark', 'Midnight Sun Bay');

// controlled-distance fixtures: pure latitude offsets from Toronto, 1° = 111.19 km
const NEAR = {
  ...site('near', 'Near Meadow'),
  coordinates: { lat: 44.6532, lng: -79.3832 }, // 111 km
};
const OUTSIDE = {
  ...site('outside', 'Outer Banks Dark Park'),
  coordinates: { lat: 43.6532, lng: 100 }, // most of a hemisphere away
};

describe('RankedList', () => {
  let fixture: ComponentFixture<RankedList>;
  const scores = signal(new Map<string, TonightScore>());
  const selectedSiteId = signal<string | null>(null);
  const selectSite = vi.fn();

  const texts = (sel: string): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll(sel)).map((el) =>
      ((el as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

  beforeEach(async () => {
    localStorage.clear(); // HomeService is real — every test starts from the Toronto default
    scores.set(
      new Map([
        ['alpha', scored(55)],
        ['mid', scored(72)],
        ['top', scored(81)],
        ['astro', scored(61, false)],
        ['dark', { hasTrueDarkness: false }],
      ]),
    );
    selectedSiteId.set(null);
    selectSite.mockClear();

    const stub = {
      tonightScores: scores.asReadonly(),
      selectedSiteId: selectedSiteId.asReadonly(),
      selectSite,
    } satisfies Pick<SitesService, 'tonightScores' | 'selectedSiteId' | 'selectSite'>;

    await TestBed.configureTestingModule({
      imports: [RankedList],
      providers: [{ provide: SitesService, useValue: stub }],
    }).compileComponents();

    fixture = TestBed.createComponent(RankedList);
    fixture.componentRef.setInput('sites', [ALPHA, MID, TOP, ASTRO, DARK]);
    await fixture.whenStable();
  });

  it('says the verdict in words, not only in the score colour', () => {
    // same rule the panel dial follows: hue alone cannot carry a verdict
    expect(texts('.rank-row__tier')).toEqual(['Clear', 'Clear', 'Marginal']);
  });

  it('ranks cloud-aware sites by score, best first', () => {
    expect(texts('.rank-row__name')).toEqual(['Quiet Valley', 'Zebra Ridge', 'Alpha Flats']);
    expect(texts('.rank-row__rank')).toEqual(['1', '2', '3']);
    expect(texts('.rank-row__score')).toEqual(['81', '72', '55']);
  });

  it('segregates astronomy-only sites, unranked — their scores are unpenalized', () => {
    // 61 would outrank 55 numerically, but the two are not comparable
    expect(texts('.rank-row__name')).not.toContain('Cloudless Gap');
    expect(texts('.astro-row__name')).toEqual(['Cloudless Gap']);
    expect(texts('.astro-row__rank')).toEqual(['–']);
  });

  it('excludes darkless sites from the list and counts them in the footer', () => {
    expect(texts('.rank-row__name').concat(texts('.astro-row__name'))).not.toContain(
      'Midnight Sun Bay',
    );
    expect(texts('.rank-list__darkless')).toEqual(['1 site without astronomical darkness tonight']);
  });

  it('breaks score ties by name so the order is stable', async () => {
    scores.set(
      new Map([
        ['alpha', scored(70)],
        ['mid', scored(70)],
        ['top', scored(70)],
      ]),
    );
    fixture.componentRef.setInput('sites', [MID, TOP, ALPHA]);
    await fixture.whenStable();
    expect(texts('.rank-row__name')).toEqual(['Alpha Flats', 'Quiet Valley', 'Zebra Ridge']);
  });

  it('offers a way out of an empty reach instead of a blank panel', async () => {
    fixture.componentRef.setInput('sites', []);
    await fixture.whenStable();
    expect(
      (fixture.nativeElement.querySelector('.rank-list__empty')?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    ).toBe('No sites within 500 km of Toronto, ON');
    expect(fixture.nativeElement.querySelector('.rank-row')).toBeNull();
  });

  it('carries sky darkness per row — the one thing the score does not encode', async () => {
    // computeScore takes darkness hours, moon and cloud. It never sees brightness, so a
    // high-scoring site can sit under a poor sky; the row has to say so.
    scores.set(new Map([['near', scored(70)]]));
    fixture.componentRef.setInput('sites', [NEAR]);
    await fixture.whenStable();
    // fixture mpsas 21.5 is class 3 under one published table and 2 under the other
    expect(texts('.rank-row__bortle')).toEqual(['Bortle 2–3']);
  });

  it('offers no Reset while home is the launch default — a dead control is worse than none', async () => {
    fixture.componentRef.setInput('sites', [NEAR]);
    await fixture.whenStable();
    expect(texts('.rank-list__loc')).toEqual(['Use my location']);
  });

  it('reveals Reset once home has moved, and puts it back', async () => {
    fixture.componentRef.setInput('sites', [NEAR]);
    TestBed.inject(HomeService).set({ label: 'Somewhere East', lat: 43.6532, lng: -75 });
    await fixture.whenStable();
    expect(texts('.rank-list__loc')).toEqual(['Use my location', 'Reset']);

    const reset = [...fixture.nativeElement.querySelectorAll('.rank-list__loc')].find(
      (b: HTMLElement) => b.textContent?.trim() === 'Reset',
    ) as HTMLButtonElement;
    reset.click();
    await fixture.whenStable();
    expect(texts('.rank-list__from')).toEqual(['Toronto, ON']);
    expect(texts('.rank-list__loc')).toEqual(['Use my location']);
  });

  it('is anchored to home: shows the from-label and each site distance', async () => {
    scores.set(new Map([['near', scored(70)]]));
    fixture.componentRef.setInput('sites', [NEAR]);
    await fixture.whenStable();
    expect(texts('.rank-list__from')).toEqual(['Toronto, ON']);
    // 1° of latitude from Toronto — 111 km by the fixture's own arithmetic
    expect(texts('.rank-row__km')).toEqual(['111 km']);
  });

  it('excludes sites beyond reach and says how many it hid', async () => {
    scores.set(
      new Map([
        ['near', scored(70)],
        ['outside', scored(95)], // best score on the planet — still not an answer for tonight
      ]),
    );
    fixture.componentRef.setInput('sites', [NEAR, OUTSIDE]);
    await fixture.whenStable();
    expect(texts('.rank-row__name')).toEqual(['Near Meadow']);
    expect(texts('.rank-list__beyond')).toEqual(['1 beyond 500 km']);
  });

  it('re-ranks around a new home when it changes', async () => {
    scores.set(
      new Map([
        ['near', scored(70)],
        ['outside', scored(95)],
      ]),
    );
    fixture.componentRef.setInput('sites', [NEAR, OUTSIDE]);
    TestBed.inject(HomeService).set({ label: 'Somewhere East', lat: 43.6532, lng: 100 });
    await fixture.whenStable();
    expect(texts('.rank-row__name')).toEqual(['Outer Banks Dark Park']);
    expect(texts('.rank-list__from')).toEqual(['Somewhere East']);
  });

  it('selects the site whose row was clicked', () => {
    const rows = fixture.nativeElement.querySelectorAll('.rank-row');
    (rows[1] as HTMLButtonElement).click();
    expect(selectSite).toHaveBeenCalledTimes(1);
    expect(selectSite).toHaveBeenCalledWith('mid');
  });

  it('marks the selected site’s row', async () => {
    selectedSiteId.set('mid');
    await fixture.whenStable();
    const active = texts('.rank-row--active .rank-row__name');
    expect(active).toEqual(['Zebra Ridge']);
  });
});
