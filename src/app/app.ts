import { Component, inject, signal } from '@angular/core';
import { MapView } from './map-view/map-view';
import { SitesService } from './services/sites';
import { WeatherService } from './services/weather';

@Component({
  selector: 'app-root',
  imports: [MapView],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private weather = inject(WeatherService);
  private sitesService = inject(SitesService);
  constructor() {
    this.weather.loadAll(this.sitesService.sites());
  }
  protected readonly title = signal('sidervale');
}
