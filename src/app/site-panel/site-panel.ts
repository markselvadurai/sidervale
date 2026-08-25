import { Component, inject, signal } from '@angular/core';
import { SitesService } from '../services/sites';
import { NightStrip } from '../night-strip/night-strip';

@Component({
  selector: 'app-site-panel',
  imports: [NightStrip],
  templateUrl: './site-panel.html',
  styleUrl: './site-panel.scss',
})
export class SitePanel {
  protected sitesService = inject(SitesService);
  sheetExpanded = signal(false);
}
