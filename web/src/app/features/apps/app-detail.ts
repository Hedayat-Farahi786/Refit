import { Component, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { ConfirmationService, type MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { Menu } from 'primeng/menu';
import { ProgressBar } from 'primeng/progressbar';
import { Api } from '../../core/api';
import { AppState } from '../../core/app-state';
import { relativeTime } from '../../core/format';
import { Notify } from '../../core/notify';
import { CopyButton } from '../../ui/copy-button';
import { EmptyState } from '../../ui/empty-state';
import { ReadinessChip } from '../../ui/readiness-chip';

@Component({
  selector: 'app-app-detail',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Button, Menu, ProgressBar, CopyButton, EmptyState, ReadinessChip],
  template: `
    @if (app(); as app) {
      @if (app.scanState.status === 'scanning') {
        <p-progressbar mode="indeterminate" class="top-progress" aria-label="Scanning" />
      }
      <header class="head">
        <div class="title-row">
          <div class="title-block">
            <h1 class="truncate">{{ app.name }}</h1>
            <div class="source cluster">
              <i class="pi muted" [class]="app.source.kind === 'local' ? 'pi-folder' : 'pi-link'" aria-hidden="true"></i>
              <span class="mono small soft truncate">{{ sourceText() }}</span>
              <app-copy-button [value]="sourceText()" label="Copy the source path" />
            </div>
          </div>
          <div class="actions cluster">
            <app-readiness-chip [readiness]="app.readiness" />
            @if (app.scan) {
              <span class="muted small nowrap">Scanned {{ scannedAgo() }}</span>
            }
            <p-button
              label="Scan again"
              icon="pi pi-refresh"
              severity="secondary"
              [outlined]="true"
              size="small"
              [loading]="app.scanState.status === 'scanning' || starting()"
              (onClick)="scan()"
            />
            <p-button icon="pi pi-ellipsis-h" severity="secondary" [text]="true" size="small" ariaLabel="More actions" (onClick)="menu.toggle($event)" />
            <p-menu #menu [model]="menuItems" [popup]="true" appendTo="body" />
          </div>
        </div>
        <nav class="tabs" aria-label="App sections">
          <a routerLink="overview" routerLinkActive="active" ariaCurrentWhenActive="page"><i class="pi pi-compass" aria-hidden="true"></i>Overview</a>
          <a routerLink="modernize" routerLinkActive="active" ariaCurrentWhenActive="page">
            <i class="pi" [class]="running() ? 'pi-spin pi-spinner' : 'pi-sparkles'" aria-hidden="true"></i>Modernize
            @if (running()) {
              <span class="live-dot" aria-label="A run is in progress"></span>
            }
          </a>
          <a routerLink="history" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }" ariaCurrentWhenActive="page" [class.active]="onRunPage()"><i class="pi pi-history" aria-hidden="true"></i>History</a>
        </nav>
      </header>
      <div class="body">
        <router-outlet />
      </div>
    } @else if (state.loaded()) {
      <app-empty-state icon="pi-question" title="This app is not in Refit any more" text="It may have been removed in another window.">
        <p-button label="Back to apps" severity="secondary" [outlined]="true" (onClick)="router.navigate(['/apps'])" />
      </app-empty-state>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
    }
    .top-progress {
      position: absolute;
      inset: 0 0 auto 0;
      height: 3px;
      z-index: 5;
    }
    .head {
      padding: 28px 32px 0;
      background: var(--refit-panel);
      border-bottom: 1px solid var(--refit-border);
    }
    .title-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .title-block {
      min-width: 0;
      flex: 1 1 320px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .source {
      --cluster-gap: 6px;
      flex-wrap: nowrap;
      min-width: 0;
    }
    .actions {
      --cluster-gap: 10px;
    }
    .tabs {
      display: flex;
      gap: 4px;
      margin-top: 20px;
      overflow-x: auto;
    }
    .tabs a {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      color: var(--refit-text-soft);
      text-decoration: none;
      font-weight: 500;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
      white-space: nowrap;
    }
    .tabs a:hover {
      color: var(--refit-text);
    }
    .tabs a.active {
      color: var(--refit-text);
      border-bottom-color: var(--p-primary-color);
    }
    .tabs .pi {
      font-size: 0.9rem;
    }
    .live-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--p-primary-color);
      box-shadow: 0 0 0 3px var(--refit-accent-soft);
    }
    .body {
      padding: 28px 32px 64px;
      max-width: 1240px;
    }
    @media (max-width: 640px) {
      .head {
        padding: 20px 16px 0;
      }
      .body {
        padding: 20px 16px 48px;
      }
    }
  `,
})
export class AppDetail {
  readonly appId = input.required<string>();

  protected readonly state = inject(AppState);
  protected readonly router = inject(Router);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(ConfirmationService);

  protected readonly starting = signal(false);
  protected readonly app = computed(() => this.state.app(this.appId()));
  protected readonly sourceText = computed(() => {
    const source = this.app()?.source;
    if (!source) return '';
    return source.kind === 'local' ? source.path : `${source.url}${source.subdir ? ` (${source.subdir})` : ''}`;
  });
  protected readonly scannedAgo = computed(() => relativeTime(this.app()?.scan?.scannedAt));
  protected readonly running = computed(() => (this.state.state()?.runs ?? []).some((run) => run.appId === this.appId() && run.status === 'running'));
  private readonly url = toSignal(this.router.events.pipe(filter((event) => event instanceof NavigationEnd), map(() => this.router.url)), { initialValue: this.router.url });
  protected readonly onRunPage = computed(() => this.url().includes('/runs/'));

  protected readonly menuItems: MenuItem[] = [{ label: 'Remove app', icon: 'pi pi-trash', command: () => this.remove() }];

  protected async scan(): Promise<void> {
    this.starting.set(true);
    try {
      this.state.patchApp(await this.api.scanApp(this.appId()));
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.starting.set(false);
    }
  }

  private remove(): void {
    const app = this.app();
    if (!app) return;
    this.confirm.confirm({
      header: `Remove ${app.name}?`,
      message: 'Refit forgets this app and its scan. Your folder or repository is not touched, and branches from earlier runs stay where they are.',
      icon: 'pi pi-trash',
      acceptLabel: 'Remove app',
      rejectLabel: 'Cancel',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: async () => {
        try {
          await this.api.removeApp(app.id);
          this.notify.success('App removed', `${app.name} is no longer in Refit.`);
          this.state.refresh();
          void this.router.navigate(['/apps']);
        } catch (error) {
          this.notify.error(error);
        }
      },
    });
  }
}
