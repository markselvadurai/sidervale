import { Component, inject, signal } from '@angular/core';
import { MapView } from './map-view/map-view';
import { SitesService } from './services/sites';

@Component({
  selector: 'app-root',
  imports: [MapView],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private sitesService = inject(SitesService);
  constructor() {
    void this.sitesService.load();
  }
  protected readonly title = signal('sidervale');
}
