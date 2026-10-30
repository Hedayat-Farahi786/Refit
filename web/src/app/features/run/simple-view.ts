import { Component, computed, input } from '@angular/core';
import type { PageRunState, RunRecord, StepState } from '@refit/shared';
import { ProgressBar } from 'primeng/progressbar';
import { Tooltip } from 'primeng/tooltip';
import { duration, usd } from '../../core/format';
import { StatusChip } from '../../ui/status-chip';

const STEP_ICON: Record<StepState['status'], string> = {
  pending: 'pi-circle',
  active: 'pi-spin pi-spinner',
  done: 'pi-check',
  warn: 'pi-exclamation-triangle',
  failed: 'pi-times',
  skipped: 'pi-minus',
};

/** The calm view for everyone: what is happening now, the steps, and page cards that fill in. */
@Component({
  selector: 'app-simple-view',
  imports: [ProgressBar, Tooltip, StatusChip],
  template: `
    <div class="grid">
      <div class="main stack" style="--stack-gap: 24px">
        @if (run().status === 'running') {
          <section class="panel now" aria-labelledby="now-title">
            <h2 id="now-title" class="section-title">Now</h2>
            <p class="activity" aria-live="polite">{{ run().activity || 'Getting started' }}</p>
            <p-progressbar [value]="progress()" [showValue]="false" class="progress" [attr.aria-label]="'Progress ' + progress() + ' percent'" />
            <p class="muted small">Step {{ activeIndex() + 1 }} of {{ run().steps.length }}: {{ activeStep()?.label }}</p>
          </section>
        }

        <section aria-labelledby="pages-heading">
          <div class="pages-head">
            <h2 id="pages-heading">Pages</h2>
            <span class="muted small">{{ pagesSummary() }}</span>
          </div>
          <ul class="cards" role="list">
            @for (page of run().pages; track page.pageId) {
              <li class="panel card" [class.active]="page.status === 'working' || page.status === 'reviewing'">
                <div class="card-head">
                  <div class="card-title">
                    <h3 class="truncate">{{ page.name }}</h3>
                    <span class="mono tiny muted truncate">{{ page.route }}</span>
                  </div>
                  <app-status-chip [page]="page.status" />
                </div>
                <div class="thumbs">
                  <figure>
                    @if (page.shots.before.desktop; as src) {
                      <img [src]="src" [alt]="'Before: ' + page.name" loading="lazy" />
                    } @else {
                      <div class="thumb-empty" aria-hidden="true"><i class="pi pi-image"></i></div>
                    }
                    <figcaption class="tiny muted">Before</figcaption>
                  </figure>
                  <figure>
                    @if (page.shots.after.desktop; as src) {
                      <img [src]="src" [alt]="'After: ' + page.name" loading="lazy" />
                    } @else {
                      <div class="thumb-empty" aria-hidden="true"><i class="pi" [class]="page.status === 'working' ? 'pi-spin pi-spinner' : 'pi-image'"></i></div>
                    }
                    <figcaption class="tiny muted">After</figcaption>
                  </figure>
                </div>
                <ul class="changes small" role="list">
                  @for (change of changesOf(page); track $index) {
                    <li>{{ change }}</li>
                  } @empty {
                    <li class="muted">{{ emptyChange(page) }}</li>
                  }
                </ul>
              </li>
            }
          </ul>
        </section>
      </div>

      <aside class="side stack" style="--stack-gap: 24px">
        <section class="panel steps-panel" aria-labelledby="steps-title">
          <h2 id="steps-title" class="section-title">Steps</h2>
          <ol class="steps" role="list">
            @for (step of run().steps; track step.id) {
              <li class="step" [class]="step.status" [attr.aria-current]="step.status === 'active' ? 'step' : null">
                <span class="dot" aria-hidden="true"><i class="pi" [class]="stepIcon(step)"></i></span>
                <div class="step-text">
                  <span class="step-label">{{ step.label }}<span class="sr-only">: {{ step.status }}</span></span>
                  @if (step.detail) {
                    <span class="tiny muted step-detail" [pTooltip]="step.detail" tooltipPosition="left">{{ step.detail }}</span>
                  }
                </div>
                <span class="tiny muted nowrap">{{ stepTime(step) }}</span>
              </li>
            }
          </ol>
        </section>

        <section class="panel meter" aria-labelledby="cost-title">
          <h2 id="cost-title" class="section-title">Cost</h2>
          @if (run().settings?.provider === 'dryrun') {
            <strong class="meter-value">Free</strong>
            <span class="tiny muted">Dry run does not use AI.</span>
          } @else if (run().cost.unit === 'usd') {
            <strong class="meter-value">{{ spent() }}</strong>
            @if (budget() > 0) {
              <div class="bar" role="meter" [attr.aria-valuenow]="run().cost.usd" aria-valuemin="0" [attr.aria-valuemax]="budget()" [attr.aria-label]="'AI cost so far, out of a budget of ' + budgetLabel()">
                <span [style.width.%]="budgetShare()"></span>
              </div>
              <span class="tiny muted">of a {{ budgetLabel() }} budget</span>
            }
          } @else {
            <strong class="meter-value">{{ run().cost.requests }}</strong>
            <span class="tiny muted">premium requests so far</span>
          }
        </section>
      </aside>
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 300px;
      gap: 24px;
      align-items: start;
    }
    @media (max-width: 1100px) {
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .now {
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .activity {
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .progress {
      height: 6px;
    }
    .pages-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }
    .card {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: border-color 200ms ease, box-shadow 200ms ease;
    }
    .card.active {
      border-color: color-mix(in srgb, var(--p-primary-color) 55%, var(--refit-border));
      box-shadow: 0 0 0 3px var(--refit-accent-soft);
    }
    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }
    .card-title {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .card-title h3 {
      font-size: 0.95rem;
    }
    .thumbs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    figure {
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    figure img,
    .thumb-empty {
      width: 100%;
      aspect-ratio: 16 / 10;
      object-fit: cover;
      object-position: top;
      border-radius: var(--refit-radius);
      border: 1px solid var(--refit-border);
      background: var(--refit-subtle);
    }
    .thumb-empty {
      display: grid;
      place-items: center;
      color: var(--refit-muted);
    }
    .changes {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 0;
      margin: 0;
      list-style: none;
      color: var(--refit-text-soft);
    }
    .changes li {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      padding-left: 14px;
      position: relative;
    }
    .changes li::before {
      content: '';
      position: absolute;
      left: 2px;
      top: 0.62em;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--refit-border-strong);
    }
    .changes li.muted {
      padding-left: 0;
    }
    .changes li.muted::before {
      display: none;
    }
    .changes li:nth-child(n + 4) {
      display: none;
    }
    .side {
      position: sticky;
      top: calc(var(--refit-topbar-height) + 16px);
    }
    .steps-panel,
    .meter {
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .steps {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .step {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: start;
      padding: 6px 0;
    }
    .dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--refit-subtle);
      color: var(--refit-muted);
    }
    .dot .pi {
      font-size: 0.7rem;
    }
    .step.active .dot {
      background: var(--refit-info-soft);
      color: var(--refit-info);
    }
    .step.done .dot {
      background: var(--refit-success-soft);
      color: var(--refit-success);
    }
    .step.warn .dot {
      background: var(--refit-warn-soft);
      color: var(--refit-warn);
    }
    .step.failed .dot {
      background: var(--refit-danger-soft);
      color: var(--refit-danger);
    }
    .step.pending .step-label,
    .step.skipped .step-label {
      color: var(--refit-muted);
    }
    .step.active .step-label {
      font-weight: 600;
    }
    .step-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .step-detail {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meter-value {
      font-size: 1.5rem;
      letter-spacing: -0.02em;
    }
    .bar {
      height: 6px;
      border-radius: 6px;
      background: var(--refit-subtle);
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--p-primary-color);
      transition: width 300ms ease;
    }
  `,
})
export class SimpleView {
  readonly run = input.required<RunRecord>();
  readonly now = input.required<number>();

