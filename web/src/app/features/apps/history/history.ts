import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { RunRecord } from '@refit/shared';
import { Button } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { AppState } from '../../../core/app-state';
import { duration, relativeTime, usd } from '../../../core/format';
import { EmptyState } from '../../../ui/empty-state';
import { StatusChip } from '../../../ui/status-chip';

@Component({
  selector: 'app-history',
  imports: [RouterLink, Button, TableModule, EmptyState, StatusChip],
  template: `
    @if (runs().length === 0) {
      <div class="panel">
        <app-empty-state icon="pi-history" title="No runs yet" text="Start one from the Modernize tab. Every run stays here with its report, screenshots and log.">
          <p-button label="Go to Modernize" icon="pi pi-arrow-right" iconPos="right" severity="secondary" [outlined]="true" (onClick)="router.navigate(['/apps', appId(), 'modernize'])" />
        </app-empty-state>
      </div>
    } @else {
      <section class="panel" aria-labelledby="history-title">
        <div class="panel-header">
          <h2 id="history-title">Runs</h2>
          <span class="muted small">{{ runs().length }}</span>
        </div>
        <p-table [value]="runs()" dataKey="id" [scrollable]="true" [tableStyle]="{ 'min-width': '48rem' }" styleClass="refit-table">
          <ng-template #header>
            <tr>
              <th>Started</th>
              <th>Status</th>
              <th>Provider</th>
              <th>Pages</th>
              <th>Cost</th>
              <th>Duration</th>
              <th>Branch</th>
            </tr>
          </ng-template>
          <ng-template #body let-run>
            <tr class="row" (click)="open(run)" (keydown.enter)="open(run)" tabindex="0" [attr.aria-label]="'Open the run from ' + ago(run.startedAt)">
              <td class="nowrap"><a [routerLink]="['../runs', run.id]" (click)="$event.stopPropagation()">{{ ago(run.startedAt) }}</a></td>
              <td><app-status-chip [run]="run.status" /></td>
              <td class="soft">{{ provider(run) }}</td>
              <td class="soft nowrap">{{ pages(run) }}</td>
              <td class="soft nowrap">{{ cost(run) }}</td>
              <td class="soft nowrap">{{ took(run) }}</td>
              <td><code class="small">{{ run.branch ?? '–' }}</code>@if (run.workspaceRemoved) { <span class="muted tiny"> (removed)</span>}</td>
            </tr>
          </ng-template>
        </p-table>
      </section>
    }
  `,
  styles: `
    .row {
      cursor: pointer;
    }
    .row:focus-visible {
      outline: 2px solid var(--refit-accent);
      outline-offset: -2px;
    }
  `,
})
export class History {
  readonly appId = input.required<string>();
  private readonly state = inject(AppState);
  protected readonly router = inject(Router);

  protected readonly runs = computed(() => (this.state.state()?.runs ?? []).filter((run) => run.appId === this.appId() && run.kind === 'modernize'));

  protected open(run: RunRecord): void {
    void this.router.navigate(['/apps', this.appId(), 'runs', run.id]);
  }

  protected ago(iso: string): string {
    return relativeTime(iso);
  }

  protected provider(run: RunRecord): string {
    return run.settings?.provider === 'claude' ? 'Claude Agent' : run.settings?.provider === 'copilot' ? 'GitHub Copilot' : 'Dry run';
  }

  protected pages(run: RunRecord): string {
    const result = run.result;
    if (!result) return `${run.pages.length} planned`;
    return `${result.pagesDone} done${result.pagesFlagged ? ` · ${result.pagesFlagged} flagged` : ''}${result.pagesSkipped ? ` · ${result.pagesSkipped} skipped` : ''}`;
  }

  protected cost(run: RunRecord): string {
    return run.cost.unit === 'usd' ? usd(run.cost.usd) : `${run.cost.requests} requests`;
  }

  protected took(run: RunRecord): string {
    if (!run.finishedAt) return run.status === 'running' ? 'Running' : '–';
    return duration(new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime());
  }
}
