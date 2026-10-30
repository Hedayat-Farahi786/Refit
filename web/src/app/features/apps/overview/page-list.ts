import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AppRecord, PageConfig } from '@refit/shared';
import { slugify } from '@refit/shared';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Dialog } from 'primeng/dialog';
import { InputText } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';
import { Tooltip } from 'primeng/tooltip';
import { Api } from '../../../core/api';
import { AppState } from '../../../core/app-state';
import { Notify } from '../../../core/notify';

function routeParams(route: string): string[] {
  return route
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1).replace(/\?$/, ''));
}

@Component({
  selector: 'app-page-list',
  imports: [FormsModule, Button, Checkbox, Dialog, InputText, TableModule, Tag, Textarea, Tooltip],
  template: `
    <section class="panel" aria-labelledby="pages-title">
      <div class="panel-header">
        <div class="stack" style="--stack-gap: 2px">
          <h2 id="pages-title">Pages</h2>
          <p class="muted small">{{ includedLabel() }} Refit modernizes included pages one at a time and takes screenshots of each.</p>
        </div>
        <p-button label="Add page" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" class="add-page" (onClick)="openAdd()" />
      </div>

      @if (draft().length === 0) {
        <p class="empty muted">No pages yet. Add the app's pages by hand with "Add page".</p>
      } @else {
        <p-table [value]="draft()" dataKey="id" [scrollable]="true" [tableStyle]="{ 'min-width': '52rem' }" styleClass="refit-table">
          <ng-template #header>
            <tr>
              <th class="col-include">
                <p-checkbox [binary]="true" [ngModel]="allIncluded()" (ngModelChange)="setAll($event)" ariaLabel="Include all pages" />
              </th>
              <th>Page</th>
              <th>Route</th>
              <th>Sample values</th>
              <th class="col-files">Files</th>
              <th class="col-actions"><span class="sr-only">Actions</span></th>
            </tr>
          </ng-template>
          <ng-template #body let-page>
            <tr [class.excluded]="!page.include">
              <td class="col-include">
                <p-checkbox [binary]="true" [ngModel]="page.include" (ngModelChange)="change(page.id, { include: $event })" [ariaLabel]="'Include ' + page.name" />
              </td>
              <td>
                <input
                  pInputText
                  class="ghost"
                  [ngModel]="page.name"
                  (ngModelChange)="change(page.id, { name: $event })"
                  [attr.aria-label]="'Name of the page at ' + page.route"
                  maxlength="120"
                />
              </td>
              <td>
                <span class="route mono">{{ page.route }}</span>
                @if (page.manual) {
                  <p-tag value="Added by hand" severity="secondary" class="manual-tag" />
                }
              </td>
              <td>
                @if (paramsOf(page).length === 0) {
                  <span class="muted small">None needed</span>
                } @else {
                  <div class="params">
                    @for (param of paramsOf(page); track param) {
                      <label class="param" [class.missing]="page.include && !page.params[param]">
                        <span class="mono small">:{{ param }}</span>
                        <input
                          pInputText
                          pSize="small"
                          [ngModel]="page.params[param] ?? ''"
                          (ngModelChange)="setParam(page.id, param, $event)"
                          placeholder="e.g. 42"
                          [attr.aria-label]="'Sample value for ' + param + ' on ' + page.name"
                        />
                      </label>
                    }
                  </div>
                }
              </td>
              <td class="col-files">
                <span class="files" [pTooltip]="page.files.join('\\n') || 'No files'" tooltipPosition="left" tabindex="0">
                  {{ page.files.length }} {{ page.files.length === 1 ? 'file' : 'files' }}
                </span>
              </td>
              <td class="col-actions">
                @if (page.manual) {
                  <p-button
                    icon="pi pi-trash"
                    severity="secondary"
                    [text]="true"
                    [rounded]="true"
                    size="small"
                    [pTooltip]="'Remove ' + page.name"
                    [ariaLabel]="'Remove ' + page.name"
                    (onClick)="removeManual(page.id)"
                  />
                }
              </td>
            </tr>
          </ng-template>
        </p-table>
      }

      @if (dirty()) {
        <div class="save-bar" role="region" aria-label="Unsaved page changes">
          <span class="soft small"><i class="pi pi-pencil" aria-hidden="true"></i> You have unsaved changes to the page list.</span>
          <span class="spacer"></span>
          <p-button label="Discard" severity="secondary" [text]="true" size="small" (onClick)="discard()" />
          <p-button label="Save pages" icon="pi pi-check" size="small" [loading]="saving()" (onClick)="save()" />
        </div>
      }
    </section>

    <p-dialog header="Add a page" [(visible)]="addOpen" [modal]="true" [draggable]="false" [style]="{ width: '520px', maxWidth: 'calc(100vw - 32px)' }">
      <form class="stack" (ngSubmit)="addPage()">
        <p class="soft small">For pages the scan could not find, for example routes built in code.</p>
        <div class="field">
          <label for="page-name">Name</label>
          <input pInputText id="page-name" name="name" [(ngModel)]="newName" placeholder="For example Reports" required />
        </div>
        <div class="field">
          <label for="page-route">Route</label>
          <input pInputText id="page-route" name="route" class="mono" [(ngModel)]="newRoute" placeholder="/reports/:reportId" required />
          <span class="field-hint">Starts with /. Use :name for parts that change, like an ID.</span>
        </div>
        <div class="field">
          <label for="page-files">Files the agent may change</label>
          <textarea pTextarea id="page-files" name="files" rows="3" class="mono" [(ngModel)]="newFiles" placeholder="src/app/reports/reports.component.ts&#10;src/app/reports/reports.component.html"></textarea>
          <span class="field-hint">One path per line, relative to the app folder.</span>
        </div>
        @if (addError()) {
          <p class="field-error" role="alert">{{ addError() }}</p>
        }
        <button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
      </form>
      <ng-template #footer>
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="addOpen = false" />
        <p-button label="Add page" icon="pi pi-plus" (onClick)="addPage()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .empty {
      padding: 20px 24px;
    }
    .add-page {
      flex-shrink: 0;
      white-space: nowrap;
    }
    .col-include {
      width: 3rem;
    }
    .col-files {
      width: 6rem;
      white-space: nowrap;
    }
    .col-actions {
      width: 3.5rem;
      text-align: right;
    }
    tr.excluded td:not(.col-include) {
      opacity: 0.55;
    }
    input.ghost {
      width: 100%;
      min-width: 10rem;
      border-color: transparent;
      background: transparent;
      box-shadow: none;
      font-weight: 600;
    }
    input.ghost:hover {
      border-color: var(--refit-border);
    }
    input.ghost:focus {
      border-color: var(--p-primary-color);
      background: var(--refit-panel);
    }
    .route {
      font-size: 0.85rem;
      color: var(--refit-text-soft);
    }
    .manual-tag {
      margin-left: 8px;
    }
    .params {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .param {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .param input {
      width: 7rem;
    }
    .param.missing input {
      border-color: var(--refit-warn);
    }
    .files {
      color: var(--refit-text-soft);
      font-size: 0.875rem;
      border-bottom: 1px dotted var(--refit-border-strong);
      cursor: help;
    }
    .save-bar {
      position: sticky;
      bottom: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px 12px 24px;
      border-top: 1px solid var(--refit-border);
      background: var(--refit-panel-raised);
      border-radius: 0 0 var(--refit-radius-xl) var(--refit-radius-xl);
      box-shadow: 0 -8px 24px -16px rgb(15 23 42 / 0.3);
    }
    textarea {
      width: 100%;
    }
    input[pInputText]:not(.ghost):not([psize]) {
      width: 100%;
    }
  `,
})
export class PageList {
  readonly app = input.required<AppRecord>();
  private readonly api = inject(Api);
  private readonly appState = inject(AppState);
  private readonly notify = inject(Notify);

