import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { computed, signal } from '@angular/core';
import { vi } from 'vitest';

import { MapView } from './map-view';
import { RankedList } from '../ranked-list/ranked-list';
import { SitesService } from '../services/sites';
import { Site } from '../models/site';

const SITE: Site = {
  id: 'test-site',
  name: 'Test Site',
  coordinates: { lat: 45.66, lng: -81.97 },
  timezone: 'America/Toronto',
  designations: [],
  countries: ['canada'],
  provinces: [],
  brightness: { ratio: 0.05, mpsas: 21.95, zone: '1a', atlasYear: 2024 },
  urls: {},
};

const FAR: Site = {
  ...SITE,
  id: 'far-site',
  name: 'Far Site',
  coordinates: { lat: -43.9, lng: 170.1 }, // other side of the planet
};

const TOWN: Site = {
  ...SITE,
  id: 'test-town',
  name: 'Test Town',
  designations: [{ authority: 'darksky', type: 'international-dark-sky-community', year: null }],
};

describe('MapView', () => {
  let component: MapView;
  let fixture: ComponentFixture<MapView>;
  // writable from tests: sites arrive AFTER the first render, like the real async fetch
  let sitesSig: ReturnType<typeof signal<Site[]>>;
  // stands in for the ClockService minute tick: re-emits identical scores in a new Map
  let tick: ReturnType<typeof signal<number>>;

  const className = (marker: { getIcon(): { options: unknown } }): string =>
    ((marker.getIcon().options as { className?: string }).className ?? '') as string;

  beforeEach(async () => {
    sitesSig = signal<Site[]>([]);
    tick = signal(0);
    const stub = {
      sites: sitesSig.asReadonly(),
      tonightScores: computed(() => {
        tick();
        return new Map(
          sitesSig().map((s) => [
            s.id,
            { hasTrueDarkness: true, score: 47, tier: 'marginal', cloudDataAvailable: false },
          ]),
        );
      }),
      selectedSiteId: signal<string | null>(null).asReadonly(),
      selectedSite: computed(() => null),
      datasetState: signal<'loading' | 'ready' | 'failed'>('ready').asReadonly(),
      selectSite: () => {},
    } satisfies Pick<
      SitesService,
      'sites' | 'tonightScores' | 'selectedSiteId' | 'selectedSite' | 'datasetState' | 'selectSite'
    >;
    await TestBed.configureTestingModule({
      imports: [MapView],
      providers: [{ provide: SitesService, useValue: stub }],
    }).compileComponents();

    fixture = TestBed.createComponent(MapView);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  async function landSites(sites: Site[]) {
    sitesSig.set(sites);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function marker(id = 'test-site') {
    const m = component.markers.get(id);
    if (!m) throw new Error(`expected a marker for ${id}`);
    return m;
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('styles markers that arrive after the first render (async dataset regression)', async () => {
    // first render happened with zero sites — now the "fetch" resolves
    await landSites([SITE]);
    expect(className(marker())).toContain('site-marker--pending'); // marginal + no cloud data
    expect(className(marker())).toContain('site-marker--marginal');
  });

  it('gives every marker an accessible name — Leaflet makes them focusable buttons', async () => {
    await landSites([SITE]);
    // assert the ATTRIBUTE, not options.title — Leaflet only applies that option to freshly
    // created elements, and DivIcon reuses its div, so the option can be set and never land
    // 47 is below the clear band and the fixture has no cloud data, hence the caveat
    expect(marker().getElement()?.getAttribute('title')).toBe(
      'Test Site, 47 marginal, astronomy only',
    );
  });

  it('leaves marker DOM alone when a clock tick re-emits identical scores', async () => {
    await landSites([SITE]);
    const spy = vi.spyOn(marker(), 'setIcon');

    tick.set(tick() + 1); // same content, new Map identity — what the minute tick really does
    fixture.detectChanges();
    await fixture.whenStable();

    // setIcon destroys and rebuilds the icon element; 293 of those per minute is the bug
    expect(spy).not.toHaveBeenCalled();
  });

  it('hides certified municipalities by default and reveals them on request', async () => {
    await landSites([SITE, TOWN]);
    // a town answers "is tonight good where I live", not "is it worth driving out"
    expect(component.markers.has('test-town')).toBe(false);
    expect(component.markers.has('test-site')).toBe(true);

    component.markerFilter.set('all');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.markers.has('test-town')).toBe(true);
    // and it must not read as the same kind of place as a park
    expect(marker('test-town').getElement()?.classList.contains('site-marker--community')).toBe(
      true,
    );
    expect(marker('test-site').getElement()?.classList.contains('site-marker--community')).toBe(
      false,
    );
  });

  it('opens the ranked list on demand, ranking only the sites the map shows', async () => {
    await landSites([SITE, TOWN]);
    expect(fixture.nativeElement.querySelector('app-ranked-list')).toBeNull();

    (fixture.nativeElement.querySelector('.list-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    const list = fixture.debugElement.query(By.directive(RankedList));
    if (!list) throw new Error('expected the ranked list to render');
    // the community is filtered off the map, so it must not compete in the ranking either
    expect((list.componentInstance as RankedList).sites().map((s) => s.id)).toEqual(['test-site']);
  });

  it('resizes markers when the map crosses a zoom bucket', async () => {
    await landSites([SITE]);
    const sizeAt = () => (marker().getIcon().options as { iconSize?: [number, number] }).iconSize;
    // fitBounds on a single site lands at the maxZoom guard (8) → detail size
    expect(sizeAt()).toEqual([28, 28]);

    // world zoom: 293 markers at 28px fuse, so this must come down
    const map = (component as unknown as { map: { setZoom(z: number, o?: unknown): void } }).map;
    map.setZoom(2, { animate: false });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(sizeAt()).toEqual([12, 12]);
    expect(marker().getElement()?.classList.contains('site-marker--fine')).toBe(true);
  });

  it('announces the overlay state rather than leaving it to colour', async () => {
    const btn = fixture.nativeElement.querySelector('.overlay-toggle') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    btn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.classList.contains('overlay-toggle--on')).toBe(true);
  });

  it('re-styles rebuilt markers when the dataset itself is replaced', async () => {
    await landSites([SITE]);
    // a re-fetch: same id, new objects, so the marker map is torn down and rebuilt. The
    // icon cache must not remember the old marker and skip styling the new one.
    await landSites([{ ...SITE }]);
    expect(className(marker())).toContain('site-marker--marginal');
  });
});
