import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { RunRecord } from '@refit/shared';
import { ConfirmationService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Api } from '../../core/api';
import { AppState } from '../../core/app-state';
import { duration, usd } from '../../core/format';
import { Notify } from '../../core/notify';
import { RunStream } from '../../core/run-stream';
import { CopyButton } from '../../ui/copy-button';

interface Tile {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
}

/** What a finished run produced, and what to do next. */
@Component({
  selector: 'app-run-outcome',
  imports: [Button, Dialog, CopyButton],
  template: `
    <section class="panel outcome" [class]="tone()" aria-labelledby="outcome-title">
      <div class="banner">
        <span class="icon" aria-hidden="true"><i class="pi" [class]="icon()"></i></span>
        <div class="stack" style="--stack-gap: 4px">
          <h2 id="outcome-title">{{ headline() }}</h2>
          @if (run().message && run().status !== 'done') {
            <p class="soft">{{ run().message }}</p>
          } @else {
            <p class="soft">{{ subline() }}</p>
          }
        </div>
      </div>

      @if (tiles().length > 0) {
        <dl class="tiles">
          @for (tile of tiles(); track tile.label) {
            <div class="tile" [class]="tile.tone">
              <dt class="muted tiny">{{ tile.label }}</dt>
              <dd>{{ tile.value }}</dd>
            </div>
          }
        </dl>
      }

      <div class="where">
        @if (run().branch) {
          <div class="where-row">
            <span class="muted small label">Branch</span>
            <code class="truncate">{{ run().branch }}</code>
            <app-copy-button [value]="run().branch!" label="Copy the branch name" />
          </div>
        }
        @if (run().workspace && !run().workspaceRemoved) {
          <div class="where-row">
            <span class="muted small label">Workspace</span>
            <code class="truncate">{{ run().workspace }}</code>
            <app-copy-button [value]="run().workspace!" label="Copy the workspace path" />
          </div>
        } @else if (run().workspaceRemoved) {
          <p class="muted small">The workspace was removed. The history and report are kept.</p>
        }
      </div>

      <div class="actions cluster">
        @if (run().result?.reportPath) {
          <p-button label="View report" icon="pi pi-file" severity="secondary" [outlined]="true" size="small" (onClick)="openReport()" />
        }
        @if (run().workspace && !run().workspaceRemoved) {
          <p-button label="Remove workspace" icon="pi pi-eraser" severity="secondary" [text]="true" size="small" (onClick)="removeWorkspace()" />
        }
        <p-button label="Delete run" icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="deleteRun()" />
      </div>
    </section>

    <p-dialog header="Run report" [(visible)]="reportOpen" [modal]="true" [draggable]="false" [dismissableMask]="true" [style]="{ width: '860px', maxWidth: 'calc(100vw - 32px)' }">
      <pre class="report">{{ report() }}</pre>
    </p-dialog>
  `,
  styles: `
    .outcome {
      margin-bottom: 24px;
      overflow: hidden;
    }
    .banner {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 20px 24px;
    }
    .icon {
      flex: 0 0 40px;
      height: 40px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      font-size: 1.1rem;
    }
    .good .icon {
      background: var(--refit-success-soft);
      color: var(--refit-success);
    }
    .bad .icon {
      background: var(--refit-danger-soft);
      color: var(--refit-danger);
    }
    .warn .icon {
      background: var(--refit-warn-soft);
      color: var(--refit-warn);
    }
    .neutral .icon {
      background: var(--refit-subtle);
      color: var(--refit-text-soft);
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      border-top: 1px solid var(--refit-border);
    }
    .tile {
      padding: 14px 24px;
      border-right: 1px solid var(--refit-border);
    }
    .tile dd {
      font-size: 1.1rem;
      font-weight: 600;
      margin-top: 2px;
    }
    .tile.good dd {
      color: var(--refit-success);
    }
    .tile.warn dd {
      color: var(--refit-warn);
    }
    .tile.bad dd {
      color: var(--refit-danger);
    }
    .where {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 14px 24px;
      border-top: 1px solid var(--refit-border);
    }
    .where-row {
      display: grid;
      grid-template-columns: 90px minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
    }
    .actions {
      padding: 12px 20px;
      border-top: 1px solid var(--refit-border);
    }
    .report {
      white-space: pre-wrap;
      font-family: var(--refit-mono);
      font-size: 0.82rem;
      margin: 0;
    }
  `,
})
export class RunOutcome {
  readonly run = input.required<RunRecord>();
  private readonly api = inject(Api);
  private readonly appState = inject(AppState);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(ConfirmationService);
  private readonly router = inject(Router);
  private readonly stream = inject(RunStream);

