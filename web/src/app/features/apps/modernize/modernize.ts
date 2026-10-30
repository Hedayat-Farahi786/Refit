import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { ProviderId, ProviderStatus, RunSettings } from '@refit/shared';
import { estimateMaxCost } from '@refit/shared';
import { Button } from 'primeng/button';
import { InputNumber } from 'primeng/inputnumber';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { Tag } from 'primeng/tag';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Api } from '../../../core/api';
import { AppState } from '../../../core/app-state';
import { plural, relativeTime, usd } from '../../../core/format';
import { Notify } from '../../../core/notify';
import { StatusChip } from '../../../ui/status-chip';
import { RunView } from '../../run/run-view';

interface TargetOption {
  label: string;
  value: number | 'keep';
}

@Component({
  selector: 'app-modernize',
  imports: [FormsModule, RouterLink, Button, InputNumber, Select, SelectButton, Tag, ToggleSwitch, StatusChip, RunView],
  template: `
    @if (liveRunId(); as runId) {
      <app-run-view [runId]="runId" [canStartNew]="true" (newRun)="startedRunId.set(null)" />
    } @else if (app(); as app) {
      <div class="layout">
        <form class="stack" style="--stack-gap: 24px" (ngSubmit)="start()">
          @if (lastRun(); as last) {
            <a class="last-run panel" [routerLink]="['../runs', last.id]">
              <app-status-chip [run]="last.status" />
              <span class="soft small">Last run {{ ago(last.startedAt) }}: {{ lastRunSummary() }}</span>
              <span class="spacer"></span>
              <span class="small">View <i class="pi pi-arrow-right" aria-hidden="true"></i></span>
            </a>
          }

          <section class="panel" aria-labelledby="provider-title">
            <div class="panel-header">
              <div class="stack" style="--stack-gap: 2px">
                <h2 id="provider-title">Who does the work</h2>
                <p class="muted small">Every provider gets the same playbook and the same safety checks.</p>
              </div>
            </div>
            <div class="panel-body providers" role="radiogroup" aria-labelledby="provider-title">
              @for (provider of providers(); track provider.id) {
                <label class="provider" [class.selected]="settings.provider === provider.id" [class.disabled]="!provider.available">
                  <input type="radio" name="provider" [value]="provider.id" [(ngModel)]="settings.provider" [disabled]="!provider.available" class="sr-only" />
                  <span class="provider-head">
                    <span class="radio" aria-hidden="true"></span>
                    <strong>{{ provider.label }}</strong>
                    @if (provider.id === 'dryrun') {
                      <p-tag value="Free" severity="secondary" />
                    }
                  </span>
                  <span class="muted small">{{ providerNote(provider) }}</span>
                </label>
              } @empty {
                <p class="muted small">Checking which providers are set up…</p>
              }
            </div>
          </section>

          <section class="panel" aria-labelledby="run-settings-title">
            <div class="panel-header"><h2 id="run-settings-title">Settings for this run</h2></div>
            <div class="panel-body grid">
              <div class="field">
                <label for="run-brand">Brand</label>
                <p-select inputId="run-brand" name="brand" [options]="state.brands()" optionLabel="name" optionValue="id" [(ngModel)]="settings.brandId" [fluid]="true" />
                @if (brandIsDraft()) {
                  <span class="field-hint warn-text"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> This brand is a draft with placeholder values.</span>
                }
              </div>
              <div class="field">
                <label for="run-target">Angular version</label>
                <p-select inputId="run-target" name="target" [options]="targetOptions()" optionLabel="label" optionValue="value" [(ngModel)]="settings.targetAngularMajor" [fluid]="true" />
                <span class="field-hint">{{ targetHint() }}</span>
              </div>
              <div class="field">
                <span class="field-label" id="rounds-label">Design review rounds</span>
                <p-selectbutton name="rounds" [options]="roundOptions" optionLabel="label" optionValue="value" [(ngModel)]="settings.polishRounds" [allowEmpty]="false" ariaLabelledBy="rounds-label" />
                <span class="field-hint">A second agent checks each page against the UI checklist.</span>
              </div>
              <div class="field">
                <span class="field-label" id="api-change-label">If API calls change on a page</span>
                <p-selectbutton name="onApiChange" [options]="apiOptions" optionLabel="label" optionValue="value" [(ngModel)]="settings.onApiChange" [allowEmpty]="false" ariaLabelledBy="api-change-label" />
              </div>
              <label class="switch">
                <p-toggleswitch name="runTests" [(ngModel)]="settings.runTests" [disabled]="!app.scan?.commands?.test" ariaLabel="Run unit tests" />
                <span>
                  <strong>Run unit tests</strong>
                  <span class="field-hint block">{{ app.scan?.commands?.test ? 'Before and after; only new failures count.' : 'This app has no unit tests.' }}</span>
                </span>
              </label>
            </div>
          </section>

          @if (usesDollars()) {
            <section class="panel" aria-labelledby="budget-title">
              <div class="panel-header"><h2 id="budget-title">Budget</h2></div>
              <div class="panel-body grid">
                <div class="field">
                  <label for="run-page-budget">Per page</label>
                  <p-inputnumber inputId="run-page-budget" name="perPage" [(ngModel)]="settings.perPageUsd" mode="currency" currency="USD" [min]="0" [fluid]="true" />
                </div>
                <div class="field">
                  <label for="run-budget">For the whole run</label>
                  <p-inputnumber inputId="run-budget" name="perRun" [(ngModel)]="settings.perRunUsd" mode="currency" currency="USD" [min]="0" [fluid]="true" />
                </div>
              </div>
            </section>
          }
        </form>

        <aside class="side">
          <div class="panel summary">
            <h2 class="section-title">This run</h2>
            <dl class="summary-list">
              <div><dt class="muted small">Pages</dt><dd>{{ includedPages() }} of {{ app.pages.length }}</dd></div>
              <div><dt class="muted small">Provider</dt><dd>{{ selectedProvider()?.label ?? '–' }}</dd></div>
            </dl>
            <div class="cost" aria-live="polite">
              <span class="muted small">Estimated maximum cost</span>
              <strong class="cost-value">{{ costValue() }}</strong>
              <span class="muted tiny">{{ costExplanation() }}</span>
            </div>
            @if (blocker(); as reason) {
              <p class="blocker small" role="note"><i class="pi pi-info-circle" aria-hidden="true"></i> {{ reason }}</p>
            }
            <p-button label="Start modernizing" icon="pi pi-play" [fluid]="true" [loading]="starting()" [disabled]="!!blocker()" (onClick)="start()" />
            <p class="muted tiny">Refit works on its own copy and never pushes or merges. You review everything in a pull request.</p>
          </div>
        </aside>
      </div>
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
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 20px 24px;
    }
    .providers {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }
    .provider {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px 16px;
      border: 1px solid var(--refit-border);
      border-radius: var(--refit-radius-lg);
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease;
    }
    .provider:hover:not(.disabled) {
      border-color: var(--refit-border-strong);
    }
    .provider:has(input:focus-visible) {
      outline: 2px solid var(--refit-accent);
      outline-offset: 2px;
    }
    .provider.selected {
      border-color: var(--refit-text);
      box-shadow: inset 0 0 0 1px var(--refit-text);
    }
    .provider.disabled {
      cursor: not-allowed;
      opacity: 0.7;
    }
    .provider-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .radio {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 2px solid var(--refit-border-strong);
      flex: none;
    }
    .selected .radio {
      border: 5px solid var(--refit-text);
    }
    .switch {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    .block {
      display: block;
    }
    .warn-text {
      color: var(--refit-warn);
    }
    .side {
      position: sticky;
      top: calc(var(--refit-topbar-height) + 16px);
    }
    .summary {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .summary-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .summary-list div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .cost {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 14px 16px;
      border-radius: var(--refit-radius-lg);
      background: var(--refit-subtle);
    }
    .cost-value {
      font-size: 1.6rem;
      letter-spacing: -0.02em;
    }
    .blocker {
      color: var(--refit-text-soft);
      display: flex;
      gap: 8px;
    }
    .last-run {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      color: inherit;
      text-decoration: none;
    }
    .last-run:hover {
      border-color: var(--refit-border-strong);
    }
  `,
})
export class Modernize {
  readonly appId = input.required<string>();
  protected readonly state = inject(AppState);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  protected readonly providers = signal<ProviderStatus[]>([]);
  protected readonly starting = signal(false);
  protected readonly startedRunId = signal<string | null>(null);
  protected settings: RunSettings = {
    provider: 'dryrun',
    brandId: '',
    targetAngularMajor: 'keep',
    polishRounds: 1,
    runTests: false,
    perPageUsd: 1.5,
    perRunUsd: 25,
    onApiChange: 'flag',
    strongModelForComplexPages: false,
  };