  protected readonly activeIndex = computed(() => {
    const steps = this.run().steps;
    const active = steps.findIndex((step) => step.status === 'active');
    if (active !== -1) return active;
    const lastDone = steps.map((step) => step.status).lastIndexOf('done');
    return Math.max(0, lastDone);
  });
  protected readonly activeStep = computed<StepState | undefined>(() => this.run().steps[this.activeIndex()]);

  /** Steps count fully, the pages step counts by pages finished. */
  protected readonly progress = computed(() => {
    const run = this.run();
    const finishedSteps = run.steps.filter((step) => ['done', 'warn', 'skipped', 'failed'].includes(step.status)).length;
    const pagesStep = run.steps.find((step) => step.id === 'pages');
    let partial = 0;
    if (pagesStep?.status === 'active' && run.pages.length > 0) {
      partial = run.pages.filter((page) => ['done', 'flagged', 'skipped'].includes(page.status)).length / run.pages.length;
    }
    return Math.round(((finishedSteps + partial) / run.steps.length) * 100);
  });

  protected readonly pagesSummary = computed(() => {
    const pages = this.run().pages;
    const count = (status: PageRunState['status']) => pages.filter((page) => page.status === status).length;
    const parts = [`${count('done')} of ${pages.length} done`];
    if (count('flagged')) parts.push(`${count('flagged')} flagged`);
    if (count('skipped')) parts.push(`${count('skipped')} skipped`);
    return parts.join(' · ');
  });

  protected readonly budget = computed(() => this.run().settings?.perRunUsd ?? 0);
  protected readonly budgetLabel = computed(() => usd(this.budget()));
  protected readonly spent = computed(() => usd(this.run().cost.usd));
  protected readonly budgetShare = computed(() => (this.budget() > 0 ? Math.min(100, (this.run().cost.usd / this.budget()) * 100) : 0));

  protected stepIcon(step: StepState): string {
    return STEP_ICON[step.status];
  }

  protected stepTime(step: StepState): string {
    if (!step.startedAt || step.status === 'skipped') return '';
    const end = step.finishedAt ? new Date(step.finishedAt).getTime() : this.now();
    return duration(end - new Date(step.startedAt).getTime());
  }

  protected changesOf(page: PageRunState): string[] {
    return page.report?.changes ?? [];
  }

  protected emptyChange(page: PageRunState): string {
    if (page.note) return page.note;
    switch (page.status) {
      case 'queued':
        return 'Waiting for its turn.';
      case 'working':
        return 'The agent is restyling this page.';
      case 'reviewing':
        return 'A second agent is checking the design.';
      default:
        return page.report?.summary || 'No changes described.';
    }
  }
}
