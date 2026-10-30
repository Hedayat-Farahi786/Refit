import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { definePreset, usePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import type { Brand } from '@refit/shared';
import { brandCss, brandPresetTokens, normalizeBrand } from '@refit/shared';
import { MessageService } from 'primeng/api';
import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { DatePicker } from 'primeng/datepicker';
import { Dialog } from 'primeng/dialog';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { RadioButton } from 'primeng/radiobutton';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { Skeleton } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { Textarea } from 'primeng/textarea';
import { Toast } from 'primeng/toast';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Tooltip } from 'primeng/tooltip';

/** Messages between the Brand studio and this page, which runs in an iframe on the same origin. */
export const PREVIEW_READY = 'refit-brand-preview-ready';
export const PREVIEW_BRAND = 'refit-brand-preview';

type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';

interface Row {
  id: string;
  title: string;
  requester: string;
  status: string;
  statusSeverity: Severity;
  priority: string;
  prioritySeverity: Severity;
  updated: string;
}

const ROWS: Row[] = [
  { id: 'REQ-1042', title: 'Coating thickness report for batch 77', requester: 'A. Keller', status: 'Open', statusSeverity: 'info', priority: 'High', prioritySeverity: 'danger', updated: 'Today, 09:12' },
  { id: 'REQ-1041', title: 'New access for the Pfäffikon team', requester: 'M. Rossi', status: 'In progress', statusSeverity: 'warn', priority: 'Medium', prioritySeverity: 'warn', updated: 'Today, 08:40' },
  { id: 'REQ-1039', title: 'Spare parts order for line 3', requester: 'S. Brunner', status: 'Resolved', statusSeverity: 'success', priority: 'Low', prioritySeverity: 'secondary', updated: 'Yesterday' },
  { id: 'REQ-1038', title: 'Calibration certificate renewal', requester: 'L. Meier', status: 'Open', statusSeverity: 'info', priority: 'Medium', prioritySeverity: 'warn', updated: 'Yesterday' },
  { id: 'REQ-1036', title: 'Update supplier contact details', requester: 'J. Huber', status: 'Rejected', statusSeverity: 'danger', priority: 'Low', prioritySeverity: 'secondary', updated: 'Mon' },
  { id: 'REQ-1033', title: 'Quarterly maintenance window', requester: 'R. Weber', status: 'Resolved', statusSeverity: 'success', priority: 'High', prioritySeverity: 'danger', updated: 'Mon' },
  { id: 'REQ-1031', title: 'Safety training sign-up', requester: 'K. Schmid', status: 'In progress', statusSeverity: 'warn', priority: 'Low', prioritySeverity: 'secondary', updated: 'Fri' },
];

/**
 * A sample page built only from PrimeNG components and the brand's layout classes. The Brand studio
 * shows it in an iframe so the brand restyles this page without touching Refit's own look.
 */
