import { TestBed } from '@angular/core/testing';
import { DateTime } from 'luxon';
import { vi } from 'vitest';
import { ScoresService } from './scores';
import { ClockService } from './clock';

const NOW = DateTime.fromMillis(Date.UTC(2026, 7, 25, 12, 0), { zone: 'utc' });
const FRESH_BODY = { generatedAt: '2026-08-25T11:00:00.000Z', sites: {} };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body));
}

describe('ScoresService', () => {
  let service: ScoresService;
  let clock: ClockService;

  beforeEach(() => {
    service = TestBed.inject(ScoresService);
    clock = TestBed.inject(ClockService);
    clock.refresh(NOW);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('publishes a fresh artifact through usable()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(FRESH_BODY)));
    await service.load();
    expect(service.usable()?.generatedAt).toBe('2026-08-25T11:00:00.000Z');
  });

  it('a stale artifact is never usable', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ generatedAt: '2026-08-25T01:00:00.000Z', sites: {} })),
    );
    await service.load(); // 11h old at NOW
    expect(service.usable()).toBeNull();
  });

  it('an admitted artifact ages out as the clock advances — the gate holds after load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(FRESH_BODY)));
    await service.load();
    expect(service.usable()).not.toBeNull();

    clock.refresh(NOW.plus({ hours: 7 })); // 8h after generatedAt — past the 6h gate
    expect(service.usable()).toBeNull();
  });

  it('stays null on fetch rejection, real non-OK responses, and parse failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await service.load();
    expect(service.usable()).toBeNull();

    // a 404 carrying a VALID fresh body: only the status guard can keep this out
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(FRESH_BODY), { status: 404 })),
    );
    await service.load();
    expect(service.usable()).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ wrong: true })));
    await service.load();
    expect(service.usable()).toBeNull();
  });
});
