import { Component, computed, inject, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { Api, type FolderInspection } from '../../core/api';
import { AppState } from '../../core/app-state';
import { Notify } from '../../core/notify';

type SourceKind = 'local' | 'git';

@Component({
  selector: 'app-add-app-dialog',
  imports: [FormsModule, Button, Dialog, InputNumber, InputText, SelectButton],
  template: `
    <p-dialog
      header="Add an app"
      [(visible)]="visible"
      [modal]="true"
      [draggable]="false"
      [dismissableMask]="true"
      [style]="{ width: '580px', maxWidth: 'calc(100vw - 32px)' }"
      (onHide)="reset()"
    >
      <form class="stack" (ngSubmit)="submit()">
        <p class="soft small">Refit never changes this folder or repository. It works on its own copy.</p>
        <p-selectbutton
          [options]="kinds"
          optionLabel="label"
          optionValue="value"
          [(ngModel)]="kind"
          name="kind"
          [allowEmpty]="false"
          aria-label="Where the app's code is"
        />

        @if (kind === 'local') {
          <div class="field">
            <label for="app-path">Folder</label>
            <input
              pInputText
              id="app-path"
              name="path"
              [(ngModel)]="path"
              (ngModelChange)="inspectSoon()"
              [placeholder]="platformPathExample()"
              autocomplete="off"
              spellcheck="false"
              class="mono"
              aria-describedby="app-path-hint"
            />
            <span id="app-path-hint" class="field-hint" [class.field-error]="inspection()?.ok === false" [class.warn]="!!inspection()?.warning" aria-live="polite">
              @if (inspecting()) {
                <i class="pi pi-spin pi-spinner" aria-hidden="true"></i> Checking the folder…
              } @else if (inspection(); as info) {
                @if (!info.ok) {
                  {{ info.message }}
                } @else if (info.warning) {
                  {{ info.warning }}
                } @else {
                  <i class="pi pi-check" aria-hidden="true"></i> {{ info.message }}
                }
              } @else {
                The folder with the app's package.json. Paths copied with quotes work too.
              }
            </span>
          </div>
        } @else {
          <div class="field">
            <label for="app-url">Git URL</label>
            <input pInputText id="app-url" name="url" [(ngModel)]="url" placeholder="https://github.com/org/app.git" autocomplete="off" spellcheck="false" class="mono" />
            <span class="field-hint">HTTPS or SSH. Refit uses your normal git sign-in to clone it.</span>
          </div>
          <div class="field">
            <label for="app-subdir">App folder in the repo <span class="muted">(optional)</span></label>
            <input pInputText id="app-subdir" name="subdir" [(ngModel)]="subdir" placeholder="For example ClientApp" autocomplete="off" class="mono" />
          </div>
        }

        <div class="row">
          <div class="field grow">
            <label for="app-name">Name</label>
            <input pInputText id="app-name" name="name" [(ngModel)]="name" (ngModelChange)="nameTouched = true" placeholder="For example Request portal" autocomplete="off" required maxlength="80" />
          </div>
          <div class="field port">
            <label for="app-port">Dev server port</label>
            <p-inputnumber inputId="app-port" name="port" [(ngModel)]="port" [useGrouping]="false" [min]="1024" [max]="65535" [fluid]="true" />
          </div>
        </div>
        <p class="field-hint">
          Use the port the app normally runs on. Microsoft sign-in only works on a port registered as a redirect URI for the app in Entra ID
          (usually 4200).
        </p>
        @if (error()) {
          <p class="field-error" role="alert">{{ error() }}</p>
        }
        <!-- Lets Enter submit the form; the visible button lives in the dialog footer. -->
        <button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
      </form>
      <ng-template #footer>
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="visible.set(false)" />
        <p-button label="Add and scan" icon="pi pi-search" [loading]="saving()" [disabled]="!canSubmit()" (onClick)="submit()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .grow {
      flex: 1 1 240px;
    }
    .port {
      flex: 0 0 150px;
    }
    .warn {
      color: var(--refit-warn);
    }
    input[pInputText] {
      width: 100%;
    }
  `,
})
export class AddAppDialog {
  private readonly api = inject(Api);
  private readonly appState = inject(AppState);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);

  readonly visible = model(false);

  protected readonly kinds = [
    { label: 'Folder on this computer', value: 'local' as SourceKind },
    { label: 'Git URL', value: 'git' as SourceKind },
  ];
  protected kind: SourceKind = 'local';
  protected path = '';
  protected url = '';
  protected subdir = '';
  protected name = '';
  protected port = 4200;
  protected nameTouched = false;
  private inspectTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly inspection = signal<FolderInspection | null>(null);
  protected readonly inspecting = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly platformPathExample = computed(() =>
    this.appState.state()?.platform === 'windows' ? 'C:\\Users\\you\\code\\request-portal' : '/Users/you/code/request-portal',
  );

  protected canSubmit(): boolean {
    const sourceOk = this.kind === 'local' ? this.path.trim() !== '' && this.inspection()?.ok !== false : this.url.trim() !== '';
    return sourceOk && this.name.trim() !== '' && !this.saving();
  }

  /** Clears the form after the dialog closes, so the next open starts fresh. */
  protected reset(): void {
    if (this.inspectTimer) clearTimeout(this.inspectTimer);
    this.inspectTimer = null;
    this.kind = 'local';
    this.path = '';
    this.url = '';
    this.subdir = '';
    this.name = '';
    this.port = 4200;
    this.nameTouched = false;
    this.inspection.set(null);
    this.error.set('');
  }

  protected inspectSoon(): void {
    if (this.inspectTimer) clearTimeout(this.inspectTimer);
    this.inspection.set(null);
    if (!this.path.trim()) return;
    this.inspectTimer = setTimeout(() => void this.inspect(), 350);
  }

  private async inspect(): Promise<void> {
    if (!this.path.trim()) return;
    this.inspecting.set(true);
    try {
      const info = await this.api.inspectFolder(this.path);
      this.inspection.set(info);
      if (info.suggestedName && (!this.nameTouched || !this.name)) this.name = info.suggestedName;
    } catch {
      this.inspection.set(null);
    } finally {
      this.inspecting.set(false);
    }
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const source = this.kind === 'local' ? { kind: 'local' as const, path: this.path } : { kind: 'git' as const, url: this.url, ...(this.subdir.trim() ? { subdir: this.subdir } : {}) };
      const app = await this.api.addApp({ name: this.name, source, port: this.port });
      this.appState.refresh();
      this.notify.success('App added', `Scanning ${app.name} now.`);
      this.visible.set(false);
      void this.router.navigate(['/apps', app.id]);
    } catch (error) {
      const problem = error as { message?: string; fix?: string };
      this.error.set([problem.message, problem.fix].filter(Boolean).join(' '));
    } finally {
      this.saving.set(false);
    }
  }
}
