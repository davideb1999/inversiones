import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { StoreService } from './store.service';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly store = inject(StoreService);
  private readonly media = matchMedia('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media.matches);

  readonly dark = computed(() => {
    const t = this.store.settings().theme;
    return t === 'dark' || (t === 'system' && this.systemDark());
  });

  constructor() {
    this.media.addEventListener('change', (e) => this.systemDark.set(e.matches));
    effect(() => {
      const root = document.documentElement;
      root.dataset['theme'] = this.dark() ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.dark() ? '#121211' : '#f9f9f7');
    });
  }

  /** Lee un token de color CSS ya resuelto para el tema actual. */
  token(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
}