  protected readonly draft = signal<PageConfig[]>([]);
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected addOpen = false;
  protected newName = '';
  protected newRoute = '';
  protected newFiles = '';
  protected readonly addError = signal('');

  protected readonly allIncluded = computed(() => this.draft().length > 0 && this.draft().every((page) => page.include));
  protected readonly includedLabel = computed(() => {
    const total = this.draft().length;
    const included = this.draft().filter((page) => page.include).length;
    return total === 0 ? '' : `${included} of ${total} included.`;
  });

  constructor() {
    // Follow the server's page list unless the user is in the middle of editing it.
    effect(() => {
      const pages = this.app().pages;
      if (!untracked(this.dirty)) this.draft.set(structuredClone(pages));
    });
  }

  protected paramsOf(page: PageConfig): string[] {
    return routeParams(page.route);
  }

  protected change(id: string, patch: Partial<PageConfig>): void {
    this.draft.update((pages) => pages.map((page) => (page.id === id ? { ...page, ...patch } : page)));
    this.dirty.set(true);
  }

  protected setParam(id: string, param: string, value: string): void {
    this.draft.update((pages) => pages.map((page) => (page.id === id ? { ...page, params: { ...page.params, [param]: value } } : page)));
    this.dirty.set(true);
  }

  protected setAll(include: boolean): void {
    this.draft.update((pages) => pages.map((page) => ({ ...page, include })));
    this.dirty.set(true);
  }

  protected removeManual(id: string): void {
    this.draft.update((pages) => pages.filter((page) => page.id !== id));
    this.dirty.set(true);
  }

  protected discard(): void {
    this.draft.set(structuredClone(this.app().pages));
    this.dirty.set(false);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const updated = await this.api.updateApp(this.app().id, { pages: this.draft() });
      this.dirty.set(false);
      this.appState.patchApp(updated);
      this.notify.success('Pages saved');
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  protected openAdd(): void {
    this.newName = '';
    this.newRoute = '';
    this.newFiles = '';
    this.addError.set('');
    this.addOpen = true;
  }

  protected addPage(): void {
    const route = `/${this.newRoute.trim().replace(/^\/+/, '')}`.replace(/\/+$/, '') || '/';
    const files = this.newFiles
      .split(/\r?\n/)
      .map((file) => file.trim().replace(/\\/g, '/'))
      .filter(Boolean);
    if (!this.newName.trim()) return this.addError.set('Give the page a name.');
    if (this.draft().some((page) => page.route === route)) return this.addError.set(`There is already a page for ${route}.`);
    if (files.length === 0) return this.addError.set('Add at least one file, usually the component file.');
    const params: Record<string, string> = {};
    for (const param of routeParams(route)) params[param] = '';
    let id = route === '/' ? 'home' : slugify(route.replace(/:/g, ''), 'page');
    while (this.draft().some((page) => page.id === id)) id = `${id}-x`;
    this.draft.update((pages) => [...pages, { id, name: this.newName.trim(), route, include: true, params, files, componentFile: files[0], manual: true }]);
    this.dirty.set(true);
    this.addOpen = false;
  }
}
