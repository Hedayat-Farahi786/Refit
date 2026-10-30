import { Component, computed, inject, input, signal } from '@angular/core';
import { Button } from 'primeng/button';
import { Skeleton } from 'primeng/skeleton';
import { Api } from '../../../core/api';
import { AppState } from '../../../core/app-state';
import { Notify } from '../../../core/notify';
import { AdvancedSettings } from './advanced-settings';
import { FactsPanel } from './facts-panel';
import { PageList } from './page-list';
import { ReadinessPanel } from './readiness-panel';

@Component({
  selector: 'app-overview',
  imports: [Button, Skeleton, AdvancedSettings, FactsPanel, PageList, ReadinessPanel],
  template: `
    @if (app(); as app) {
      @if (app.scanState.status === 'failed') {
        <div class="panel scan-failed" role="alert">
          <i class="pi pi-times-circle" aria-hidden="true"></i>
          <div class="stack" style="--stack-gap: 4px">
            <strong>The scan failed</strong>
            <span class="soft">{{ app.scanState.error }}</span>
            @if (app.scanState.fix) {
              <span class="muted small">{{ app.scanState.fix }}</span>
            }
          </div>
          <p-button label="Scan again" icon="pi pi-refresh" size="small" [loading]="rescanning()" (onClick)="rescan()" />
        </div>
      }

      @if (!app.scan) {
        @if (app.scanState.status === 'scanning') {
          <div class="panel scanning" aria-busy="true">
            <div class="cluster">
              <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
              <strong aria-live="polite">Scanning the repository</strong>
            </div>
            <p class="muted small">Reading package files, routes and components. This usually takes a few seconds and changes nothing.</p>
            <div class="skeletons">
              <p-skeleton height="1.4rem" width="40%" />
              <p-skeleton height="0.9rem" width="75%" />
              <p-skeleton height="0.9rem" width="60%" />
              <p-skeleton height="7rem" />
            </div>
          </div>
        }
      } @else {
        <div class="layout">
          <div class="main stack" style="--stack-gap: 24px">
            <app-readiness-panel [app]="app" />
            <app-page-list [app]="app" />
            <app-advanced-settings [app]="app" />
          </div>
          <aside class="side stack" style="--stack-gap: 24px">
            <app-facts-panel [scan]="app.scan" />
          </aside>
        </div>
      }
    }
  `,
  styles: `
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 24px;
      align-items: start;
    }
    @media (max-width: 1100px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
      .side {
        order: -1;
      }
    }
    .scan-failed {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 18px 20px;
      margin-bottom: 24px;
      border-color: color-mix(in srgb, var(--refit-danger) 35%, var(--refit-border));
      background: var(--refit-danger-soft);
    }
    .scan-failed > .pi {
      color: var(--refit-danger);
      font-size: 1.25rem;
      margin-top: 2px;
    }
    .scan-failed .stack {
      flex: 1;
    }
    .scanning {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 760px;
    }
    .skeletons {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 8px;
    }
  `,
})
export class Overview {
  readonly appId = input.required<string>();
  private readonly state = inject(AppState);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  protected readonly app = computed(() => this.state.app(this.appId()));
  protected readonly rescanning = signal(false);

  protected async rescan(): Promise<void> {
    this.rescanning.set(true);
    try {
      this.state.patchApp(await this.api.scanApp(this.appId()));
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.rescanning.set(false);
    }
  }
}
