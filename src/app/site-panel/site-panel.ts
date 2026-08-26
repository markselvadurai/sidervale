import { Component, computed, inject, signal } from '@angular/core';
import { SitesService } from '../services/sites';
import { NightStrip } from '../night-strip/night-strip';
import { bortleText, designationsLabel, regionLabel, verdictWord } from './site-display';
import { tonightWindows } from './night-windows';
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

  /** The chip's two strings: what it reads, and what that class means on hover. */
  protected bortle = computed(() => {
    const site = this.sitesService.selectedSite();
    if (!site) return null;
    const mpsas = site.brightness.mpsas;
    return { text: bortleText(mpsas), label: bortleFor(mpsas).label };
  });
}
