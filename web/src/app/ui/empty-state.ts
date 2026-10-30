import { Component, input } from '@angular/core';

/** A centered message for empty lists: what this area is for and what to do next. */
@Component({
  selector: 'app-empty-state',
  template: `
    <div class="empty" [class.compact]="compact()">
      <div class="icon" aria-hidden="true"><i class="pi" [class]="icon()"></i></div>
      <h2>{{ title() }}</h2>
      @if (text()) {
        <p class="soft">{{ text() }}</p>
      }
      <div class="actions"><ng-content /></div>
    </div>
  `,
  styles: `
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 10px;
      padding: 56px 24px;
      max-width: 520px;
      margin: 0 auto;
    }
    .empty.compact {
      padding: 32px 16px;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      border-radius: 14px;
      background: var(--refit-accent-soft);
      color: var(--refit-accent-text);
      margin-bottom: 6px;
    }
    .icon .pi {
      font-size: 1.35rem;
    }
    .actions:not(:empty) {
      margin-top: 10px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
    }
  `,
})
export class EmptyState {
  readonly icon = input('pi-inbox');
  readonly title = input.required<string>();
  readonly text = input('');
  readonly compact = input(false);
}
