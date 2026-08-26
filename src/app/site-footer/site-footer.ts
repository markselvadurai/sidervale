import { Component, computed, inject } from '@angular/core';
import { SitesService } from '../services/sites';

@Component({
  selector: 'app-site-footer',
  imports: [],
  templateUrl: './site-footer.html',
  styleUrl: './site-footer.scss',
})
export class SiteFooter {
  private sitesService = inject(SitesService);

  /** Null until the dataset lands — a count of nothing is not a fact worth printing. */
  protected count = computed(() => {
    const n = this.sitesService.sites().length;
    return n ? `${n} site${n === 1 ? '' : 's'}` : null;
  });
}
