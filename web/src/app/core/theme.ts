import { DOCUMENT } from '@angular/common';
import { Injectable, effect, inject, signal } from '@angular/core';
import { definePreset, usePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import type { Brand } from '@refit/shared';
import { brandCss, brandPresetTokens } from '@refit/shared';
import { AppState } from './app-state';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'refit.theme';

/**
 * Light/dark mode and the brand. Refit renders itself with the same brand generator it uses for
 * target apps, so the UI always looks like the apps it produces.
 */
@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly document = inject(DOCUMENT);
  private readonly appState = inject(AppState);
  private readonly media = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');
  private appliedBrandKey = '';

  readonly mode = signal<ThemeMode>(readStoredMode());
  readonly dark = signal(false);

  constructor() {
    this.media?.addEventListener('change', () => this.applyMode());
    effect(() => {
      this.mode();
      this.applyMode();
    });
    effect(() => {
      const brand = this.appState.uiBrand();
      if (brand) this.applyBrand(brand);
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

  /** Applies a brand to Refit itself (also used by the Brand studio preview). */
  applyBrand(brand: Brand): void {
    const key = JSON.stringify([brand.primary, brand.surface, brand.radius, brand.fontFamily, brand.fontImport]);
    if (key === this.appliedBrandKey) return;
    this.appliedBrandKey = key;
    usePreset(definePreset(Aura, brandPresetTokens(brand)));
    let style = this.document.getElementById('refit-brand') as HTMLStyleElement | null;
    if (!style) {
      style = this.document.createElement('style');
      style.id = 'refit-brand';
      this.document.head.prepend(style);
    }
    // The brand's base colors are for light pages; layering them lets Refit's dark mode win.
    style.textContent = brandCss(brand, undefined, { layer: 'reset' });
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
