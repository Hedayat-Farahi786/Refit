import { Component, computed, inject, signal } from '@angular/core';
import { Button } from 'primeng/button';
import { AppState } from '../../core/app-state';
import { EmptyState } from '../../ui/empty-state';
import { AddAppDialog } from './add-app-dialog';

@Component({
  selector: 'app-apps-home',
  imports: [Button, EmptyState, AddAppDialog],
  template: `
    <div class="wrap">
      @if (state.apps().length === 0) {
        <app-empty-state
          icon="pi-sparkles"
          title="Add your first app to get started"
          text="Point Refit at an Angular app on your computer or at its git URL. Refit scans it first, for free and without changing anything."
        >
          <p-button label="Add app" icon="pi pi-plus" (onClick)="addOpen.set(true)" />
        </app-empty-state>
        <ol class="steps" role="list">
          <li><span class="num">1</span><div><strong>Scan</strong><p class="muted small">Free and instant. Finds pages and anything to fix first.</p></div></li>
          <li><span class="num">2</span><div><strong>Modernize</strong><p class="muted small">An AI agent restyles one page at a time with your brand.</p></div></li>
          <li><span class="num">3</span><div><strong>Review</strong><p class="muted small">Compare before and after, then open a pull request.</p></div></li>
        </ol>
      } @else {
        <app-empty-state icon="pi-arrow-left" title="Choose an app" [text]="hint()">
          <p-button label="Add app" icon="pi pi-plus" severity="secondary" [outlined]="true" (onClick)="addOpen.set(true)" />
        </app-empty-state>
      }
    </div>
    <app-add-app-dialog [(visible)]="addOpen" />
  `,
  styles: `
    .wrap {
      padding: 48px 24px;
    }
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      max-width: 720px;
      margin: 8px auto 0;
    }
    .steps li {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 16px;
      border: 1px solid var(--refit-border);
      border-radius: var(--refit-radius-xl);
      background: var(--refit-panel);
    }
    .num {
      flex: 0 0 26px;
      height: 26px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--refit-accent-soft);
      color: var(--refit-accent-text);
      font-weight: 700;
      font-size: 0.85rem;
    }
  `,
})
export class AppsHome {
  protected readonly state = inject(AppState);
  protected readonly addOpen = signal(false);
  protected readonly hint = computed(() => `Pick one of your ${this.state.apps().length} apps on the left to see its scan and start modernizing.`);
}
