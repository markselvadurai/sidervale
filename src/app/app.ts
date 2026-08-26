import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavBar } from './nav-bar/nav-bar';
import { SiteFooter } from './site-footer/site-footer';
import { SitesService } from './services/sites';
import { ScoresService } from './services/scores';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavBar, SiteFooter],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private sitesService = inject(SitesService);
  private scores = inject(ScoresService);
  constructor() {
    // two independent fetches; either may land first, the computeds don't care
    void this.sitesService.load();
    void this.scores.load();
  }
  protected readonly title = signal('sidervale');
}
