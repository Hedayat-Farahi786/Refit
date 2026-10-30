import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { ProviderId, ProviderStatus, ReviewResult } from '@refit/shared';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';
import { Tag } from 'primeng/tag';
import { Api } from '../../../core/api';
import { AppState } from '../../../core/app-state';
import { relativeTime, usd } from '../../../core/format';
import { Notify } from '../../../core/notify';
import { RunStream, type LogEntry } from '../../../core/run-stream';
import { EmptyState } from '../../../ui/empty-state';

const COMPLEXITY_SEVERITY = { low: 'success', medium: 'info', high: 'warn' } as const;

@Component({
  selector: 'app-review',
  imports: [FormsModule, RouterLink, Button, SelectButton, Tag, EmptyState],
  providers: [RunStream],
  template: `
    <section class="panel intro" aria-labelledby="review-title">
      <div class="intro-text">
        <h2 id="review-title">Agent review</h2>
        <p class="soft small">
          A read-only pass: the agent reads the app shell, shared components, global styles and a sample of pages, then suggests where to
          start and what to watch out for. It changes nothing and costs at most {{ budget() }}.
        </p>
      </div>
      <div class="cluster controls">
        <span class="muted small" id="reviewer-label">Reviewer</span>
        <p-selectbutton
          [options]="providerOptions()"
          optionLabel="label"
          optionValue="value"
          [(ngModel)]="provider"
          [allowEmpty]="false"
          size="small"
          ariaLabelledBy="reviewer-label"
        />
        @if (running()) {
          <p-button label="Cancel review" icon="pi pi-stop-circle" severity="danger" [outlined]="true" size="small" (onClick)="cancel()" />
        } @else {
          <p-button [label]="review() ? 'Review again' : 'Start review'" icon="pi pi-search" size="small" [loading]="starting()" [disabled]="!canStart()" (onClick)="start()" />
        }
        @if (notReady(); as names) {
          <a routerLink="/settings" class="small setup-link">Set up {{ names }} in Settings</a>
        }
      </div>
    </section>

    @if (stream.run(); as run) {
      @if (run.status === 'running') {
        <section class="panel live" aria-labelledby="live-title">
          <div class="panel-header">
            <h2 id="live-title"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Reviewing</h2>
            <span class="muted small" aria-live="polite">{{ run.activity }}</span>
          </div>
          <ol class="feed" role="list" aria-label="What the agent is doing">
            @for (entry of feed(); track entry.seq) {
              <li [class]="entry.kind">
                @if (entry.kind === 'tool') {
                  <i class="pi pi-eye" aria-hidden="true"></i><span class="mono small">{{ entry.tool }} {{ entry.target }}</span>
                } @else {
                  <i class="pi pi-comment" aria-hidden="true"></i><span class="small">{{ entry.text }}</span>
                }
              </li>
            } @empty {
              <li class="muted small">Starting…</li>
            }
          </ol>
        </section>
      } @else if (run.status === 'failed') {
        <div class="panel failed" role="alert">
          <i class="pi pi-times-circle" aria-hidden="true"></i>
          <div><strong>The review stopped</strong><p class="soft small">{{ run.message }}</p></div>
        </div>
      }
    }

    @if (review(); as review) {
      <div class="meta muted small">
        Reviewed {{ ago(review.createdAt) }} by {{ providerLabel(review.provider) }} · {{ cost(review) }}
      </div>
      @if (!review.structured) {
        <div class="panel note small soft">The agent did not return the structured review, so only its text is shown.</div>
      }
      <div class="grid">
        <section class="panel card wide" aria-labelledby="summary-title">
          <h2 id="summary-title" class="section-title">Summary</h2>
          <p class="summary">{{ review.summary }}</p>
          @if (review.uiStack.length) {
            <div class="cluster">
              @for (item of review.uiStack; track item) {
                <p-tag [value]="item" severity="secondary" />
              }
            </div>
          }
          @if (review.layout) {
            <p class="soft small"><strong>Layout.</strong> {{ review.layout }}</p>
          }
        </section>

        @if (review.recommendations.length) {
          <section class="panel card" aria-labelledby="recs-title">
            <h2 id="recs-title" class="section-title">Recommendations</h2>
            <ol class="recs">
              @for (item of review.recommendations; track $index) {
                <li>{{ item }}</li>
              }
            </ol>
          </section>
        }

        @if (review.sharedComponents.length) {
          <section class="panel card" aria-labelledby="shared-title">
            <h2 id="shared-title" class="section-title">Modernize these shared parts first</h2>
            <ul class="items" role="list">
              @for (item of review.sharedComponents; track item.name) {
                <li>
                  <strong>{{ item.name }}</strong>
                  <span class="soft small">{{ item.why }}</span>
                  @for (file of item.files; track file) {
                    <code class="tiny">{{ file }}</code>
                  }
                </li>
              }
            </ul>
          </section>
        }

        @if (review.risks.length) {
          <section class="panel card" aria-labelledby="risks-title">
            <h2 id="risks-title" class="section-title">Risks</h2>
            <ul class="items" role="list">
              @for (risk of review.risks; track risk.title) {
                <li class="risk">
                  <strong><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> {{ risk.title }}</strong>
                  <span class="soft small">{{ risk.detail }}</span>
                  @for (file of risk.files; track file) {
                    <code class="tiny">{{ file }}</code>
                  }
                </li>
              }
            </ul>
          </section>
        }

        @if (review.pages.length) {
          <section class="panel card wide" aria-labelledby="pages-review-title">
            <h2 id="pages-review-title" class="section-title">Pages</h2>
            <table class="pages">
              <thead>
                <tr><th scope="col">Route</th><th scope="col">What users do here</th><th scope="col">Complexity</th></tr>
              </thead>
              <tbody>
                @for (page of review.pages; track page.route) {
                  <tr>
                    <td><code>{{ page.route }}</code></td>
                    <td>{{ page.purpose }}@if (page.notes) {<span class="muted small"> · {{ page.notes }}</span>}</td>
                    <td><p-tag [value]="page.complexity" [severity]="severity(page.complexity)" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        }
      </div>
    } @else if (!stream.run()) {
      <div class="panel">
        <app-empty-state [compact]="true" icon="pi-search" title="No review yet" text="Optional, but useful before a first run: it points out shared parts to modernize first and risky pages." />
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 24px;
      max-width: 1100px;
    }
    .intro {
      display: flex;
      align-items: center;
      gap: 24px;
      padding: 20px 24px;
      flex-wrap: wrap;
    }
    .intro-text {
      flex: 1 1 360px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .controls {
      --cluster-gap: 12px;
    }
    .setup-link {
      flex-basis: 100%;
    }
    .live h2 {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .feed {
      list-style: none;
      margin: 0;
      padding: 12px 20px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 360px;
      overflow: auto;
    }
    .feed li {
      display: flex;
      gap: 10px;
      align-items: baseline;
    }
    .feed .pi {
      color: var(--refit-muted);
      font-size: 0.8rem;
    }
    .feed .thought span {
      color: var(--refit-text-soft);
    }
    .failed {
      display: flex;
      gap: 12px;
      padding: 16px 20px;
      background: var(--refit-danger-soft);
    }
    .failed .pi {
      color: var(--refit-danger);
      margin-top: 3px;
    }
    .meta {
      margin-bottom: -12px;
    }
    .note {
      padding: 12px 16px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 20px;
    }
    @media (max-width: 900px) {
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .card {
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .wide {
      grid-column: 1 / -1;
    }
    .summary {
      font-size: 1.05rem;
      line-height: 1.6;
    }
    .recs {
      margin: 0;
      padding-left: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .items {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .items li {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .risk strong .pi {
      color: var(--refit-warn);
      font-size: 0.85rem;
    }
    .pages {
      width: 100%;
      border-collapse: collapse;
    }
    .pages th {
      text-align: left;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--refit-muted);
      padding: 8px 12px 8px 0;
      border-bottom: 1px solid var(--refit-border);
    }
    .pages td {
      padding: 10px 12px 10px 0;
      border-bottom: 1px solid var(--refit-border);
      vertical-align: top;
    }
  `,
})
export class Review {
  readonly appId = input.required<string>();
  protected readonly state = inject(AppState);
  protected readonly stream = inject(RunStream);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  protected provider: ProviderId = 'dryrun';
  private readonly providers = signal<ProviderStatus[]>([]);
  protected readonly starting = signal(false);

