import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { NavBar } from './nav-bar';
import { HomeService, TORONTO } from '../services/home';

describe('NavBar', () => {
  let fixture: ComponentFixture<NavBar>;
  const text = (sel: string): string =>
    (fixture.nativeElement.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [NavBar] }).compileComponents();
    fixture = TestBed.createComponent(NavBar);
    await fixture.whenStable();
  });

  it('names the product once, as a heading, not as decoration', () => {
    expect(text('.nav__word')).toBe('Sidervale');
  });

  it('says where the ranking is anchored, which is the one global setting there is', () => {
    expect(text('.nav__place')).toBe('Toronto, ON');
  });

  it('offers no Reset while home is still the default — a dead control is worse than none', () => {
    expect(fixture.nativeElement.querySelector('.nav__reset')).toBeNull();
  });

  it('reveals Reset once home has moved, and puts it back', async () => {
    const home = TestBed.inject(HomeService);
    home.set({ label: 'My location', lat: 51.5, lng: -0.12 });
    await fixture.whenStable();
    expect(text('.nav__place')).toBe('My location');

    const reset = fixture.nativeElement.querySelector('.nav__reset') as HTMLButtonElement;
    reset.click();
    await fixture.whenStable();

    expect(text('.nav__place')).toBe(TORONTO.label);
    expect(fixture.nativeElement.querySelector('.nav__reset')).toBeNull();
  });

  it('asks the browser for a location rather than guessing one', async () => {
    const home = TestBed.inject(HomeService);
    const spy = vi.spyOn(home, 'useMyLocation').mockResolvedValue(true);
    (fixture.nativeElement.querySelector('.nav__locate') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledOnce();
  });
});
