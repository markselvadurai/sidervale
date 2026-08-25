import { Routes } from '@angular/router';

// lazy: MapLibre is ~800 kB raw, and the router shell exists precisely so it can be a chunk
// rather than part of the initial bundle
export const routes: Routes = [
  { path: '', loadComponent: () => import('./map-view/map-view').then((m) => m.MapView) },
  {
    path: 'site/:id',
    loadComponent: () => import('./site-detail/site-detail').then((m) => m.SiteDetail),
  },
  // an unknown path lands on the map, never a blank screen
  { path: '**', redirectTo: '' },
];
