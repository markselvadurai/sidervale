import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';

import { MapView } from './map-view';
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

describe('MapView', () => {
  let component: MapView;
  let fixture: ComponentFixture<MapView>;
  // writable from tests: sites arrive AFTER the first render, like the real async fetch
  let sitesSig: ReturnType<typeof signal<Site[]>>;

  beforeEach(async () => {
    sitesSig = signal<Site[]>([]);
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
      selectedSiteId: signal<string | null>(null).asReadonly(),
      selectedSite: computed(() => null),
      datasetState: signal<'loading' | 'ready' | 'failed'>('ready').asReadonly(),
      selectSite: () => {},
    };
    await TestBed.configureTestingModule({
      imports: [MapView],
      providers: [{ provide: SitesService, useValue: stub }],
    }).compileComponents();

    fixture = TestBed.createComponent(MapView);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('styles markers that arrive after the first render (async dataset regression)', async () => {
    // first render happened with zero sites — now the "fetch" resolves
    sitesSig.set([SITE]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const marker = component.markers.get('test-site');
    if (!marker) throw new Error('expected a marker for the arrived site');
    const className = (marker.getIcon().options as { className?: string }).className ?? '';
    expect(className).toContain('site-marker--pending'); // marginal + no cloud data = pending style
    expect(className).toContain('site-marker--marginal');
  });
});
