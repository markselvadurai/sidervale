import { Component, computed, inject, input } from '@angular/core';
import { SitesService } from '../services/sites';
import { HomeService } from '../services/home';
import { Site } from '../models/site';
import { Tier } from '../engines/scorer';
import { distanceKm } from '../engines/geo';

type Entry = { site: Site; score: number; tier: Tier; km: number };

// straight-line reach around home; ~a generous evening drive. Not calibrated against roads.
const REACH_KM = 500;

@Component({
  selector: 'app-ranked-list',
  imports: [],
  templateUrl: './ranked-list.html',
  styleUrl: './ranked-list.scss',
})
export class RankedList {
  protected sitesService = inject(SitesService);
  protected homeService = inject(HomeService);
  /** The caller decides which sites compete — the map passes its filtered set. */
  sites = input.required<Site[]>();
  protected readonly reachKm = REACH_KM;

  protected rows = computed(() => {
    const home = this.homeService.home();
    const scores = this.sitesService.tonightScores();
    const ranked: Entry[] = [];
    // astronomy-only scores carry no cloud penalty, so they may only exceed a cloud-aware
    // score by construction — never rank the two against each other (same rule as bestNight)
    const astro: Entry[] = [];
    let darkless = 0;
    let beyond = 0;
    for (const site of this.sites()) {
      const s = scores.get(site.id);
      if (!s) continue;
      // reach first: a site across the planet is not an answer to "tonight"
      const km = distanceKm(home, site.coordinates);
      if (km > REACH_KM) {
        beyond++;
        continue;
      }
      if (!s.hasTrueDarkness) {
        darkless++;
        continue;
      }
      (s.cloudDataAvailable ? ranked : astro).push({ site, score: s.score, tier: s.tier, km });
    }
    const byScore = (a: Entry, b: Entry) =>
      b.score - a.score || a.site.name.localeCompare(b.site.name);
    ranked.sort(byScore);
    astro.sort(byScore);
    return { ranked, astro, darkless, beyond };
  });

  protected async useMyLocation() {
    await this.homeService.useMyLocation();
  }
}
