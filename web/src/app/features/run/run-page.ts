import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RunView } from './run-view';

/** A run opened from History: the live view plus a way back. */
@Component({
  selector: 'app-run-page',
  imports: [RouterLink, RunView],
  template: `
    <a class="back small" routerLink="../../history"><i class="pi pi-arrow-left" aria-hidden="true"></i> All runs</a>
    <app-run-view [runId]="runId()" />
  `,
  styles: `
    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 16px;
      text-decoration: none;
      color: var(--refit-text-soft);
    }
    .back:hover {
      color: var(--refit-text);
    }
  `,
})
export class RunPage {
  readonly runId = input.required<string>();
}
