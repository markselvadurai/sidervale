import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HomeService, TORONTO } from './home';

describe('HomeService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts at Toronto when nothing is stored', () => {
    const svc = TestBed.inject(HomeService);
    expect(svc.home()).toEqual({ label: 'Toronto, ON', lat: 43.6532, lng: -79.3832 });
  });

  it('persists a change under the sidervale: namespace and reads it back', () => {
    const svc = TestBed.inject(HomeService);
    svc.set({ label: 'Sudbury, ON', lat: 46.49, lng: -80.99 });
    // the namespace rule: a v1 nocturne: key must never be reused
    expect(localStorage.getItem('sidervale:home')).toContain('Sudbury');

    TestBed.resetTestingModule();
    const fresh = TestBed.inject(HomeService);
    expect(fresh.home().label).toBe('Sudbury, ON');
  });

  it('falls back to Toronto when the stored value is garbage', () => {
    localStorage.setItem('sidervale:home', '{not json');
    expect(TestBed.inject(HomeService).home()).toEqual(TORONTO);
    localStorage.setItem('sidervale:home', JSON.stringify({ label: 'x', lat: 'no' }));
    TestBed.resetTestingModule();
    expect(TestBed.inject(HomeService).home()).toEqual(TORONTO);
  });

  it('adopts the browser position on useMyLocation', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: 46.49, longitude: -80.99 } } as GeolocationPosition),
      },
    });
    const svc = TestBed.inject(HomeService);
    expect(await svc.useMyLocation()).toBe(true);
    expect(svc.home()).toEqual({ label: 'My location', lat: 46.49, lng: -80.99 });
  });

  it('keeps the current home when the user denies geolocation', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_ok: PositionCallback, err: PositionErrorCallback) =>
          err({ code: 1 } as GeolocationPositionError),
      },
    });
    const svc = TestBed.inject(HomeService);
    expect(await svc.useMyLocation()).toBe(false);
    expect(svc.home()).toEqual(TORONTO);
  });

  it('reset returns to Toronto', () => {
    const svc = TestBed.inject(HomeService);
    svc.set({ label: 'Elsewhere', lat: 0, lng: 0 });
    svc.reset();
    expect(svc.home()).toEqual(TORONTO);
  });
});

describe('HomeService.isDefault', () => {
  it('is true before the user has chosen anywhere', () => {
    localStorage.clear();
    expect(TestBed.inject(HomeService).isDefault()).toBe(true);
  });

  it('goes false once home moves, and true again on reset', () => {
    localStorage.clear();
    const svc = TestBed.inject(HomeService);
    svc.set({ label: 'My location', lat: 1, lng: 2 });
    expect(svc.isDefault()).toBe(false);
    svc.reset();
    expect(svc.isDefault()).toBe(true);
  });

  it('compares the place, not the label a user could coincidentally match', () => {
    localStorage.clear();
    const svc = TestBed.inject(HomeService);
    svc.set({ label: 'Toronto, ON', lat: 51.5, lng: -0.12 });
    expect(svc.isDefault()).toBe(false);
  });
});
