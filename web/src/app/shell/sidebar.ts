import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import type { AppRecord, ProviderStatus } from '@refit/shared';
import { Tooltip } from 'primeng/tooltip';
import { Api } from '../core/api';
import { AppState } from '../core/app-state';
import { Shell } from '../core/shell';
import { Theme } from '../core/theme';

type AppDot = 'running' | 'scanning' | 'failed' | 'green' | 'yellow' | 'red' | 'none';

const DOT_LABEL: Record<AppDot, string> = {
  running: 'A run is in progress',
  scanning: 'Scanning',
  failed: 'The last scan failed',
  green: 'Ready',
  yellow: 'Check first',
  red: 'Blocked',
  none: 'Not scanned',
};

/** The left column: Refit, the main sections, your apps, and the AI and theme controls. */
@Component({
  selector: 'app-sidebar',
  imports: [FormsModule, RouterLink, RouterLinkActive, Tooltip],
  template: `
    <div class="side">
      <a class="wordmark" routerLink="/apps" (click)="shell.drawerOpen.set(false)" aria-label="Refit home">
        <span class="mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <rect width="24" height="24" rx="6.5" fill="currentColor" />
            <path d="M7.25 17.5v-11h5.1a3.45 3.45 0 0 1 1.05 6.74l2.85 4.26h-2.6l-2.6-4h-1.5v4zm2.3-6h2.7a1.5 1.5 0 0 0 0-3h-2.7z" fill="var(--refit-sidebar)" />
          </svg>
        </span>
        <span class="name">Refit</span>
      </a>

      <button type="button" class="add" (click)="shell.openAddApp()"><i class="pi pi-plus" aria-hidden="true"></i>Add app</button>

      <nav class="nav" aria-label="Main">
        <a routerLink="/apps" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" ariaCurrentWhenActive="page" (click)="shell.drawerOpen.set(false)">
          <i class="pi pi-th-large" aria-hidden="true"></i>Apps
        </a>
        <a routerLink="/brands" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="shell.drawerOpen.set(false)">
          <i class="pi pi-palette" aria-hidden="true"></i>Brands
        </a>
        <a routerLink="/settings" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="shell.drawerOpen.set(false)">
          <i class="pi pi-cog" aria-hidden="true"></i>Settings
        </a>
      </nav>

      <section class="apps" aria-labelledby="side-apps-title">
        <h2 id="side-apps-title" class="section-title">Your apps</h2>
        @if (state.apps().length > 6) {
          <label class="search">
            <i class="pi pi-search" aria-hidden="true"></i>
            <input type="search" placeholder="Find an app" aria-label="Find an app" [(ngModel)]="query" (ngModelChange)="querySignal.set($event)" />
          </label>
        }
        <ul role="list">
          @for (app of filtered(); track app.id) {
            <li>
              <a class="app" [routerLink]="['/apps', app.id]" routerLinkActive="active" ariaCurrentWhenActive="page" (click)="shell.drawerOpen.set(false)">
                <span class="dot" [class]="dot(app)" [attr.aria-label]="dotLabel(app)" role="img"></span>
                <span class="truncate">{{ app.name }}</span>
              </a>
            </li>
          } @empty {
            <li class="none muted small">
              @if (state.apps().length) {
                No app matches "{{ query }}".
              } @else {
                Apps you add show up here.
              }
            </li>
          }
        </ul>
      </section>

      <div class="foot">
        <a class="ai" routerLink="/settings" [class.none]="ready().length === 0" [pTooltip]="aiTooltip()" tooltipPosition="top" (click)="shell.drawerOpen.set(false)">
          <span class="ai-dot" aria-hidden="true"></span>
          <span class="truncate">{{ ready().length ? ready().join(' · ') : 'No AI provider set up' }}</span>
          <span class="sr-only">. Open Settings to manage AI providers.</span>
        </a>
        <button
          type="button"
          class="icon-button"
          [pTooltip]="theme.dark() ? 'Switch to light mode' : 'Switch to dark mode'"
          tooltipPosition="top"
          [attr.aria-label]="theme.dark() ? 'Switch to light mode' : 'Switch to dark mode'"
          (click)="theme.toggle()"
        >
          <i class="pi" [class]="theme.dark() ? 'pi-sun' : 'pi-moon'" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .side {
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 14px 12px 12px;
      background: var(--refit-sidebar);
    }
    .wordmark {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 8px 14px;
      text-decoration: none;
      color: var(--refit-text);
    }
    .mark {
      color: var(--refit-text);
    }
    .name {
      font-family: var(--refit-display);
      font-size: 1.35rem;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .add {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 10px;
      margin-bottom: 8px;
      border: 1px solid var(--refit-border-strong);
      border-radius: var(--refit-radius);
      background: var(--refit-panel);
      color: var(--refit-text);
      font-weight: 500;
      cursor: pointer;
      box-shadow: var(--refit-shadow-card);
      transition: border-color 120ms ease, background-color 120ms ease;
    }
    .add:hover {
      border-color: var(--refit-muted);
    }
    .add .pi {
      font-size: 0.8rem;
    }
    .nav {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .nav a,
    .app {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 10px;
      border-radius: var(--refit-radius);
      color: var(--refit-text-soft);
      text-decoration: none;
      font-weight: 500;
      transition: background-color 120ms ease, color 120ms ease;
    }
    .nav a .pi {
      font-size: 0.9rem;
      width: 16px;
      color: var(--refit-muted);
    }
    .nav a:hover,
    .app:hover {
      background: var(--refit-hover);
      color: var(--refit-text);
    }
    .nav a.active,
    .app.active {
      background: var(--refit-selected);
      color: var(--refit-text);
    }
    .nav a.active .pi {
      color: var(--refit-text);
    }
    .apps {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 18px;
    }
    .apps h2 {
      padding: 0 10px 4px;
    }
    .apps ul {
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding-bottom: 8px;
    }
    .app {
      font-weight: 400;
    }
    .dot {
      flex: 0 0 7px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--refit-border-strong);
    }
    .dot.green {
      background: var(--refit-success);
    }
    .dot.yellow {
      background: var(--refit-warn);
    }
    .dot.red,
    .dot.failed {
      background: var(--refit-danger);
    }
    .dot.running {
      background: var(--refit-accent);
      box-shadow: 0 0 0 3px var(--refit-accent-soft);
      animation: pulse 1.6s ease-in-out infinite;
    }
    .dot.scanning {
      background: var(--refit-muted);
      animation: pulse 1.2s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        opacity: 0.35;
      }
    }
    .search {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 2px 6px;
      padding: 6px 10px;
      border: 1px solid var(--refit-border);
      border-radius: var(--refit-radius);
      background: var(--refit-panel);
      color: var(--refit-muted);
    }
    .search input {
      flex: 1;
      min-width: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--refit-text);
    }
    .search:focus-within {
      outline: 2px solid var(--refit-accent);
      outline-offset: 1px;
    }
    .none {
      padding: 6px 10px;
    }
    .foot {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-top: 10px;
      border-top: 1px solid var(--refit-border);
    }
    .ai {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      border-radius: var(--refit-radius);
      font-size: 0.8rem;
      color: var(--refit-text-soft);
      text-decoration: none;
    }
    .ai:hover {
      background: var(--refit-hover);
    }
    .ai-dot {
      flex: 0 0 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--refit-success);
    }
    .ai.none .ai-dot {
      background: var(--refit-warn);
    }
    .icon-button {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: var(--refit-radius);
      background: transparent;
      color: var(--refit-text-soft);
      cursor: pointer;
    }
    .icon-button:hover {
      background: var(--refit-hover);
      color: var(--refit-text);
    }
  `,
})
export class Sidebar {
  protected readonly state = inject(AppState);
  protected readonly shell = inject(Shell);
  protected readonly theme = inject(Theme);
  private readonly api = inject(Api);

