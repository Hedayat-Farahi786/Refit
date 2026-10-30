import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Toast } from 'primeng/toast';
import { AppState } from './core/app-state';
import { TopBar } from './shell/top-bar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast, ConfirmDialog, TopBar, Button],
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <app-top-bar />
    @if (state.error() && !state.loaded()) {
      <main id="main" class="fatal">
        <div class="panel fatal-card" role="alert">
          <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
          <h1>Refit cannot load its data</h1>
          <p class="soft">{{ state.error()?.message }}</p>
          @if (state.error()?.fix) {
            <p class="muted small">{{ state.error()?.fix }}</p>
          }
          <p-button label="Try again" icon="pi pi-refresh" (onClick)="state.load()" />
        </div>
      </main>
    } @else {
      <div id="main" class="main">
        <router-outlet />
      </div>
    }
    @if (!state.connected()) {
      <div class="offline" role="status" aria-live="polite">
        <i class="pi pi-wifi" aria-hidden="true"></i>
        Lost the connection to Refit. Reconnecting…
      </div>
    }
    <p-toast position="bottom-right" />
    <p-confirmdialog [style]="{ width: '440px', maxWidth: 'calc(100vw - 32px)' }" />
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .main {
      flex: 1 1 auto;
      display: flex;
      min-height: 0;
    }
    .skip-link {
      position: absolute;
      left: 12px;
      top: -48px;
      z-index: 1000;
      padding: 8px 12px;
      border-radius: var(--refit-radius);
      background: var(--refit-panel);
      box-shadow: var(--refit-shadow-float);
    }
    .skip-link:focus {
      top: 8px;
    }
    .fatal {
      flex: 1;
      display: grid;
      place-items: center;
      padding: 24px 16px;
    }
    .fatal-card {
      max-width: 480px;
      padding: 32px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
    }
    .fatal-card .pi {
      font-size: 1.5rem;
      color: var(--refit-danger);
    }
    .offline {
      position: fixed;
      left: 50%;
      bottom: 16px;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--refit-text);
      color: var(--refit-bg);
      font-size: 0.875rem;
      box-shadow: var(--refit-shadow-float);
      z-index: 1100;
    }
  `,
})
export class App {
  protected readonly state = inject(AppState);
}
