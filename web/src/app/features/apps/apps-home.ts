import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AppRecord, Readiness, RunRecord } from '@refit/shared';
import { Button } from 'primeng/button';
import { AppState } from '../../core/app-state';
import { relativeTime } from '../../core/format';
import { Shell } from '../../core/shell';

const READINESS: Record<Readiness, { label: string; tone: string }> = {
  green: { label: 'Ready', tone: 'ok' },
  yellow: { label: 'Check first', tone: 'warn' },
  red: { label: 'Blocked', tone: 'bad' },
};

const RUN_LABEL: Record<RunRecord['status'], string> = {
  running: 'Modernizing now',
  done: 'Ready for review',
  failed: 'Last run failed',
  cancelled: 'Last run cancelled',
  interrupted: 'Last run interrupted',
};

@Component({
  selector: 'app-apps-home',
  imports: [RouterLink, Button],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1 class="display">Apps</h1>
          <p class="lede">Modernize Angular front ends page by page onto PrimeNG and your brand. Nothing changes until you review it.</p>
        </div>
        @if (state.apps().length) {
          <p-button label="Add app" icon="pi pi-plus" (onClick)="shell.openAddApp()" />
        }
      </header>

      @if (state.apps().length === 0) {
        <section class="welcome panel" aria-labelledby="welcome-title">
          <div class="welcome-text">
            <h2 id="welcome-title">Start with one app</h2>
            <p class="soft">Point Refit at an Angular app on your computer or at its git URL. The first scan is free, takes seconds and changes nothing.</p>
            <p-button label="Add your first app" icon="pi pi-plus" (onClick)="shell.openAddApp()" />
          </div>
          <ol class="steps" role="list">
            <li>
              <span class="num">1</span>
              <div><strong>Scan</strong><p class="muted small">Finds the pages and anything to fix first.</p></div>
            </li>
            <li>
              <span class="num">2</span>
              <div><strong>Modernize</strong><p class="muted small">An AI agent restyles one page at a time with your brand, on its own branch.</p></div>
            </li>
            <li>
              <span class="num">3</span>
              <div><strong>Review</strong><p class="muted small">Compare before and after, then open a pull request.</p></div>
            </li>
          </ol>
        </section>
      } @else {
        <ul class="grid" role="list">
          @for (app of apps(); track app.id) {
            <li>
              <a class="card" [routerLink]="['/apps', app.id]">
                <div class="card-top">
                  <span class="card-name truncate">{{ app.name }}</span>
                  @if (app.scanState.status === 'scanning') {
                    <span class="pill">Scanning</span>
                  } @else if (app.scanState.status === 'failed') {
                    <span class="pill bad">Scan failed</span>
                  } @else if (app.readiness) {
                    <span class="pill" [class]="readiness(app.readiness).tone">{{ readiness(app.readiness).label }}</span>
                  } @else {
                    <span class="pill">Not scanned</span>
                  }
                </div>
                <span class="card-source mono truncate">{{ source(app) }}</span>
                <dl class="facts">
                  <div>
                    <dt>Pages</dt>
                    <dd>{{ app.pages.length || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Angular</dt>
                    <dd>{{ app.scan?.angular?.version ?? '—' }}</dd>
                  </div>
                  <div>
                    <dt>Scanned</dt>
                    <dd>{{ app.scan ? ago(app.scan.scannedAt) : '—' }}</dd>
                  </div>
                </dl>
                @if (lastRun(app); as run) {
                  <span class="last-run small" [class.live]="run.status === 'running'">
                    <i class="pi" [class]="run.status === 'running' ? 'pi-spin pi-spinner' : 'pi-history'" aria-hidden="true"></i>
                    {{ runLabel(run) }} · {{ ago(run.startedAt) }}
                  </span>
                } @else {
                  <span class="last-run small muted">Not modernized yet</span>
                }
              </a>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .welcome {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
      gap: 40px;
      padding: 40px;
      align-items: center;
    }
    .welcome-text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }
    .welcome-text h2 {
      font-family: var(--refit-display);
      font-weight: 500;
      font-size: 1.5rem;
    }
    .steps {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .steps li {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 14px 16px;
      border-radius: var(--refit-radius-lg);
      background: var(--refit-bg);
    }
    .num {
      flex: 0 0 24px;
      height: 24px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--refit-text);
      color: var(--refit-panel);
      font-weight: 600;
      font-size: 0.78rem;
    }
    @media (max-width: 820px) {
      .welcome {
        grid-template-columns: minmax(0, 1fr);
        padding: 24px;
        gap: 24px;
      }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 6px;
      height: 100%;
      padding: 20px 20px 16px;
      border: 1px solid var(--refit-border);
      border-radius: var(--refit-radius-xl);
      background: var(--refit-panel);
      color: inherit;
      text-decoration: none;
      box-shadow: var(--refit-shadow-card);
      transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
    }
    .card:hover {
      border-color: var(--refit-border-strong);
      box-shadow: var(--refit-shadow-float);
      transform: translateY(-1px);
    }
    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .card-name {
      font-weight: 600;
      font-size: 1.05rem;
    }
    .card-source {
      font-size: 0.78rem;
      color: var(--refit-muted);
      direction: rtl;
      text-align: left;
    }
    .facts {
      display: grid;
      grid-template-columns: auto auto minmax(0, 1fr);
      gap: 8px 28px;
      margin: 14px 0 12px;
      padding: 12px 0;
      border-top: 1px solid var(--refit-border);
      border-bottom: 1px solid var(--refit-border);
    }
    .facts dt {
      font-size: 0.72rem;
      color: var(--refit-muted);
    }
    .facts dd {
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }
    .last-run {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--refit-text-soft);
      margin-top: auto;
    }
    .last-run .pi {
      font-size: 0.8rem;
      color: var(--refit-muted);
    }
    .last-run.live,
    .last-run.live .pi {
      color: var(--refit-accent-text);
    }
  `,
})
export class AppsHome {
  protected readonly state = inject(AppState);
  protected readonly shell = inject(Shell);

  protected readonly apps = computed(() => [...this.state.apps()].sort((a, b) => a.name.localeCompare(b.name)));
  private readonly lastRuns = computed(() => {
    const byApp = new Map<string, RunRecord>();
    for (const run of this.state.state()?.runs ?? []) {
      if (run.kind === 'modernize' && !byApp.has(run.appId)) byApp.set(run.appId, run);
    }
    return byApp;
  });

  protected readiness(value: Readiness): { label: string; tone: string } {
    return READINESS[value];
  }

  protected source(app: AppRecord): string {
    return app.source.kind === 'local' ? app.source.path : app.source.url;
  }

  protected lastRun(app: AppRecord): RunRecord | undefined {
    return this.lastRuns().get(app.id);
  }

  protected runLabel(run: RunRecord): string {
    return RUN_LABEL[run.status];
  }

  protected ago(iso: string): string {
    return relativeTime(iso);
  }
}