  protected query = '';
  protected readonly querySignal = signal('');
  private readonly providers = signal<ProviderStatus[]>([]);

  /** Real AI providers that are ready (the dry run is always there and does not count). */
  protected readonly ready = computed(() => this.providers().filter((provider) => provider.available && provider.id !== 'dryrun').map((provider) => provider.label));
  protected readonly aiTooltip = computed(() =>
    this.ready().length ? 'AI providers that are ready. Manage them in Settings.' : 'Only the dry run works until an AI provider is set up.',
  );

  protected readonly filtered = computed(() => {
    const query = this.querySignal().trim().toLowerCase();
    const apps = [...this.state.apps()].sort((a, b) => a.name.localeCompare(b.name));
    return query ? apps.filter((app) => app.name.toLowerCase().includes(query)) : apps;
  });

  private readonly runningApps = computed(() => {
    const active = this.state.state()?.activeRunId;
    const runs = this.state.state()?.runs ?? [];
    return new Set(runs.filter((run) => run.status === 'running' || run.id === active).map((run) => run.appId));
  });

  constructor() {
    this.api.providers().then(
      (list) => this.providers.set(list),
      () => this.providers.set([]),
    );
  }

  protected dot(app: AppRecord): AppDot {
    if (this.runningApps().has(app.id)) return 'running';
    if (app.scanState.status === 'scanning') return 'scanning';
    if (app.scanState.status === 'failed') return 'failed';
    return app.readiness ?? 'none';
  }

  protected dotLabel(app: AppRecord): string {
    return DOT_LABEL[this.dot(app)];
  }
}
