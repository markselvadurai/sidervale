import { Component, inject } from '@angular/core';
import { HomeService } from '../services/home';

@Component({
  selector: 'app-nav-bar',
  imports: [],
  templateUrl: './nav-bar.html',
  styleUrl: './nav-bar.scss',
})
export class NavBar {
  // home is the one setting that is global rather than per-view, so the shell owns it
  protected home = inject(HomeService);

  protected async useMyLocation() {
    await this.home.useMyLocation();
  }
}
