import { TestBed } from '@angular/core/testing';
import { DateTime } from 'luxon';
import { vi } from 'vitest';
import { ScoresService } from './scores';

const NOW = DateTime.fromMillis(Date.UTC(2026, 7, 25, 12, 0), { zone: 'utc' });

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body));
}

describe('ScoresService', () => {
  let service: ScoresService;

  beforeEach(() => {
    service = TestBed.inject(ScoresService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('publishes a fresh artifact', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ generatedAt: '2026-08-25T11:00:00.000Z', sites: {} })),
    );
    await service.load(NOW);
    expect(service.artifact()?.generatedAt).toBe('2026-08-25T11:00:00.000Z');
  });

  it('never publishes a stale artifact', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ generatedAt: '2026-08-25T01:00:00.000Z', sites: {} }), // 11h old
      ),
    );
    await service.load(NOW);
    expect(service.artifact()).toBeNull();
  });

  it('stays null on fetch rejection, non-OK responses, and parse failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await service.load(NOW);
    expect(service.artifact()).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await service.load(NOW);
    expect(service.artifact()).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ wrong: true })));
    await service.load(NOW);
    expect(service.artifact()).toBeNull();
  });
});
