import { computed, Injectable, signal } from '@angular/core';

export type Home = { label: string; lat: number; lng: number };

// the ranked list needs a "from" before the user has said anything; Toronto is the launch market
export const TORONTO: Home = { label: 'Toronto, ON', lat: 43.6532, lng: -79.3832 };

const KEY = 'sidervale:home'; // namespace rule — never a nocturne: key

function restore(): Home {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return TORONTO;
    const parsed = JSON.parse(raw) as Home;
    if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number' || !parsed.label) {
      return TORONTO;
    }
    return parsed;
  } catch {
    return TORONTO;
  }
}

@Injectable({ providedIn: 'root' })
export class HomeService {
  private _home = signal<Home>(restore());
  readonly home = this._home.asReadonly();

  /** Still on the launch default. Compares the place, not the label — the Reset control must
   *  not vanish because somebody's own location happens to be named 'Toronto, ON'. */
  readonly isDefault = computed(() => {
    const h = this._home();
    return h.lat === TORONTO.lat && h.lng === TORONTO.lng;
  });

  set(home: Home) {
    this._home.set(home);
    localStorage.setItem(KEY, JSON.stringify(home));
  }

  reset() {
    this.set(TORONTO);
  }

  /** Browser geolocation — resolved locally, never sent anywhere. False on denial/failure. */
  useMyLocation(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(false);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.set({ label: 'My location', lat: pos.coords.latitude, lng: pos.coords.longitude });
          resolve(true);
        },
        () => resolve(false),
      );
    });
  }
}
