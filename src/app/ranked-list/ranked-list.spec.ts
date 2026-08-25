import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';

import { RankedList } from './ranked-list';
import { SitesService, TonightScore } from '../services/sites';
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
