import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NavBar } from './nav-bar';

describe('NavBar', () => {
  let fixture: ComponentFixture<NavBar>;
  const text = (sel: string): string =>
    (fixture.nativeElement.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [NavBar] }).compileComponents();
    fixture = TestBed.createComponent(NavBar);
    await fixture.whenStable();
  });

  it('names the product once, as identity rather than decoration', () => {
    expect(text('.nav__word')).toBe('Sidervale');
  });

  // home moved beside the list it anchors; the rest of the mockup's bar needs features
  // that do not exist yet, and a dead tab is worse than a short bar
  it('carries no controls of its own', () => {
    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(0);
  });
});
