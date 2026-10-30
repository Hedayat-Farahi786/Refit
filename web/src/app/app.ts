import { Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Button } from 'primeng/button';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { Drawer } from 'primeng/drawer';
import { Toast } from 'primeng/toast';
import { filter } from 'rxjs';
import { AppState } from './core/app-state';
import { isPreviewPage, Shell } from './core/shell';
import { AddAppDialog } from './features/apps/add-app-dialog';
import { Sidebar } from './shell/sidebar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast, ConfirmDialog, Drawer, Button, Sidebar, AddAppDialog],
  template: `
    @if (preview) {
      <router-outlet />
    } @else {
      <a class="skip-link" href="#main">Skip to content</a>
      <div class="layout">
        <aside class="rail" aria-label="Refit">
          <app-sidebar />
        </aside>

        <header class="mobile-bar">
          <p-button
            icon="pi pi-bars"
            [text]="true"
            severity="secondary"
            ariaLabel="Open the menu"
            (onClick)="shell.drawerOpen.set(true)"
          />
          <span class="mobile-name">Refit</span>
        </header>
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
          <main id="main" class="main" tabindex="-1">
            <router-outlet />
          </main>
        }
      </div>
      <p-drawer
        [visible]="shell.drawerOpen()"
        (visibleChange)="shell.drawerOpen.set($event)"
        position="left"
        [showCloseIcon]="false"
        styleClass="refit-drawer"
        ariaLabel="Menu"
      >
        <app-sidebar />
      </p-drawer>
      @if (!state.connected()) {
        <div class="offline" role="status" aria-live="polite">
          <i class="pi pi-wifi" aria-hidden="true"></i>
          Lost the connection to Refit. Reconnecting…
        </div>
      }
      <app-add-app-dialog [visible]="shell.addAppOpen()" (visibleChange)="shell.addAppOpen.set($event)" />
      <p-toast position="bottom-right" />
      <p-confirmdialog [style]="{ width: '440px', maxWidth: 'calc(100vw - 32px)' }" />
    }
  `,
  styles: `
    .layout {
      display: grid;
      grid-template-columns: var(--refit-sidebar-width) minmax(0, 1fr);
      min-height: 100vh;
    }
    .rail {
      grid-column: 1;
      grid-row: 1;
      position: sticky;
      top: 0;
      height: 100vh;
      border-right: 1px solid var(--refit-border);
    }
    .main,
    .fatal {
      grid-column: 2;
      grid-row: 1;
    }
    .main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      outline: none;
    }
    .mobile-bar {
      display: none;
    }
    @media (max-width: 900px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto 1fr;
      }
      .rail {
        display: none;
      }
      .main,
      .fatal {
        grid-column: 1;
        grid-row: 2;
      }
      .mobile-bar {
        grid-row: 1;
        position: sticky;
        top: 0;
        z-index: 40;
        display: flex;
        align-items: center;
        gap: 4px;
        height: var(--refit-topbar-height);
        padding: 0 8px;
        background: color-mix(in srgb, var(--refit-bg) 88%, transparent);
        backdrop-filter: saturate(1.4) blur(10px);
        border-bottom: 1px solid var(--refit-border);
      }
      .mobile-name {
        font-family: var(--refit-display);
        font-weight: 600;
        font-size: 1.2rem;
        letter-spacing: -0.02em;
      }
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
  protected readonly shell = inject(Shell);
  protected readonly preview = isPreviewPage();

  constructor() {
    // Close the drawer after navigating, wherever the navigation came from.
    inject(Router)
      .events.pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.shell.drawerOpen.set(false));
  }
}
