import { Component, inject, signal } from '@angular/core';
import type { ProviderId, ProviderStatus, ProviderTestResult } from '@refit/shared';
import { Button } from 'primeng/button';
import { Api } from '../../core/api';
import { usd } from '../../core/format';
import { Notify } from '../../core/notify';

const UNIT_LABEL = { usd: 'Costs in US dollars', requests: 'Counts premium requests', credits: 'Counts AI credits' } as const;

/** Which AI providers Refit can use, what each check found, and how to set up the missing ones. */
@Component({
  selector: 'app-providers-panel',
  imports: [Button],
  template: `
    <section class="panel" aria-labelledby="providers-title">
      <div class="panel-header">
        <div class="stack" style="--stack-gap: 2px">
          <h2 id="providers-title">AI providers</h2>
          <p class="muted small">Keys and tokens live only in the <code>.env</code> file in the Refit folder. Restart Refit after changing it.</p>
        </div>
        <p-button label="Check again" icon="pi pi-refresh" severity="secondary" [text]="true" size="small" [loading]="loading()" (onClick)="load()" />
      </div>
      <ul class="providers" role="list" aria-live="polite">
        @for (provider of providers(); track provider.id) {
          <li class="provider">
            <div class="head">
              <i [class]="provider.available ? 'pi pi-check-circle ok' : 'pi pi-minus-circle off'" aria-hidden="true"></i>
              <strong>{{ provider.label }}</strong>
              <span class="badge" [class.ready]="provider.available">{{ provider.available ? 'Ready' : 'Not set up' }}</span>
              <span class="muted small unit">{{ unit(provider) }}</span>
            </div>
            @if (provider.checks.length) {
              <ul class="checks small" role="list">
                @for (check of provider.checks; track check.label) {
                  <li>
                    <i [class]="check.ok ? 'pi pi-check ok' : 'pi pi-times bad'" aria-hidden="true"></i>
                    <span class="sr-only">{{ check.ok ? 'Passed:' : 'Failed:' }}</span>
                    <span class="soft"><strong class="check-label">{{ check.label }}.</strong> {{ check.detail }}</span>
                  </li>
                }
              </ul>
            }
            @if (provider.available && provider.testCost) {
              <div class="test">
                <p-button
                  label="Test connection"
                  icon="pi pi-bolt"
                  severity="secondary"
                  [outlined]="true"
                  size="small"
                  [loading]="testing() === provider.id"
                  [disabled]="testing() !== null"
                  (onClick)="test(provider.id)"
                />
                <span class="muted small">Sends one short request ({{ provider.testCost }}).</span>
                @if (results()[provider.id]; as result) {
                  <p class="result small" [class.failed]="!result.ok" role="status">
                    <i [class]="result.ok ? 'pi pi-check-circle ok' : 'pi pi-times-circle bad'" aria-hidden="true"></i>
                    <span>
                      {{ result.detail }}
                      <span class="muted">{{ resultMeta(result) }}</span>
                    </span>
                  </p>
                }
              </div>
            }
            @if (provider.setup.length) {
              <div class="setup">
                <span class="small"><strong>To set it up</strong></span>
                <ol class="small soft">
                  @for (step of provider.setup; track $index) {
                    <li>{{ step }}</li>
                  }
                </ol>
              </div>
            }
          </li>
        } @empty {
          @if (!loading()) {
            <li class="muted small empty">Could not check the providers.</li>
          }
        }
      </ul>
    </section>
  `,
  styles: `
    .providers {
      display: flex;
      flex-direction: column;
    }
    .provider {
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-top: 1px solid var(--refit-border);
    }
    .head {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .unit {
      margin-left: auto;
    }
    .badge {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--refit-subtle);
      color: var(--refit-text-soft);
    }
    .badge.ready {
      background: var(--refit-success-soft);
      color: var(--refit-success);
    }
    .ok {
      color: var(--refit-success);
    }
    .off {
      color: var(--refit-muted);
    }
    .bad {
      color: var(--refit-danger);
    }
    .checks {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-left: 28px;
    }
    .checks li {
      display: flex;
      gap: 8px;
      align-items: baseline;
    }
    .check-label {
      color: var(--refit-text);
    }
    .checks .pi {
      font-size: 0.75rem;
    }
    .setup {
      margin-left: 28px;
      padding: 10px 14px;
      border-radius: var(--refit-radius-lg);
      background: var(--refit-subtle);
    }
    .setup ol {
      margin: 4px 0 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .empty {
      padding: 16px 20px;
    }
    .test {
      margin-left: 28px;
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .result {
      flex-basis: 100%;
      display: flex;
      gap: 8px;
      align-items: baseline;
      margin: 0;
      padding: 8px 12px;
      border-radius: var(--refit-radius);
      background: var(--refit-success-soft);
    }
    .result.failed {
      background: var(--refit-danger-soft);
    }
  `,
})
export class ProvidersPanel {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  protected readonly providers = signal<ProviderStatus[]>([]);
  protected readonly loading = signal(false);
  protected readonly testing = signal<ProviderId | null>(null);
  protected readonly results = signal<Partial<Record<ProviderId, ProviderTestResult>>>({});

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.providers.set(await this.api.providers());
    } catch (error) {
      this.notify.error(error, 'Could not check the providers');
    } finally {
      this.loading.set(false);
    }
  }

  protected async test(id: ProviderId): Promise<void> {
    this.testing.set(id);
    try {
      const result = await this.api.testProvider(id);
      this.results.update((all) => ({ ...all, [id]: result }));
    } catch (error) {
      this.notify.error(error, 'Could not test the connection');
    } finally {
      this.testing.set(null);
    }
  }

  protected resultMeta(result: ProviderTestResult): string {
    const parts = [result.model, `${(result.durationMs / 1000).toFixed(1)} s`];
    if (result.costUsd) parts.push(usd(result.costUsd));
    if (result.requests) parts.push(`${result.requests} request${result.requests === 1 ? '' : 's'}`);
    return parts.filter(Boolean).join(' · ');
  }

  protected unit(provider: ProviderStatus): string {
    return provider.id === 'dryrun' ? 'Free, changes nothing real' : UNIT_LABEL[provider.costUnit];
  }
}