  protected reportOpen = false;
  protected readonly report = signal('');

  protected readonly tone = computed(() => {
    switch (this.run().status) {
      case 'done':
        return (this.run().result?.pagesFlagged ?? 0) > 0 || this.run().result?.build === 'failed' ? 'warn' : 'good';
      case 'failed':
        return 'bad';
      case 'interrupted':
        return 'warn';
      default:
        return 'neutral';
    }
  });

  protected readonly icon = computed(() => {
    switch (this.run().status) {
      case 'done':
        return this.tone() === 'good' ? 'pi-check' : 'pi-flag';
      case 'failed':
        return 'pi-times';
      case 'interrupted':
        return 'pi-exclamation-triangle';
      default:
        return 'pi-ban';
    }
  });

  protected readonly headline = computed(() => {
    const result = this.run().result;
    switch (this.run().status) {
      case 'done':
        return result && result.pagesFlagged > 0 ? `Ready for review, with ${result.pagesFlagged} flagged ${result.pagesFlagged === 1 ? 'page' : 'pages'}` : 'Ready for review';
      case 'failed':
        return 'The run stopped';
      case 'interrupted':
        return 'The run was interrupted';
      case 'cancelled':
        return 'The run was cancelled';
      default:
        return '';
    }
  });

  protected readonly subline = computed(() =>
    this.run().status === 'done' ? 'Everything is committed on the branch below. Nothing was pushed; review the changes before creating a pull request.' : '',
  );

  protected readonly tiles = computed<Tile[]>(() => {
    const result = this.run().result;
    if (!result) return [];
    const total = this.run().pages.length;
    const tiles: Tile[] = [
      { label: 'Pages done', value: `${result.pagesDone} of ${total}`, tone: result.pagesDone === total ? 'good' : 'neutral' },
      { label: 'Flagged', value: String(result.pagesFlagged), tone: result.pagesFlagged > 0 ? 'warn' : 'neutral' },
      { label: 'Build', value: result.build === 'passed' ? 'Passed' : result.build === 'failed' ? 'Failed' : 'Not run', tone: result.build === 'passed' ? 'good' : result.build === 'failed' ? 'bad' : 'neutral' },
      {
        label: 'API calls',
        value: result.apiUnchanged === null ? 'Not checked' : result.apiUnchanged ? 'Unchanged' : 'Changed',
        tone: result.apiUnchanged === null ? 'neutral' : result.apiUnchanged ? 'good' : 'bad',
      },
      { label: 'Cost', value: result.requests > 0 ? `${result.requests} requests` : usd(result.costUsd), tone: 'neutral' },
      { label: 'Duration', value: duration(result.durationMs), tone: 'neutral' },
    ];
    if (result.tests !== 'not-run') {
      tiles.splice(3, 0, { label: 'Tests', value: result.tests === 'regressions' ? 'New failures' : result.tests === 'failed' ? 'Failed' : 'No regressions', tone: result.tests === 'regressions' || result.tests === 'failed' ? 'bad' : 'good' });
    }
    if (result.protectedReverts > 0) tiles.push({ label: 'Protected reverts', value: String(result.protectedReverts), tone: 'warn' });
    return tiles;
  });

  protected async openReport(): Promise<void> {
    try {
      this.report.set(await this.api.runReport(this.run().id));
      this.reportOpen = true;
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected removeWorkspace(): void {
    this.confirm.confirm({
      header: 'Remove the workspace?',
      message: `This deletes ${this.run().workspace} and with it the local branch ${this.run().branch ?? ''}. The run history and report stay. Do this only after the branch is pushed or no longer needed.`,
      icon: 'pi pi-eraser',
      acceptLabel: 'Remove workspace',
      rejectLabel: 'Keep it',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: async () => {
        try {
          await this.api.removeRunWorkspace(this.run().id);
          this.notify.success('Workspace removed');
          this.appState.refresh();
          await this.stream.reload();
        } catch (error) {
          this.notify.error(error);
        }
      },
    });
  }

  protected deleteRun(): void {
    this.confirm.confirm({
      header: 'Delete this run?',
      message: 'This deletes the workspace (and its local branch), the screenshots, the log and the report. It cannot be undone.',
      icon: 'pi pi-trash',
      acceptLabel: 'Delete run',
      rejectLabel: 'Cancel',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: async () => {
        try {
          await this.api.removeRun(this.run().id);
          this.notify.success('Run deleted');
          this.appState.refresh();
          void this.router.navigate(['/apps', this.run().appId, 'history']);
        } catch (error) {
          this.notify.error(error);
        }
      },
    });
  }
}
