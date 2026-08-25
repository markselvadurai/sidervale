import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SitesService } from '../services/sites';
import { designationsLabel, regionLabel } from '../site-panel/site-display';

/** Stub: the per-site page the next round builds out. Routing seam only. */
@Component({
  selector: 'app-site-detail',
  imports: [RouterLink],
  templateUrl: './site-detail.html',
  styleUrl: './site-detail.scss',
})
export class SiteDetail {
  private sitesService = inject(SitesService);
  /** Bound from the route via withComponentInputBinding(). */
  id = input<string>('');

  protected designationsLabel = designationsLabel;
  protected regionLabel = regionLabel;
  protected readonly state = this.sitesService.datasetState;
  protected site = computed(
    () => this.sitesService.sites().find((s) => s.id === this.id()) ?? null,
  );
}