  protected readonly roundOptions = [
    { label: 'None', value: 0 },
    { label: '1', value: 1 },
    { label: '2', value: 2 },
  ];
  protected readonly apiOptions = [
    { label: 'Flag the page', value: 'flag' },
    { label: 'Roll it back', value: 'rollback' },
  ];

  protected readonly app = computed(() => this.state.app(this.appId()));
  private readonly appRuns = computed(() => (this.state.state()?.runs ?? []).filter((run) => run.appId === this.appId() && run.kind === 'modernize'));
  protected readonly liveRunId = computed(() => {
    const running = this.appRuns().find((run) => run.status === 'running');
    return running?.id ?? this.startedRunId();
  });
  protected readonly lastRun = computed(() => this.appRuns()[0] ?? null);
  protected readonly lastRunSummary = computed(() => {
    const result = this.lastRun()?.result;
    if (!result) return this.lastRun()?.message ?? 'no result';
    return `${plural(result.pagesDone, 'page')} done${result.pagesFlagged ? `, ${result.pagesFlagged} flagged` : ''}`;
  });
  protected readonly includedPages = computed(() => this.app()?.pages.filter((page) => page.include).length ?? 0);

  constructor() {
    void this.loadProviders();
    effect(() => {
      const app = this.app();
      const config = this.state.state()?.config;
      if (!app || !config) return;
      untracked(() => this.applyDefaults());
    });
  }

