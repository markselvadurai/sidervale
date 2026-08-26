import { Component, computed, inject, signal } from '@angular/core';
import { SitesService } from '../services/sites';
import { NightStrip } from '../night-strip/night-strip';
import { bortleText, designationsLabel, regionLabel, verdictWord } from './site-display';
import { bestWindow, moonsetText, tonightWindows } from './night-windows';
import { bortleFor } from '../engines/bortle';

@Component({
  selector: 'app-site-panel',
  imports: [NightStrip],
  templateUrl: './site-panel.html',
  styleUrl: './site-panel.scss',
})
export class SitePanel {
  protected sitesService = inject(SitesService);
  sheetExpanded = signal(false);
  protected designationsLabel = designationsLabel;
  protected regionLabel = regionLabel;
  protected verdictWord = verdictWord;
  protected tonightWindows = tonightWindows;

  /** The night's four headline numbers. Drive time is deliberately absent — it needs the ORS
   *  job that does not exist yet, and a stubbed figure would be a fabricated fact. */
  protected stats = computed(() => {
    const night = this.sitesService.nightInfo();
    if (!night?.hasTrueDarkness) return [];
    const best = bestWindow(night);
    return [
      { key: 'moonset', label: 'Moonset', value: moonsetText(night) },
      {
        key: 'cloud',
        label: 'Cloud',
        value: night.cloudDataAvailable ? `${night.cloudAvg}%` : 'No forecast',
      },
      { key: 'best', label: 'Best window', value: best ? best.start.toFormat('HH:mm') : 'None' },
      { key: 'darkness', label: 'Darkness', value: night.darkDuration },
    ];
  });

  /** The chip's two strings: what it reads, and what that class means on hover. */
  protected bortle = computed(() => {
    const site = this.sitesService.selectedSite();
    if (!site) return null;
    const mpsas = site.brightness.mpsas;
    return { text: bortleText(mpsas), label: bortleFor(mpsas).label };
  });
}
