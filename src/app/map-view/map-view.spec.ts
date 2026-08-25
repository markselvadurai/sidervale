import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { computed, signal } from '@angular/core';

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

const TOWN: Site = {
  ...SITE,
  id: 'test-town',
  name: 'Test Town',
  designations: [{ authority: 'darksky', type: 'international-dark-sky-community', year: null }],
};

// MapLibre needs WebGL, which jsdom has not got, so ngAfterViewInit's map never builds.
// That is by design: everything decidable lives in pure functions (map-features / map-style),
// and these tests cover the component's OWN logic — filtering, the feature set it publishes,
// the accessible index, and the controls. The map wiring is verified in the browser.
describe('MapView', () => {
  let component: MapView;
  let fixture: ComponentFixture<MapView>;
  let sitesSig: ReturnType<typeof signal<Site[]>>;
  let selectedSig: ReturnType<typeof signal<string | null>>;

  const texts = (sel: string): string[] =>
    Array.from(fixture.nativeElement.querySelectorAll(sel)).map((el) =>
      ((el as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim(),
    );

  beforeEach(async () => {
    sitesSig = signal<Site[]>([]);
    selectedSig = signal<string | null>(null);
    const stub = {
      sites: sitesSig.asReadonly(),
      tonightScores: computed(
        () =>
          new Map(
            sitesSig().map((s) => [
              s.id,
              { hasTrueDarkness: true, score: 47, tier: 'marginal', cloudDataAvailable: false },
            ]),
          ),
      ),
      selectedSiteId: selectedSig.asReadonly(),
      selectedSite: computed(() => null),
      datasetState: signal<'loading' | 'ready' | 'failed'>('ready').asReadonly(),
      selectSite: (id: string) => selectedSig.set(id),
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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('says so, and keeps working, when the device cannot render a map', async () => {
    // jsdom has no WebGL2 — the same condition a real user hits on an old device or with
    // GPU acceleration off. The canvas is impossible; the product must not be.
    await landSites([SITE]);
    expect(component.mapUnavailable()).toBe(true);
    expect(texts('.map-unavailable')[0]).toContain('WebGL unavailable');
    // the parts that answer the actual question are unaffected
    expect(component['features']().features).toHaveLength(1);
    expect(texts('.site-index button')).toHaveLength(1);
  });

  it('publishes one feature per visible site, scored and located', async () => {
    await landSites([SITE]);
    const fc = component['features']();
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.coordinates).toEqual([-81.97, 45.66]);
    expect(fc.features[0].properties).toMatchObject({
      id: 'test-site',
      tier: 'marginal',
      pending: true, // the fixture has no cloud data
    });
  });

  it('hides certified municipalities by default and reveals them on request', async () => {
    await landSites([SITE, TOWN]);
    const ids = () => component['features']().features.map((f) => f.properties.id);
    expect(ids()).toEqual(['test-site']);

    component.markerFilter.set('all');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(ids()).toEqual(['test-site', 'test-town']);
    const kinds = component['features']().features.map((f) => f.properties.kind);
    expect(kinds).toEqual(['destination', 'community']);
  });

  it('exposes every site to keyboard and screen reader — the canvas cannot', async () => {
    await landSites([SITE, TOWN]);
    component.markerFilter.set('all');
    fixture.detectChanges();
    await fixture.whenStable();

    // 293 tabbable markers was never a usable keyboard experience; a labelled list is
    expect(texts('.site-index button')).toEqual([
      'Test Site, 47 marginal, astronomy only',
      'Test Town, 47 marginal, astronomy only',
    ]);
    expect(fixture.nativeElement.querySelector('.site-index').getAttribute('aria-label')).toBe(
      'Dark-sky sites on the map',
    );
  });

  it('selects a site from the accessible index, and the selection reaches the features', async () => {
    await landSites([SITE]);
    (fixture.nativeElement.querySelector('.site-index button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component['features']().features[0].properties.selected).toBe(true);
    expect(texts('.site-index button')[0]).toContain('selected');
  });

  it('opens the ranked list on demand, ranking only the sites the map shows', async () => {
    await landSites([SITE, TOWN]);
    expect(fixture.nativeElement.querySelector('app-ranked-list')).toBeNull();

    (fixture.nativeElement.querySelector('.list-toggle') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    const list = fixture.debugElement.query(By.directive(RankedList));
    if (!list) throw new Error('expected the ranked list to render');
    expect((list.componentInstance as RankedList).sites().map((s) => s.id)).toEqual(['test-site']);
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
});