@Component({
  selector: 'app-brand-preview',
  imports: [
    FormsModule,
    Button,
    Checkbox,
    DatePicker,
    Dialog,
    IconField,
    InputIcon,
    InputText,
    Message,
    RadioButton,
    Select,
    SelectButton,
    Skeleton,
    TableModule,
    Tag,
    Textarea,
    Toast,
    ToggleSwitch,
    Tooltip,
  ],
  providers: [MessageService],
  template: `
    @if (ready()) {
      <div class="brand-page">
        <header class="brand-page-header">
          <div>
            <h1 class="brand-page-title">Service requests</h1>
            <p class="brand-page-subtitle">Everything your teams asked for, newest first.</p>
          </div>
          <div class="brand-toolbar">
            <p-button label="Export" icon="pi pi-download" severity="secondary" [outlined]="true" />
            <p-button label="New request" icon="pi pi-plus" (onClick)="dialogOpen = true" />
          </div>
        </header>

        <section class="brand-stat-grid" aria-label="Key numbers">
          <div class="brand-stat"><div class="brand-stat-label">Open</div><div class="brand-stat-value">128</div></div>
          <div class="brand-stat"><div class="brand-stat-label">In progress</div><div class="brand-stat-value">42</div></div>
          <div class="brand-stat"><div class="brand-stat-label">Resolved this week</div><div class="brand-stat-value">87</div></div>
          <div class="brand-stat"><div class="brand-stat-label">Average response</div><div class="brand-stat-value">3.2 h</div></div>
        </section>

        <section class="brand-card">
          <div class="brand-toolbar toolbar">
            <p-selectbutton [options]="views" [(ngModel)]="view" [allowEmpty]="false" aria-label="Which requests" />
            <p-iconfield>
              <p-inputicon class="pi pi-search" />
              <input pInputText placeholder="Search requests" aria-label="Search requests" />
            </p-iconfield>
            <p-select [options]="statuses" [(ngModel)]="status" placeholder="All statuses" [showClear]="true" ariaLabel="Status" />
            <span class="brand-toolbar-spacer"></span>
            <p-button icon="pi pi-filter" [text]="true" severity="secondary" ariaLabel="More filters" pTooltip="More filters" tooltipPosition="top" />
          </div>
          <p-table [value]="rows" [paginator]="true" [rows]="5" [scrollable]="true" dataKey="id" [(selection)]="selected" selectionMode="single">
            <ng-template #header>
              <tr>
                <th pSortableColumn="id">ID <p-sortIcon field="id" /></th>
                <th pSortableColumn="title">Title <p-sortIcon field="title" /></th>
                <th>Requester</th>
                <th>Status</th>
                <th>Priority</th>
                <th pSortableColumn="updated">Updated <p-sortIcon field="updated" /></th>
              </tr>
            </ng-template>
            <ng-template #body let-row>
              <tr [pSelectableRow]="row">
                <td class="mono">{{ row.id }}</td>
                <td>{{ row.title }}</td>
                <td>{{ row.requester }}</td>
                <td><p-tag [value]="row.status" [severity]="row.statusSeverity" /></td>
                <td><p-tag [value]="row.priority" [severity]="row.prioritySeverity" /></td>
                <td class="brand-muted">{{ row.updated }}</td>
              </tr>
            </ng-template>
          </p-table>
        </section>

        <div class="two">
          <section class="brand-card">
            <div class="brand-card-header"><h2 class="brand-section-title">Request details</h2></div>
            <div class="brand-form-grid">
              <div class="brand-field">
                <label for="pv-title">Title</label>
                <input pInputText id="pv-title" [(ngModel)]="title" />
              </div>
              <div class="brand-field">
                <label for="pv-cost">Cost center</label>
                <input pInputText id="pv-cost" value="OE-12" [invalid]="true" aria-invalid="true" aria-describedby="pv-cost-error" />
                <span class="brand-field-error" id="pv-cost-error">Use the format OE-1234.</span>
              </div>
              <div class="brand-field">
                <label for="pv-category" id="pv-category-label">Category</label>
                <p-select inputId="pv-category" ariaLabelledBy="pv-category-label" [options]="categories" [(ngModel)]="category" [fluid]="true" />
              </div>
              <div class="brand-field">
                <label for="pv-due">Due date</label>
                <p-datepicker inputId="pv-due" [(ngModel)]="due" [showIcon]="true" [fluid]="true" />
              </div>
              <div class="brand-field span">
                <label for="pv-notes">Notes</label>
                <textarea pTextarea id="pv-notes" rows="3" [(ngModel)]="notes"></textarea>
                <span class="brand-field-hint">Visible to everyone on the request.</span>
              </div>
              <fieldset class="brand-field plain">
                <legend>Priority</legend>
                <div class="options">
                  @for (option of priorities; track option) {
                    <label class="option"><p-radiobutton name="pv-priority" [value]="option" [(ngModel)]="priority" />{{ option }}</label>
                  }
                </div>
              </fieldset>
              <div class="brand-field">
                <span class="label">Notifications</span>
                <label class="option"><p-toggleswitch [(ngModel)]="notify" ariaLabel="Email me about changes" />Email me about changes</label>
                <label class="option"><p-checkbox [(ngModel)]="urgent" [binary]="true" ariaLabel="Mark as urgent" />Mark as urgent</label>
              </div>
            </div>
            <div class="brand-form-actions">
              <p-button label="Cancel" severity="secondary" [text]="true" />
              <p-button label="Save request" (onClick)="saved()" />
            </div>
          </section>

          <div class="side">
            <section class="brand-card">
              <div class="brand-card-header"><h2 class="brand-section-title">Messages</h2></div>
              <div class="messages">
                <p-message severity="success" icon="pi pi-check-circle" text="Request saved and assigned to M. Rossi." />
                <p-message severity="info" icon="pi pi-info-circle" text="Approvals run every night at 22:00." />
                <p-message severity="warn" icon="pi pi-exclamation-triangle" text="The due date is in less than two days." />
                <p-message severity="error" icon="pi pi-times-circle" text="The cost center does not exist." />
              </div>
            </section>
            <section class="brand-card">
              <div class="brand-card-header"><h2 class="brand-section-title">Actions</h2></div>
              <div class="brand-toolbar wrap">
                <p-button label="Primary" />
                <p-button label="Secondary" severity="secondary" [outlined]="true" />
                <p-button label="Text" [text]="true" />
                <p-button label="Delete" icon="pi pi-trash" severity="danger" [outlined]="true" />
                <p-button label="Success" severity="success" />
                <p-button label="Info" severity="info" />
                <p-button label="Warning" severity="warn" />
                <p-button label="Saving" [loading]="true" />
                <p-button label="Disabled" [disabled]="true" />
                <p-button icon="pi pi-pencil" [text]="true" severity="secondary" ariaLabel="Edit" pTooltip="Edit" tooltipPosition="top" />
              </div>
              <div class="brand-toolbar wrap tags">
                <p-tag value="Approved" severity="success" />
                <p-tag value="Pending" severity="warn" />
                <p-tag value="Blocked" severity="danger" />
                <p-tag value="New" severity="info" />
                <p-tag value="Archived" severity="secondary" />
                <p-tag value="Brand" />
              </div>
            </section>
          </div>
        </div>

        <div class="two">
          <section class="brand-card" aria-label="Loading example">
            <div class="brand-card-header"><h2 class="brand-section-title">Loading</h2></div>
            <div class="loading">
              <p-skeleton width="40%" height="1.25rem" />
              <p-skeleton height="2.5rem" />
              <p-skeleton height="2.5rem" />
              <p-skeleton width="70%" height="2.5rem" />
            </div>
          </section>
          <section class="brand-card">
            <div class="brand-empty">
              <i class="pi pi-inbox empty-icon" aria-hidden="true"></i>
              <h2 class="brand-empty-title">No attachments yet</h2>
              <p>Add drawings, certificates or photos so the team has everything in one place.</p>
              <p-button label="Add attachment" icon="pi pi-paperclip" severity="secondary" [outlined]="true" />
            </div>
          </section>
        </div>
      </div>

      <p-dialog header="New request" [(visible)]="dialogOpen" [modal]="true" [draggable]="false" [style]="{ width: '440px', maxWidth: 'calc(100vw - 32px)' }">
        <div class="brand-field">
          <label for="pv-dialog-title">Title</label>
          <input pInputText id="pv-dialog-title" placeholder="What do you need?" />
        </div>
        <ng-template #footer>
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="dialogOpen = false" />
          <p-button label="Create request" (onClick)="dialogOpen = false; saved()" />
        </ng-template>
      </p-dialog>
      <p-toast position="bottom-right" />
    } @else {
      <p class="waiting">Loading the preview…</p>
    }
  `,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
    }
    .toolbar {
      margin-bottom: var(--brand-space-4);
    }
    .two {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
      gap: var(--brand-space-5);
      align-items: start;
    }
    .side {
      display: flex;
      flex-direction: column;
      gap: var(--brand-space-5);
    }
    @media (max-width: 860px) {
      .two {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .span {
      grid-column: 1 / -1;
    }
    textarea {
      width: 100%;
    }
    .plain {
      border: 0;
      margin: 0;
      padding: 0;
    }
    .plain legend,
    .label {
      font-weight: 600;
      font-size: 0.875rem;
      color: var(--brand-text-strong);
      padding: 0;
      margin-bottom: var(--brand-space-2);
    }
    .options {
      display: flex;
      gap: var(--brand-space-4);
      flex-wrap: wrap;
    }
    .option {
      display: inline-flex;
      align-items: center;
      gap: var(--brand-space-2);
    }
    .messages {
      display: flex;
      flex-direction: column;
      gap: var(--brand-space-2);
    }
    .wrap {
      gap: var(--brand-space-2);
    }
    .tags {
      margin-top: var(--brand-space-4);
    }
    .loading {
      display: flex;
      flex-direction: column;
      gap: var(--brand-space-3);
    }
    .empty-icon {
      font-size: 1.75rem;
      color: var(--brand-text-muted);
    }
    .mono {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 0.85rem;
      white-space: nowrap;
    }
    .toolbar p-iconfield {
      flex: 1 1 180px;
    }
    .toolbar input {
      width: 100%;
    }
    .waiting {
      padding: 24px;
      color: #888;
      font-family: system-ui, sans-serif;
    }
  `,
})
export class BrandPreview {
  private readonly document = inject(DOCUMENT);
  private readonly messages = inject(MessageService);
  protected readonly ready = signal(false);

  protected readonly rows = ROWS;
  protected selected: Row | null = null;
  protected readonly views = ['All', 'Mine', 'Team'];
  protected view = 'All';
  protected readonly statuses = ['Open', 'In progress', 'Resolved', 'Rejected'];
  protected status: string | null = null;
  protected readonly categories = ['Maintenance', 'Access', 'Purchasing', 'Quality'];
  protected category = 'Quality';
  protected readonly priorities = ['Low', 'Medium', 'High'];
  protected priority = 'Medium';
  protected title = 'Coating thickness report for batch 77';
  protected notes = '';
  protected due: Date | null = new Date();
  protected notify = true;
  protected urgent = false;
  protected dialogOpen = false;
  private appliedKey = '';

  constructor() {
    // The brand decides the look here: never Refit's dark mode.
    this.document.documentElement.classList.remove('app-dark');
    const window = this.document.defaultView;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window?.location.origin) return;
      const data = event.data as { type?: string; brand?: Brand } | null;
      if (data?.type === PREVIEW_BRAND && data.brand) this.apply(data.brand);
    };
    window?.addEventListener('message', onMessage);
    inject(DestroyRef).onDestroy(() => window?.removeEventListener('message', onMessage));
    window?.parent?.postMessage({ type: PREVIEW_READY }, window.location.origin);
  }

  protected saved(): void {
    this.messages.add({ severity: 'success', summary: 'Request saved', detail: 'M. Rossi was notified.', life: 3000 });
  }

  private apply(input: Brand): void {
    const brand = normalizeBrand(input);
    const key = JSON.stringify(brand);
    if (key === this.appliedKey) return;
    this.appliedKey = key;
    usePreset(definePreset(Aura, brandPresetTokens(brand)));
    let style = this.document.getElementById('brand-preview-css') as HTMLStyleElement | null;
    if (!style) {
      style = this.document.createElement('style');
      style.id = 'brand-preview-css';
      this.document.head.append(style);
    }
    style.textContent = brandCss(brand);
    this.ready.set(true);
  }
}