  protected readonly app = computed(() => this.state.app(this.appId()));
  protected readonly review = computed<ReviewResult | null>(() => this.app()?.review ?? null);
  protected readonly budget = computed(() => usd(this.state.state()?.config.budget.reviewUsd ?? 0));
  protected readonly running = computed(() => this.stream.run()?.status === 'running');
  protected readonly feed = computed<LogEntry[]>(() => this.stream.log().filter((entry) => entry.kind === 'thought' || entry.kind === 'tool').slice(-60));
  /** Only providers that are ready: a disabled toggle would not say why, the Settings link does. */
  protected readonly providerOptions = computed(() =>
    this.providers()
      .filter((status) => status.available)
      .map((status) => ({ label: status.label, value: status.id })),
  );
  protected readonly notReady = computed(() => {
    const names = this.providers()
      .filter((status) => !status.available)
      .map((status) => status.label);
    return names.length ? names.join(' or ') : null;
  });
  /** The latest review run of this app, to follow it live. */
  private readonly latestReviewRun = computed(() =>
    (this.state.state()?.runs ?? []).find((run) => run.appId === this.appId() && run.kind === 'review') ?? null,
  );

  constructor() {
    void this.loadProviders();
    effect(() => {
      const run = this.latestReviewRun();
      // A finished review shows from the app record; follow only one that runs or failed.
      if (!run || run.status === 'done' || run.status === 'cancelled') return;
      untracked(() => {
        if (this.stream.run()?.id !== run.id) void this.stream.open(run.id);
      });
    });
    const stop = this.stream.onEvent((event) => {
      if (event.type === 'status' && event.status !== 'running') this.state.refresh();
    });
    inject(DestroyRef).onDestroy(() => {
      stop();
      this.stream.close();
    });
  }

