import { Component, computed, inject, input } from '@angular/core';
import { SitesService } from '../services/sites';
import { Site } from '../models/site';
import { Tier } from '../engines/scorer';

type Entry = { site: Site; score: number; tier: Tier };

@Component({
  selector: 'app-ranked-list',
  imports: [],
  templateUrl: './ranked-list.html',
  styleUrl: './ranked-list.scss',
})
export class RankedList {
  protected sitesService = inject(SitesService);
  /** The caller decides which sites compete — the map passes its filtered set. */
  sites = input.required<Site[]>();

  protected rows = computed(() => {
    const scores = this.sitesService.tonightScores();
    const ranked: Entry[] = [];
    // astronomy-only scores carry no cloud penalty, so they may only exceed a cloud-aware
    // score by construction — never rank the two against each other (same rule as bestNight)
    const astro: Entry[] = [];
    let darkless = 0;
    for (const site of this.sites()) {
      const s = scores.get(site.id);
      if (!s) continue;
      if (!s.hasTrueDarkness) {
        darkless++;
        continue;
      }
      (s.cloudDataAvailable ? ranked : astro).push({ site, score: s.score, tier: s.tier });
    }
    const byScore = (a: Entry, b: Entry) =>
      b.score - a.score || a.site.name.localeCompare(b.site.name);
    ranked.sort(byScore);
    astro.sort(byScore);
    return { ranked, astro, darkless };
  });
}
