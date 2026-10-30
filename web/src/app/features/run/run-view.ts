import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { SelectButton } from 'primeng/selectbutton';
import { Skeleton } from 'primeng/skeleton';
import { Api } from '../../core/api';
import { AppState } from '../../core/app-state';
import { duration, usd } from '../../core/format';
import { Notify } from '../../core/notify';
import { RunStream } from '../../core/run-stream';
import { StatusChip } from '../../ui/status-chip';
import { DeveloperView } from './developer-view';
import { RunOutcome } from './run-outcome';
import { SimpleView } from './simple-view';

type Mode = 'simple' | 'developer';
const MODE_KEY = 'refit.runMode';

@Component({
  selector: 'app-run-view',
  imports: [FormsModule, Button, SelectButton, Skeleton, StatusChip, DeveloperView, RunOutcome, SimpleView],
  providers: [RunStream],
  template: `
    @if (stream.error(); as message) {
      <div class="panel error" role="alert">
        <strong>Could not open this run</strong>
        <span class="soft">{{ message }}</span>
      </div>
    } @else if (stream.run(); as run) {
      <header class="head">
        <div class="cluster title">
          <app-status-chip [run]="run.status" />
          <span class="soft small">{{ run.status === 'running' ? 'Running for' : 'Took' }} {{ elapsed() }}</span>
          <span class="sep" aria-hidden="true">·</span>
          <span class="soft small" [attr.aria-label]="'AI cost ' + costLabel()"><i class="pi pi-wallet" aria-hidden="true"></i> {{ costLabel() }}</span>
          <span class="sep" aria-hidden="true">·</span>
          <span class="soft small">{{ run.settings?.provider === 'dryrun' ? 'Dry run' : providerLabel() }}</span>
        </div>
        <div class="cluster">
          <p-selectbutton [options]="modes" optionLabel="label" optionValue="value" [ngModel]="mode()" (ngModelChange)="setMode($event)" [allowEmpty]="false" aria-label="View" />
          @if (run.status === 'running') {
            <p-button label="Cancel run" icon="pi pi-stop-circle" severity="danger" [outlined]="true" size="small" [loading]="cancelling()" (onClick)="cancel()" />
          } @else if (canStartNew()) {
            <p-button label="Start a new run" icon="pi pi-plus" severity="secondary" [outlined]="true" size="small" (onClick)="newRun.emit()" />
          }
        </div>
      </header>

      @if (run.status !== 'running') {
        <app-run-outcome [run]="run" />
      }

      @if (mode() === 'simple') {
        <app-simple-view [run]="run" [now]="now()" />
      } @else {
        <app-developer-view [run]="run" />
      }
    } @else {
      <div class="stack" aria-busy="true">
        <p-skeleton height="2.25rem" width="60%" />
        <p-skeleton height="9rem" />
        <p-skeleton height="14rem" />
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .title {
      --cluster-gap: 10px;
    }
    .sep {
      color: var(--refit-border-strong);
    }
    .error {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
  `,
})
export class RunView {
  readonly runId = input.required<string>();
  /** Shows "Start a new run" once the run is over (where a new run can be started). */
  readonly canStartNew = input(false);
  readonly newRun = output<void>();

  protected readonly stream = inject(RunStream);
  private readonly api = inject(Api);
  private readonly appState = inject(AppState);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(ConfirmationService);

  protected readonly modes = [
    { label: 'Simple', value: 'simple' as Mode },
    { label: 'Developer', value: 'developer' as Mode },
  ];
  protected readonly mode = signal<Mode>(readMode());
  protected readonly cancelling = signal(false);
  protected readonly now = signal(Date.now());

  protected readonly elapsed = computed(() => {
    const run = this.stream.run();
    if (!run) return '';
    const end = run.finishedAt ? new Date(run.finishedAt).getTime() : this.now();
    return duration(end - new Date(run.startedAt).getTime());
  });

  protected readonly costLabel = computed(() => {
    const cost = this.stream.run()?.cost;
    if (!cost) return '';
    return cost.unit === 'usd' ? usd(cost.usd) : `${cost.requests} requests`;
  });

  constructor() {
    effect(() => void this.stream.open(this.runId()));
    const ticker = setInterval(() => {
      if (this.stream.run()?.status === 'running') this.now.set(Date.now());
    }, 1000);
    const stopListening = this.stream.onEvent((event) => {
      if (event.type === 'result') this.appState.refresh();
    });
    inject(DestroyRef).onDestroy(() => {
      clearInterval(ticker);
      stopListening();
      this.stream.close();
    });
  }

  protected providerLabel(): string {
    const id = this.stream.run()?.settings?.provider;
    return id === 'claude' ? 'Claude Agent' : id === 'copilot' ? 'GitHub Copilot' : 'Dry run';
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // storage blocked: the choice still applies now
    }
  }

  protected cancel(): void {
    this.confirm.confirm({
      header: 'Cancel this run?',
      message: 'Refit stops the agent and every command. Pages that are already committed stay on the branch, and the workspace is kept so you can look at it.',
      icon: 'pi pi-stop-circle',
      acceptLabel: 'Cancel run',
      rejectLabel: 'Keep running',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: async () => {
        this.cancelling.set(true);
        try {
          await this.api.cancelRun(this.runId());
          this.notify.info('Cancelling the run', 'Stopping the agent and all commands.');
        } catch (error) {
          this.notify.error(error);
        } finally {
          this.cancelling.set(false);
        }
      },
    });
  }
}

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'developer' ? 'developer' : 'simple';
  } catch {
    return 'simple';
  }
}