  private settingsAppId = '';

  private applyDefaults(): void {
    const app = this.app();
    const state = this.state.state();
    if (!app || !state || this.settingsAppId === app.id) return;
    this.settingsAppId = app.id;
    const config = state.config;
    const major = app.scan?.angular?.major ?? null;
    this.settings = {
      ...this.settings,
      brandId: state.settings.defaultBrandId,
      targetAngularMajor: major !== null && major < config.targetAngularMajor && config.defaults.upgradeAngular ? config.targetAngularMajor : 'keep',
      polishRounds: config.defaults.polishRounds,
      runTests: config.defaults.runTests && Boolean(app.scan?.commands.test),
      perPageUsd: config.budget.perPageUsd,
      perRunUsd: config.budget.perRunUsd,
      onApiChange: config.defaults.onApiChange,
      strongModelForComplexPages: config.defaults.strongModelForComplexPages,
    };
  }

  private async loadProviders(): Promise<void> {
    try {
      const providers = await this.api.providers();
      this.providers.set(providers);
      const preferred = providers.find((provider) => provider.available && provider.id !== 'dryrun') ?? providers.find((provider) => provider.available);
      if (preferred) this.settings.provider = preferred.id;
    } catch (error) {
      this.notify.error(error, 'Could not check the providers');
    }
  }

  protected selectedProvider(): ProviderStatus | undefined {
    return this.providers().find((provider) => provider.id === this.settings.provider);
  }

  protected usesDollars(): boolean {
    return this.settings.provider === 'claude';
  }

