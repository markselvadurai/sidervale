import { Injectable, signal } from '@angular/core';
import { DateTime } from 'luxon';
import { isArtifactFresh, parseScoresArtifact, ScoresArtifact } from '../engines/artifact';

const SCORES_URL = 'https://raw.githubusercontent.com/markselvadurai/sidervale/data/scores.json';

@Injectable({ providedIn: 'root' })
export class ScoresService {
  // fresh-or-null: a stale artifact is never published, so downstream computeds never read a clock
  private _artifact = signal<ScoresArtifact | null>(null);
  readonly artifact = this._artifact.asReadonly();

  async load(now: DateTime = DateTime.now()): Promise<void> {
    try {
      const res = await fetch(SCORES_URL);
      if (!res.ok) throw new Error(`scores.json ${res.status}`);
      const artifact = parseScoresArtifact(await res.json());
      if (!isArtifactFresh(artifact, now))
        throw new Error(`stale artifact ${artifact.generatedAt}`);
      this._artifact.set(artifact);
    } catch (error) {
      console.warn('scores artifact unavailable — astronomy-only scoring', error);
    }
  }
}