  private async loadProviders(): Promise<void> {
    try {
      const providers = await this.api.providers();
      this.providers.set(providers);
      this.provider = (providers.find((status) => status.available && status.id !== 'dryrun') ?? providers.find((status) => status.available))?.id ?? 'dryrun';
    } catch (error) {
      this.notify.error(error, 'Could not check the providers');
    }
  }

  protected canStart(): boolean {
    return Boolean(this.app()?.scan) && !this.starting() && this.providers().some((status) => status.id === this.provider && status.available);
  }

  protected async start(): Promise<void> {
    this.starting.set(true);
    try {
      const run = await this.api.startReview(this.appId(), this.provider);
      await this.stream.open(run.id);
      this.notify.success('Started the review');
      this.state.refresh();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.starting.set(false);
    }
  }

  protected async cancel(): Promise<void> {
    const run = this.stream.run();
    if (!run) return;
    try {
      await this.api.cancelRun(run.id);
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected ago(iso: string): string {
    return relativeTime(iso);
  }

  protected cost(review: ReviewResult): string {
    return review.provider === 'dryrun' ? 'free' : usd(review.costUsd);
  }

  protected providerLabel(id: ProviderId): string {
    return id === 'claude' ? 'Claude Agent' : id === 'copilot' ? 'GitHub Copilot' : 'Dry run';
  }

  protected severity(complexity: 'low' | 'medium' | 'high'): 'success' | 'info' | 'warn' {
    return COMPLEXITY_SEVERITY[complexity];
  }
}
