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
import { SitesService } from '../services/sites';
import { SitePanel } from '../site-panel/site-panel';
import { markerIcon, markerSize } from './marker-icon';

@Component({
  selector: 'app-map-view',
  imports: [SitePanel],
  templateUrl: './map-view.html',
  styleUrl: './map-view.scss',
})
export class MapView implements AfterViewInit, OnDestroy {
  protected sitesService = inject(SitesService);
  mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  private map!: L.Map;
  markers = new Map<string, L.Marker>();
  // last icon applied per site: setIcon destroys and rebuilds the element, and the clock
  // ticks the styling effect every minute
  private iconKeys = new Map<string, string>();
  mapReady = signal(false);
  overlayOn = signal(false);
  private overlayLayer = L.tileLayer(
    'https://djlorenz.github.io/astronomy/image_tiles/tiles2024/tile_{z}_{x}_{y}.png',
    { opacity: 0.25, tileSize: 1024, maxNativeZoom: 6, zoomOffset: -2 },
  );
  private _zoom = signal(2);
  private makeIcon(classes: string[], size: number): L.DivIcon {
    // a 2px ring is a quarter of a 12px marker — thin the stroke with the diameter
    const all = size <= 18 ? [...classes, 'site-marker--fine'] : classes;
    return L.divIcon({
      className: all.join(' '),
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  private fitted = false;

  constructor() {
    effect(() => {
      if (!this.mapReady()) return;

      this.markers.forEach((m) => m.remove());
      this.markers.clear();
      this.iconKeys.clear(); // stale keys would suppress styling on the fresh markers
      const sites = this.sitesService.sites();
      for (const site of sites) {
        const latlng = new L.LatLng(site.coordinates.lat, site.coordinates.lng);
        const siteMark = new L.Marker(latlng, {
          icon: this.makeIcon(['site-marker'], markerSize(this.map.getZoom())),
        });
        this.markers.set(site.id, siteMark);
        siteMark.addTo(this.map);
        siteMark.on('click', () => this.sitesService.selectSite(site.id));
      }
      // one-shot: frame whatever the dataset spans — Ontario for 7 sites, the world for 293
      if (sites.length && !this.fitted) {
        // maxZoom guards the degenerate 1-site bounds (zero area would dive to tile max zoom)
        this.map.fitBounds(
          L.latLngBounds(sites.map((s) => [s.coordinates.lat, s.coordinates.lng])),
          { padding: [24, 24], maxZoom: 8 },
        );
        this.fitted = true;
      }
    });

    effect(() => {
      if (!this.mapReady()) return;
      // read BEFORE the loop: when this runs against an empty marker map (sites still
      // loading), a loop-only read would drop these from the effect's dependency set forever
      const scores = this.sitesService.tonightScores();
      const selectedId = this.sitesService.selectedSiteId();
      const size = markerSize(this._zoom());
      for (const site of this.sitesService.sites()) {
        const marker = this.markers.get(site.id);
        if (!marker) continue;
        const icon = markerIcon(site.name, scores.get(site.id), selectedId === site.id);
        const key = `${icon.classes.join(' ')}|${icon.label}|${size}`;
        if (this.iconKeys.get(site.id) === key) continue; // nothing changed — leave the DOM alone
        this.iconKeys.set(site.id, key);
        marker.setIcon(this.makeIcon(icon.classes, size));
        // set on the element, not via options.title: DivIcon reuses its div, so Leaflet's
        // own title handling (new elements only) never fires on a re-style
        marker.getElement()?.setAttribute('title', icon.label);
      }
    });

    effect(() => {
      if (!this.mapReady()) return;
      this.overlayOn() ? this.overlayLayer.addTo(this.map) : this.overlayLayer.remove();
    });
  }

  ngAfterViewInit() {
    // neutral world view until the dataset arrives; fitBounds takes over from there
    this.map = new L.Map(this.mapContainer().nativeElement, {
      zoom: 2,
      center: [20, 0],
    });
    const tiles = new L.TileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 20,
      className: 'basemap-tiles', // scopes the navy tint; the overlay layer must stay untinted
    });
    tiles.addTo(this.map);
    this._zoom.set(this.map.getZoom());
    this.map.on('zoomend', () => this._zoom.set(this.map.getZoom()));
    this.mapReady.set(true);
  }

  ngOnDestroy() {
    this.map?.remove();
  }
}
