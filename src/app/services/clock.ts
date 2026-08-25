import { Injectable, signal } from '@angular/core';
import { DateTime } from 'luxon';

// One minute: fine-grained enough that "tonight" advances promptly at sunrise,
// coarse enough to be free. Visibility refresh covers laptops waking from sleep.
const TICK_MS = 60_000;

/** The reactive clock. Computeds that read time MUST read this signal, never DateTime.now() —
 *  an ambient clock read inside a computed freezes at its last dependency change. */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private _now = signal<DateTime>(DateTime.now());
  readonly now = this._now.asReadonly();

  constructor() {
    setInterval(() => this.refresh(), TICK_MS);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.refresh();
      });
    }
  }

  refresh(at: DateTime = DateTime.now()) {
    this._now.set(at);
  }
}
