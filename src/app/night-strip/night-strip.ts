import { Component, computed, input } from '@angular/core';
import { DateTime } from 'luxon';
import { ScoredNight } from '../services/sites';
import { bestWindow } from '../site-panel/night-windows';

/** Below this share of the axis the bracket cannot hold its own times legibly. */
const CAPTION_MIN_WIDTH_PERCENT = 25;

@Component({
  selector: 'app-night-strip',
  imports: [],
  templateUrl: './night-strip.html',
  styleUrl: './night-strip.scss',
})
export class NightStrip {
  CLOUD_RENDER_THRESHOLD = 15;
  night = input.required<ScoredNight>();
  duskDisplay = computed(() => this.night().civilDusk.toFormat('HH:mm'));
  dawnDisplay = computed(() => this.night().civilDawn.toFormat('HH:mm'));
  darkStartDisplay = computed(() => this.night().darknessWindow.start.toFormat('HH:mm'));
  darkEndDisplay = computed(() => this.night().darknessWindow.end.toFormat('HH:mm'));

  duskPercent = computed(() => this.toPercent(this.night().civilDusk));
  darkStartPercent = computed(() => this.toPercent(this.night().darknessWindow.start));
  darkEndPercent = computed(() => this.toPercent(this.night().darknessWindow.end));
  dawnPercent = computed(() => this.toPercent(this.night().civilDawn));

  showDuskLabel = computed(() => this.darkStartPercent() > 10);
  showDawnLabel = computed(() => this.darkEndPercent() < 90);

  cloudClass(cover: number): string {
    if (cover >= 75) return 'cloud--heavy';
    if (cover >= 45) return 'cloud--mid';
    return 'cloud--light'; // ≥15 guaranteed — the render threshold already filtered
  }

  cloudCells = computed(() => {
    const axisMinutes = this.night().civilDawn.diff(this.night().civilDusk, 'minutes').minutes;
    const width = (60 / axisMinutes) * 100;
    return this.night()
      .cloudHours.filter((h) => h.cloudCover >= this.CLOUD_RENDER_THRESHOLD)
      .map((h) => ({ left: this.toPercent(h.time), width, cover: h.cloudCover }));
  });

  moonBands = computed(() =>
    this.night().moonSegments.map((s) => ({
      left: this.toPercent(s.start),
      width: this.toPercent(s.end) - this.toPercent(s.start),
    })),
  );

  /** The longest moonless stretch, placed on the civil axis. Null when the moon owns the night. */
  bestWindowBand = computed(() => {
    const window = bestWindow(this.night());
    if (!window) return null;
    const left = this.toPercent(window.start);
    const width = this.toPercent(window.end) - left;
    return {
      left,
      width,
      label: `${window.start.toFormat('HH:mm')} – ${window.end.toFormat('HH:mm')}`,
      showCaption: width >= CAPTION_MIN_WIDTH_PERCENT,
    };
  });

  /** Only the bands this night actually paints — a key to an absent colour sends the eye hunting. */
  legend = computed(() => {
    const items = [
      { key: 'twilight', label: 'Twilight' },
      { key: 'dark', label: 'True dark' },
    ];
    if (this.moonBands().length) items.push({ key: 'moon', label: 'Moon up' });
    if (this.cloudCells().length) items.push({ key: 'cloud', label: 'Cloud' });
    if (this.bestWindowBand()) items.push({ key: 'best', label: 'Best window' });
    return items;
  });

  gradient = computed(() => {
    const s = this.darkStartPercent();
    const e = this.darkEndPercent();
    return `linear-gradient(90deg,
    #1C2B45 0%,
    #0D1526 ${s * 0.55}%,
    var(--zenith) ${s}%,
    var(--zenith) ${e}%,
    #0D1526 ${e + (100 - e) * 0.45}%,
    #1C2B45 100%)`;
  });

  toPercent(t: DateTime): number {
    const axisStart = this.night().civilDusk.toMillis();
    const axisEnd = this.night().civilDawn.toMillis();
    return ((t.toMillis() - axisStart) / (axisEnd - axisStart)) * 100;
  }
}
