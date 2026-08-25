import { Routes } from '@angular/router';
import { MapView } from './map-view/map-view';
import { SiteDetail } from './site-detail/site-detail';

export const routes: Routes = [
  { path: '', component: MapView },
  { path: 'site/:id', component: SiteDetail },
  // an unknown path lands on the map, never a blank screen
  { path: '**', redirectTo: '' },
];
