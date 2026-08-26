import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { SiteFooter } from './site-footer';
import { SitesService } from '../services/sites';
import { Site } from '../models/site';

const site = (id: string): Site => ({
  id,
  name: id,
  coordinates: { lat: 45, lng: -79 },
  timezone: 'America/Toronto',
  designations: [],
  countries: ['canada'],
  provinces: ['on'],
  brightness: { ratio: 0.05, mpsas: 21.5, zone: '2', atlasYear: 2024 },
  urls: {},
});

describe('SiteFooter', () => {
  let fixture: ComponentFixture<SiteFooter>;
  const sites = signal<Site[]>([site('a'), site('b'), site('c')]);
  const text = (sel: string): string =>
    (fixture.nativeElement.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    sites.set([site('a'), site('b'), site('c')]);
    await TestBed.configureTestingModule({
      imports: [SiteFooter],
      providers: [{ provide: SitesService, useValue: { sites: sites.asReadonly() } }],
    }).compileComponents();
    fixture = TestBed.createComponent(SiteFooter);
    await fixture.whenStable();
  });

  it('credits every source the app renders, because three of them require it', () => {
    // OSM data is ODbL, the Lorenz atlas and Open-Meteo both ask for attribution
    const credits = text('.foot__credits');
    expect(credits).toContain('DarkSky International');
    expect(credits).toContain('RASC');
    expect(credits).toContain('D. Lorenz');
    expect(credits).toContain('Open-Meteo');
  });

  it('counts the sites it actually loaded rather than printing a number from the brief', async () => {
    expect(text('.foot__count')).toBe('3 sites');
    sites.set([site('a')]);
    await fixture.whenStable();
    expect(text('.foot__count')).toBe('1 site');
  });

  it('says nothing about a count before the dataset lands', async () => {
    sites.set([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.foot__count')).toBeNull();
  });
});
