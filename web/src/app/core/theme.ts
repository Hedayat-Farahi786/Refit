import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'refit.theme';

/** Light and dark mode for Refit's own, fixed look (brands are for the apps Refit modernizes). */
@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');

  readonly mode = signal<ThemeMode>(readStoredMode());
  readonly dark = signal(false);

  constructor() {
    this.media?.addEventListener('change', () => this.applyMode());
    effect(() => {
      this.mode();
      this.applyMode();
    });
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Private windows may block storage; the choice still applies for this visit.
    }
  }

  toggle(): void {
    this.setMode(this.dark() ? 'light' : 'dark');
  }

  private applyMode(): void {
    const mode = this.mode();
    const dark = mode === 'dark' || (mode === 'system' && Boolean(this.media?.matches));
    this.dark.set(dark);
    this.document.documentElement.classList.toggle('app-dark', dark);
  }
}

function readStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}
