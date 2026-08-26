import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    // App's constructor starts the dataset fetch; the load path warns-and-degrades on failure
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ sites: [] }))));
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('frames the route between chrome that persists across it', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    // nav, then the routed view, then the footer — order is the layout, not decoration
    const order = [...el.children].map((c) => c.tagName.toLowerCase());
    expect(order).toEqual(['app-nav-bar', 'main', 'app-site-footer']);
    expect(el.querySelector('main router-outlet')).not.toBeNull();
  });
});
