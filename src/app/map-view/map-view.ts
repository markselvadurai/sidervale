import {
  Component,
  ElementRef,
  viewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import * as maplibregl from 'maplibre-gl';

import { SitesService } from '../services/sites';
import { SitePanel } from '../site-panel/site-panel';
import { RankedList } from '../ranked-list/ranked-list';
import { siteKind } from '../models/site-kind';
import { HomeService } from '../services/home';
import { sitesToFeatures } from './map-features';
import {
  BASEMAP_STYLE_URL,
  GROUND,
  indigoOverrides,
  labelLayout,
  LP_AXIS,
  lpGradient,
  OVERLAY_OPACITY,
  selectionPaint,
  siteCirclePaint,
} from './map-style';
import { bortleText } from '../site-panel/site-display';

/** MapLibre requires WebGL2 and reports its absence asynchronously; ask up front instead. */
function hasWebGl2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** Close enough to read a region, far enough to keep its neighbours on screen. */
const HOME_ZOOM = 6;

const SITES_SOURCE = 'sites';
const OVERLAY_SOURCE = 'light-pollution';

@Component({
  selector: 'app-map-view',
  imports: [SitePanel, RankedList],
  templateUrl: './map-view.html',
  styleUrl: './map-view.scss',
})
export class MapView implements AfterViewInit, OnDestroy {
  protected sitesService = inject(SitesService);
  private homeService = inject(HomeService);
  mapContainer = viewChild.required<ElementRef<HTMLDivElement>>('mapContainer');
  private map?: maplibregl.Map;
  private resizeObserver?: ResizeObserver;
  mapReady = signal(false);
  /** WebGL2 is not universal: old devices, disabled GPU acceleration, some remote sessions.
   *  The canvas is then impossible, but the site index and ranked list still answer the
   *  question the product exists for — so degrade loudly rather than dying. */
  mapUnavailable = signal(false);
  overlayOn = signal(false);
  // the key reads from the same constants the layer paints with, so it cannot drift
  protected readonly lpGradient = lpGradient();
  protected readonly overlayOpacity = OVERLAY_OPACITY;
  protected readonly lpEnds = LP_AXIS.map((mpsas) => bortleText(mpsas));

  markerFilter = signal<'destinations' | 'communities' | 'all'>('destinations');
  // open by default: the ranked list IS the answer to "where tonight", not a drawer beside it
  listOpen = signal(true);
  protected readonly filterOptions = [
    { value: 'destinations' as const, label: 'Parks' },
    { value: 'communities' as const, label: 'Towns' },
    { value: 'all' as const, label: 'All' },
  ];
  protected visibleSites = computed(() => {
    const mode = this.markerFilter();
    if (mode === 'all') return this.sitesService.sites();
    const want = mode === 'destinations' ? 'destination' : 'community';
    return this.sitesService.sites().filter((s) => siteKind(s) === want);
  });

  /** The map's entire source of truth — pure, and what the hidden site list renders from. */
  protected features = computed(() =>
    sitesToFeatures(
      this.visibleSites(),
      this.sitesService.tonightScores(),
      this.sitesService.selectedSiteId(),
    ),
  );

  private fitted = false;
  private lastHome: string | null = null;

  constructor() {
    // one effect now: setData is a diff, so there is no marker DOM to rebuild or cache
    effect(() => {
      const data = this.features();
      if (!this.mapReady()) return;
      const source = this.map?.getSource(SITES_SOURCE) as maplibregl.GeoJSONSource | undefined;
      // derive the accepted shape from MapLibre rather than naming the GeoJSON namespace,
      // which tsconfig's `types: []` deliberately keeps out of scope
      source?.setData(data as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0]);

      if (data.features.length && !this.fitted) {
        const bounds = new maplibregl.LngLatBounds();
        for (const f of data.features) bounds.extend(f.geometry.coordinates);
        // maxZoom guards the degenerate one-site bounds, as the Leaflet version did
        this.map?.fitBounds(bounds, { padding: 24, maxZoom: 8, animate: false });
        this.fitted = true;
      }
    });

    // changing home moves the view there: the ranked list re-anchors, and a map still framed
    // on the old region would silently disagree with the list beside it
    effect(() => {
      const home = this.homeService.home();
      // read for the dependency only: the camera can be commanded the moment the Map exists,
      // and `load` waits for a first RENDER — which a background tab never performs, so
      // gating on readiness would strand the map for anyone who changes home before looking
      this.mapReady();
      const map = this.map;
      if (!map) return;
      const key = `${home.lat},${home.lng}`;
      // the first read after the map is ready is the CURRENT home, not a change to it
      if (this.lastHome === null || this.lastHome === key) {
        this.lastHome = key;
        return;
      }
      this.lastHome = key;
      map.flyTo({
        center: [home.lng, home.lat],
        zoom: Math.max(map.getZoom(), HOME_ZOOM),
        // the OS opt-out governs a 2s camera flight as much as it governs a CSS transition
        animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
    });

    effect(() => {
      const on = this.overlayOn();
      if (!this.mapReady()) return;
      this.map?.setLayoutProperty(OVERLAY_SOURCE, 'visibility', on ? 'visible' : 'none');
    });
  }

  ngAfterViewInit() {
    // ask BEFORE constructing: MapLibre's WebGL failure surfaces asynchronously, so a
    // try/catch around the constructor does not catch it (verified — the catch never ran)
    if (!hasWebGl2()) {
      this.mapUnavailable.set(true);
      return;
    }
    try {
      this.buildMap();
    } catch (error) {
      this.mapUnavailable.set(true);
      console.warn('map could not initialise — falling back to the list', error);
    }
  }

  private buildMap() {
    const map = new maplibregl.Map({
      container: this.mapContainer().nativeElement,
      style: BASEMAP_STYLE_URL,
      center: [0, 20],
      zoom: 2,
      minZoom: 2,
      renderWorldCopies: false, // one world, not a repeating wallpaper of them
      attributionControl: { compact: true },
    });
    this.map = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

    // lazy-loading moved ngAfterViewInit ahead of the host having layout, so the container can
    // measure 0 and MapLibre silently falls back to a 400x300 canvas. Watch and re-measure.
    this.resizeObserver = new ResizeObserver(() => map.resize());
    this.resizeObserver.observe(this.mapContainer().nativeElement);

    map.on('load', () => {
      map.resize();
      // NO setMaxBounds here. It throws "Cannot read properties of null" until the transform
      // has settled after a first render — and as the load handler's first statement it
      // silently skipped every addSource/addLayer below it, which is what made the map blank.
      // renderWorldCopies: false already gives the one-world behaviour maxBounds was added for.
      this.paintGround(map);

      // the light-pollution raster. Leaflet needed tileSize 1024 + zoomOffset -2; MapLibre has
      // no zoomOffset, so the same 1024px tiles are declared directly and capped at their
      // native zoom instead. Verify visually against a known light-polluted area before trusting.
      map.addSource(OVERLAY_SOURCE, {
        type: 'raster',
        tiles: ['https://djlorenz.github.io/astronomy/image_tiles/tiles2024/tile_{z}_{x}_{y}.png'],
        tileSize: 1024,
        maxzoom: 6,
        attribution: 'Light pollution: D. Lorenz',
      });
      map.addLayer({
        id: OVERLAY_SOURCE,
        type: 'raster',
        source: OVERLAY_SOURCE,
        paint: { 'raster-opacity': OVERLAY_OPACITY },
        layout: { visibility: 'none' },
      });

      map.addSource(SITES_SOURCE, {
        type: 'geojson',
        data: this.features() as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0],
      });
      map.addLayer({
        id: 'site-selection',
        type: 'circle',
        source: SITES_SOURCE,
        filter: ['==', ['get', 'selected'], true],
        paint: selectionPaint(),
      });
      map.addLayer({
        id: 'site-circles',
        type: 'circle',
        source: SITES_SOURCE,
        paint: siteCirclePaint(),
      });
      map.addLayer({
        id: 'site-labels',
        type: 'symbol',
        source: SITES_SOURCE,
        minzoom: 5, // zoom-gated, collision-managed — what Leaflet could not do
        layout: labelLayout(),
        paint: { 'text-color': '#e6ebf3', 'text-halo-color': '#080c12', 'text-halo-width': 1.2 },
      });

      map.on('click', 'site-circles', (e) => {
        const id = e.features?.[0]?.properties?.['id'];
        if (typeof id === 'string') this.sitesService.selectSite(id);
      });
      map.on('mouseenter', 'site-circles', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'site-circles', () => (map.getCanvas().style.cursor = ''));

      this.mapReady.set(true);
    });
    map.on('error', (e) => console.warn('map error', e?.error ?? e));
  }

  /** Repaint the vendor style's grounds to ours. Paint, not a filter over the canvas. */
  private paintGround(map: maplibregl.Map) {
    map.setPaintProperty('background', 'background-color', GROUND);
    const rules = indigoOverrides();
    for (const layer of map.getStyle().layers ?? []) {
      if (layer.type !== 'fill' && layer.type !== 'background') continue;
      for (const rule of rules) {
        if (!rule.match.test(layer.id)) continue;
        try {
          map.setPaintProperty(layer.id, rule.prop as 'fill-color', rule.value);
        } catch {
          // a vendor style may not carry every property; skipping is correct, not an error
        }
      }
    }
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    try {
      this.map?.remove();
    } catch (error) {
      // a map that failed to initialise can still leave partial state behind; tearing the
      // component down must never throw on top of the original failure
      console.warn('map teardown', error);
    }
  }
}
