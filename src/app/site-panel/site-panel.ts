import { Component, inject, signal } from '@angular/core';
import { SitesService } from '../services/sites';
import { NightStrip } from '../night-strip/night-strip';
import { designationsLabel, regionLabel, verdictWord } from './site-display';

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
}
