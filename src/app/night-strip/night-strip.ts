import { Component, computed, input } from '@angular/core';
import { DateTime } from 'luxon';
import { ScoredNight } from '../services/sites';
import { bestWindow } from '../site-panel/night-windows';

/** Below this share of the axis the bracket cannot hold its own times legibly. */
const CAPTION_MIN_WIDTH_PERCENT = 25;

/** Plot box in viewBox units: x is the shared 0–100 axis, y runs 0 (top) to PLOT_H (baseline). */
const PLOT_H = 24;

/** The arc is drawn against a FIXED 0–90° scale, not the night's own range, so that a low
 *  moon looks low — two nights are only comparable if the axis does not move under them. */
const MAX_ALTITUDE_DEG = 90;

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

  /** The moon's altitude across the axis. Below the horizon rests on the baseline — "down"
   *  is one message, not a range of depths. */
  moonArcPath = computed(() => {
    const samples = this.night().moonAltitude;
    if (!samples.length) return '';
    const points = samples.map((s) => {
      const clamped = Math.max(0, Math.min(MAX_ALTITUDE_DEG, s.altitudeDeg));
      const y = PLOT_H - (clamped / MAX_ALTITUDE_DEG) * PLOT_H;
      return `${this.toPercent(s.time).toFixed(2)},${y.toFixed(2)}`;
    });
    return `M${points.join('L')}`;
  });

  /** Hourly cover as a filled area. Closed to the baseline at both ends so it reads as fill. */
  cloudAreaPath = computed(() => {
    const hours = this.night().cloudHours;
    if (!hours.length) return '';
    const x = (i: number) => this.toPercent(hours[i].time).toFixed(2);
    const points = hours.map(
      (h, i) => `${x(i)},${(PLOT_H - (h.cloudCover / 100) * PLOT_H).toFixed(2)}`,
    );
    return `M${x(0)},${PLOT_H.toFixed(2)}L${points.join('L')}L${x(hours.length - 1)},${PLOT_H.toFixed(2)}Z`;
  });

  gradient = computed(() => {
    const s = this.darkStartPercent();
    const e = this.darkEndPercent();
    // the strip's own twilight ramp, not the surface palette — see night-strip.scss
    return `linear-gradient(90deg,
    var(--twilight-far) 0%,
    var(--twilight-near) ${s * 0.55}%,
    var(--twilight-core) ${s}%,
    var(--twilight-core) ${e}%,
    var(--twilight-near) ${e + (100 - e) * 0.45}%,
    var(--twilight-far) 100%)`;
  });

  toPercent(t: DateTime): number {
    const axisStart = this.night().civilDusk.toMillis();
    const axisEnd = this.night().civilDawn.toMillis();
    return ((t.toMillis() - axisStart) / (axisEnd - axisStart)) * 100;
  }
}
