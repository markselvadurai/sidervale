import { computed, inject, Injectable, signal } from '@angular/core';
import { isArtifactFresh, parseScoresArtifact, ScoresArtifact } from '../engines/artifact';
import { ClockService } from './clock';

const SCORES_URL = 'https://raw.githubusercontent.com/markselvadurai/sidervale/data/scores.json';

@Injectable({ providedIn: 'root' })
export class ScoresService {
  private clock = inject(ClockService);
  private _artifact = signal<ScoresArtifact | null>(null);

  // Freshness is judged at READ time against the live clock, so the gate keeps holding in a
  // long-lived tab: the moment the artifact ages out, every consumer falls back to astronomy.
  readonly usable = computed<ScoresArtifact | null>(() => {
    const artifact = this._artifact();
    return artifact && isArtifactFresh(artifact, this.clock.now()) ? artifact : null;
  });

  async load(): Promise<void> {
    try {
      const res = await fetch(SCORES_URL);
      if (!res.ok) throw new Error(`scores.json ${res.status}`);
      this._artifact.set(parseScoresArtifact(await res.json()));
    } catch (error) {
      console.warn('scores artifact unavailable — astronomy-only scoring', error);
    }
  }
}
