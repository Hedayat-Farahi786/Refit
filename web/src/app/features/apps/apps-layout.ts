import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Button } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Tooltip } from 'primeng/tooltip';
import type { AppRecord } from '@refit/shared';
import { AppState } from '../../core/app-state';
import { ReadinessChip } from '../../ui/readiness-chip';
import { AddAppDialog } from './add-app-dialog';

@Component({
  selector: 'app-apps-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, Button, IconField, InputIcon, InputText, Tooltip, ReadinessChip, AddAppDialog],
  template: `
    <aside class="sidebar" aria-label="Apps">
      <div class="sidebar-head">
        <h2 class="title">Apps <span class="count muted">{{ state.apps().length }}</span></h2>
        <p-button icon="pi pi-plus" size="small" label="Add app" (onClick)="addOpen.set(true)" />
      </div>
      @if (state.apps().length > 4) {
        <p-iconfield class="search">
          <p-inputicon class="pi pi-search" />
          <input pInputText type="search" placeholder="Find an app" aria-label="Find an app" [(ngModel)]="query" (ngModelChange)="querySignal.set($event)" />
        </p-iconfield>
      }
      <ul class="list" role="list">
        @for (app of filtered(); track app.id) {
          <li>
            <a class="item" [routerLink]="['/apps', app.id]" routerLinkActive="selected" ariaCurrentWhenActive="page">
              <span class="item-main">
                <span class="item-name truncate">{{ app.name }}</span>
                <span class="item-source truncate muted">{{ sourceLabel(app) }}</span>
              </span>
              @if (app.scanState.status === 'scanning') {
                <span class="scanning muted tiny"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Scanning</span>
              } @else if (app.scanState.status === 'failed') {
                <span class="failed tiny" pTooltip="The last scan failed" tooltipPosition="right"><i class="pi pi-times-circle" aria-hidden="true"></i> Scan failed</span>
              } @else {
                <app-readiness-chip [readiness]="app.readiness" />
              }
            </a>
          </li>
        } @empty {
          @if (state.apps().length > 0) {
            <li class="none muted small">No app matches "{{ query }}".</li>
          } @else {
            <li class="none muted small">No apps yet.</li>
          }
        }
      </ul>
    </aside>
    <section class="content">
      <router-outlet />
    </section>
    <app-add-app-dialog [(visible)]="addOpen" />
  `,
  styles: `
    :host {
      flex: 1;
      display: flex;
      min-width: 0;
    }
    .sidebar {
      width: var(--refit-sidebar-width);
      flex: 0 0 var(--refit-sidebar-width);
      border-right: 1px solid var(--refit-border);
      background: var(--refit-panel);
      display: flex;
      flex-direction: column;
      position: sticky;
      top: var(--refit-topbar-height);
      height: calc(100vh - var(--refit-topbar-height));
      overflow: auto;
    }
    .sidebar-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 16px 12px 20px;
    }
    .title {
      font-size: 0.95rem;
    }
    .count {
      font-weight: 500;
      margin-left: 4px;
    }
    .search {
      margin: 0 16px 8px;
    }
    .search input {
      width: 100%;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 4px 8px 16px;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: var(--refit-radius-lg);
      color: inherit;
      text-decoration: none;
      transition: background-color 120ms ease;
      position: relative;
    }
    .item:hover {
      background: var(--refit-hover);
    }
    .item.selected {
      background: var(--refit-accent-soft);
    }
    .item.selected::before {
      content: '';
      position: absolute;
      left: 0;
      top: 10px;
      bottom: 10px;
      width: 3px;
      border-radius: 3px;
      background: var(--p-primary-color);
    }
    .item-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .item-name {
      font-weight: 600;
    }
    .item-source {
      font-size: 0.78rem;
      direction: rtl;
      text-align: left;
    }
    .scanning,
    .failed {
      white-space: nowrap;
      display: inline-flex;
      gap: 4px;
      align-items: center;
    }
    .failed {
      color: var(--refit-danger);
    }
    .none {
      padding: 12px;
    }
    .content {
      flex: 1;
      min-width: 0;
    }
    @media (max-width: 900px) {
      :host {
        flex-direction: column;
      }
      .sidebar {
        position: static;
        width: auto;
        flex: none;
        height: auto;
        max-height: 40vh;
        border-right: none;
        border-bottom: 1px solid var(--refit-border);
      }
    }
  `,
})
export class AppsLayout {
  protected readonly state = inject(AppState);
  protected readonly addOpen = signal(false);
  protected query = '';
  protected readonly querySignal = signal('');

  protected readonly filtered = computed(() => {
    const query = this.querySignal().trim().toLowerCase();
    const apps = [...this.state.apps()].sort((a, b) => a.name.localeCompare(b.name));
    return query ? apps.filter((app) => app.name.toLowerCase().includes(query) || this.sourceLabel(app).toLowerCase().includes(query)) : apps;
  });

  protected sourceLabel(app: AppRecord): string {
    return app.source.kind === 'local' ? app.source.path : app.source.url;
  }
}
