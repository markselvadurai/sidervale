import {
  Component,
  ElementRef,
  viewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  effect,
} from '@angular/core';
import * as L from 'leaflet';
import { ScoredNight, SitesService } from '../services/sites';
import { WeatherService } from '../services/weather';
import { NightStrip } from '../night-strip/night-strip';
import { DateTime } from 'luxon';

@Component({
  selector: 'app-map-view',
  imports: [NightStrip],
  templateUrl: './map-view.html',
  styleUrl: './map-view.scss',
})
export class MapView implements AfterViewInit, OnDestroy {
  protected sitesService = inject(SitesService);
  mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  private map!: L.Map;
  markers = new Map<string, L.Marker>();
  mapReady = signal(false);
  overlayOn = signal(false);
  sheetExpanded = signal(false);
  private overlayLayer = L.tileLayer(
    'https://djlorenz.github.io/astronomy/image_tiles/tiles2024/tile_{z}_{x}_{y}.png',
    { opacity: 0.25, tileSize: 1024, maxNativeZoom: 6, zoomOffset: -2 },
  );
  private makeIcon(classes: string[]): L.DivIcon {
    return L.divIcon({
      className: classes.join(' '),
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  constructor() {
    effect(() => {
      if (!this.mapReady()) return;

      this.markers.forEach((m) => m.remove());
      this.markers.clear();
      for (const site of this.sitesService.sites()) {
        const latlng = new L.LatLng(site.coordinates.lat, site.coordinates.lng);
        const siteMark = new L.Marker(latlng, { icon: this.makeIcon(['site-marker']) });
        this.markers.set(site.id, siteMark);
        siteMark.addTo(this.map);
        siteMark.on('click', () => this.sitesService.selectSite(site.id));
      }
    });

    effect(() => {
      if (!this.mapReady()) return;
      for (const [id, marker] of this.markers) {
        const tonightScore = this.sitesService.tonightScores().get(id);
        if (!tonightScore) continue;
        if (!tonightScore.hasTrueDarkness) {
          marker.setIcon(this.makeIcon(['site-marker', 'site-marker--darkless']));
        } else {
          const pending = !tonightScore.cloudDataAvailable;
          const tier = tonightScore.tier;
          const selected = this.sitesService.selectedSiteId() === id;

          // array composition — every branch appends, nothing can overwrite:
          const classes = ['site-marker', `site-marker--${tier}`];
          if (pending) classes.push('site-marker--pending');
          if (selected) classes.push('site-marker--selected');
          marker.setIcon(this.makeIcon(classes));
        }
      }
    });

    effect(() => {
      if (!this.mapReady()) return;
      this.overlayOn() ? this.overlayLayer.addTo(this.map) : this.overlayLayer.remove();
    });
  }

  ngAfterViewInit() {
    this.map = new L.Map(this.mapContainer().nativeElement, {
      zoom: 8,
      center: [43.65, -79.38],
    });
    const tiles = new L.TileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 20,
    });
    tiles.addTo(this.map);
    this.mapReady.set(true);
  }

  ngOnDestroy() {
    this.map?.remove();
  }
}
