import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { vi } from 'vitest';

import { App } from './app';
import { routes } from './app.routes';
import { MapView } from './map-view/map-view';
import { SiteDetail } from './site-detail/site-detail';

describe('routing', () => {
  let router: Router;
  let location: Location;

  beforeEach(async () => {
    const body = JSON.stringify({
      sites: [
        {
          id: 'torrance-barrens',
          name: 'Torrance Barrens',
          coordinates: { lat: 45, lng: -79 },
          timezone: 'America/Toronto',
          designations: [],
          countries: ['canada'],
          provinces: ['on'],
          brightness: { ratio: 0.05, mpsas: 21.9, zone: '2', atlasYear: 2024 },
          urls: {},
        },
      ],
    });
    // a fresh Response per call: App fires two fetches, and a Response body reads once
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response(body))),
    );
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes)],
    }).compileComponents();
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('serves the map at the root — it is still the whole of "/"', async () => {
    const fixture = TestBed.createComponent(App);
    await router.navigate(['/']);
    await fixture.whenStable();
    expect(location.path()).toBe(''); // Angular reports the root as an empty path
    expect(fixture.debugElement.nativeElement.querySelector('app-map-view')).not.toBeNull();
  });

  it('serves a site page at /site/:id without tearing down into the map', async () => {
    const fixture = TestBed.createComponent(App);
    await router.navigate(['/site', 'torrance-barrens']);
    await fixture.whenStable();
    expect(location.path()).toBe('/site/torrance-barrens');
    expect(fixture.debugElement.nativeElement.querySelector('app-site-detail')).not.toBeNull();
    expect(fixture.debugElement.nativeElement.querySelector('app-map-view')).toBeNull();
  });

  it('sends an unknown path back to the map rather than a blank screen', async () => {
    const fixture = TestBed.createComponent(App);
    await router.navigate(['/nonsense/deep/path']);
    await fixture.whenStable();
    expect(location.path()).toBe('');
    expect(fixture.debugElement.nativeElement.querySelector('app-map-view')).not.toBeNull();
  });

  it('lazy-loads both views, and each loader resolves the component it claims', async () => {
    // lazy is deliberate: MapLibre must not sit in the initial bundle. Resolving the loaders
    // here means a wrong import path fails the suite rather than only failing at runtime.
    const load = async (path: string) => {
      const route = routes.find((r) => r.path === path);
      if (!route?.loadComponent) throw new Error(`route ${path} is not lazy`);
      return route.loadComponent();
    };
    expect(await load('')).toBe(MapView);
    expect(await load('site/:id')).toBe(SiteDetail);
  });
});