  protected brandIsDraft(): boolean {
    return this.state.brands().find((brand) => brand.id === this.settings.brandId)?.status === 'draft';
  }

  protected providerNote(provider: ProviderStatus): string {
    if (!provider.available) return provider.reason ?? 'Not set up.';
    if (provider.id === 'dryrun') return 'No AI. Tests the whole pipeline and marks each page with a comment.';
    if (provider.costUnit === 'usd') return 'Ready. Billed in dollars against your API key.';
    return 'Ready. Uses your Copilot premium requests.';
  }

  protected targetOptions(): TargetOption[] {
    const major = this.app()?.scan?.angular?.major ?? null;
    const target = this.state.state()?.config.targetAngularMajor ?? 21;
    const options: TargetOption[] = [];
    if (major !== null && major < target) options.push({ label: `Upgrade to Angular ${target}`, value: target });
    if (major === null || major >= 18) options.push({ label: `Keep Angular ${major ?? ''}`.trim(), value: 'keep' });
    return options;
  }

  protected targetHint(): string {
    const major = this.app()?.scan?.angular?.major ?? null;
    if (this.settings.targetAngularMajor === 'keep' || major === null) return 'PrimeNG is installed in the version that matches.';
    const steps = (this.settings.targetAngularMajor as number) - major;
    return `${plural(steps, 'upgrade step')}, one major version at a time, each built and committed.`;
  }

  protected costValue(): string {
    const provider = this.selectedProvider();
    if (!provider || provider.id === 'dryrun') return 'Free';
    if (provider.costUnit !== 'usd') return 'Premium requests';
    return `${usd(this.maxCost())} at most`;
  }

  protected costExplanation(): string {
    const provider = this.selectedProvider();
    if (!provider || provider.id === 'dryrun') return 'Dry run does not use AI.';
    if (provider.costUnit !== 'usd') return 'Copilot counts premium requests (or AI credits) instead of dollars.';
    const foundation = this.state.state()?.config.budget.foundationUsd ?? 0;
    return `${plural(this.includedPages(), 'page')} × ${usd(this.settings.perPageUsd)} + ${usd(foundation)} for the theme and app shell, capped at ${usd(this.settings.perRunUsd)}.`;
  }

  private maxCost(): number {
    return estimateMaxCost({
      pages: this.includedPages(),
      perPageUsd: this.settings.perPageUsd,
      perRunUsd: this.settings.perRunUsd,
      foundationUsd: this.state.state()?.config.budget.foundationUsd ?? 0,
    });
  }

  protected blocker(): string | null {
    const app = this.app();
    const state = this.state.state();
    if (!app || !state) return 'Loading…';
    if (state.activeRunId && state.activeRunId !== this.liveRunId()) {
      const other = state.runs.find((run) => run.id === state.activeRunId);
      return `Another run is in progress${other ? ` (${other.appName})` : ''}. Refit runs one modernization at a time.`;
    }
    if (app.scanState.status === 'scanning') return 'Wait for the scan to finish.';
    if (app.readiness === 'red') return 'Fix the blocking items on the Overview tab first.';
    if (this.includedPages() === 0) return 'Include at least one page on the Overview tab.';
    if (app.findings.some((finding) => finding.id === 'params-needed')) return 'Fill in sample values for pages with route parameters on the Overview tab.';
    const provider = this.selectedProvider();
    if (provider && !provider.available) return `${provider.label} is not available: ${provider.reason ?? 'not set up'}`;
    return null;
  }

  protected ago(iso: string): string {
    return relativeTime(iso);
  }

  protected async start(): Promise<void> {
    if (this.blocker()) return;
    this.starting.set(true);
    try {
      const run = await this.api.startRun(this.appId(), { ...this.settings, provider: this.settings.provider as ProviderId });
      this.startedRunId.set(run.id);
      this.notify.success('Started modernizing', `${this.app()?.name}: follow along here.`);
      this.state.refresh();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.starting.set(false);
    }
  }
}
