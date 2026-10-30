import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AppRecord, CommandOverrides } from '@refit/shared';
import { Button } from 'primeng/button';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Textarea } from 'primeng/textarea';
import { Api } from '../../../core/api';
import { AppState } from '../../../core/app-state';
import { Notify } from '../../../core/notify';

type CommandKey = 'install' | 'build' | 'test' | 'serve';

@Component({
  selector: 'app-advanced-settings',
  imports: [FormsModule, Button, InputNumber, InputText, Textarea],
  template: `
    <section class="panel" aria-labelledby="advanced-title">
      <button type="button" class="toggle" (click)="toggle()" [attr.aria-expanded]="open()" aria-controls="advanced-body">
        <span class="stack" style="--stack-gap: 2px">
          <h2 id="advanced-title">Advanced</h2>
          <span class="muted small">{{ summary() }}</span>
        </span>
        <i class="pi" [class]="open() ? 'pi-chevron-up' : 'pi-chevron-down'" aria-hidden="true"></i>
      </button>

      @if (open()) {
        <form id="advanced-body" class="body stack" style="--stack-gap: 20px" (ngSubmit)="save()">
          <div class="grid">
            <div class="field">
              <label for="adv-port">Dev server port</label>
              <p-inputnumber inputId="adv-port" name="port" [(ngModel)]="port" [useGrouping]="false" [min]="1024" [max]="65535" [fluid]="true" />
              <span class="field-hint">Must match a redirect URI of the app in Entra ID for Microsoft sign-in.</span>
            </div>
            @if (app().source.kind === 'git') {
              <div class="field">
                <label for="adv-subdir">App folder in the repo</label>
                <input pInputText id="adv-subdir" name="subdir" class="mono" [(ngModel)]="subdir" placeholder="Repo root" />
              </div>
            }
          </div>

          <div class="stack" style="--stack-gap: 12px">
            <h3 class="section-title">Commands</h3>
            <p class="muted small">Leave a field empty to use the command Refit found. <code>{{ '{port}' }}</code> is replaced with the port.</p>
            @for (command of commandFields; track command.key) {
              <div class="field">
                <label [for]="'adv-' + command.key">{{ command.label }}</label>
                <input
                  pInputText
                  class="mono"
                  [id]="'adv-' + command.key"
                  [name]="command.key"
                  [(ngModel)]="commands[command.key]"
                  [placeholder]="detected(command.key) || command.fallback"
                  autocomplete="off"
                  spellcheck="false"
                />
              </div>
            }
          </div>

          <div class="grid">
            <div class="field">
              <label for="adv-env">Extra environment variables</label>
              <textarea pTextarea id="adv-env" name="env" rows="3" class="mono" [(ngModel)]="envText" placeholder="KEY=value, one per line"></textarea>
              @if (detectedEnv()) {
                <span class="field-hint">Refit already sets {{ detectedEnv() }}.</span>
              }
              <span class="field-hint">Do not put secrets here; they are stored in plain text.</span>
            </div>
            <div class="field">
              <label for="adv-node">Node folder for this app</label>
              <input pInputText id="adv-node" name="nodeDir" class="mono" [(ngModel)]="nodeDir" [placeholder]="nodeExample()" autocomplete="off" spellcheck="false" />
              <span class="field-hint">Only for old apps that need an older Node. Refit puts this folder first on PATH for the app's commands.</span>
            </div>
          </div>

          <div class="cluster actions">
            <p-button label="Save advanced settings" icon="pi pi-check" type="submit" size="small" [loading]="saving()" />
            <p-button label="Reset to detected" severity="secondary" [text]="true" size="small" (onClick)="resetToDetected()" />
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .toggle {
      all: unset;
      box-sizing: border-box;
      cursor: pointer;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 24px;
      border-radius: var(--refit-radius-xl);
    }
    .toggle:focus-visible {
      outline: 2px solid var(--p-primary-color);
      outline-offset: -2px;
    }
    .body {
      padding: 4px 24px 24px;
      border-top: 1px solid var(--refit-border);
      padding-top: 20px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 20px;
    }
    input[pInputText],
    textarea {
      width: 100%;
    }
    .actions {
      padding-top: 4px;
    }
  `,
})
export class AdvancedSettings {
  readonly app = input.required<AppRecord>();
  private readonly api = inject(Api);
  private readonly appState = inject(AppState);
  private readonly notify = inject(Notify);

  protected readonly open = signal(false);
  protected readonly saving = signal(false);
  protected port = 4200;
  protected subdir = '';
  protected commands: Record<CommandKey, string> = { install: '', build: '', test: '', serve: '' };
  protected envText = '';
  protected nodeDir = '';

  protected readonly commandFields: Array<{ key: CommandKey; label: string; fallback: string }> = [
    { key: 'install', label: 'Install', fallback: 'npm ci' },
    { key: 'build', label: 'Build', fallback: 'npm run build' },
    { key: 'test', label: 'Test', fallback: 'No tests found' },
    { key: 'serve', label: 'Dev server', fallback: 'npx ng serve --port {port}' },
  ];

  protected readonly summary = computed(() => {
    const overrides = this.app().overrides;
    const changed = (['install', 'build', 'test', 'serve', 'nodeDir'] as const).filter((key) => overrides[key]).length + (overrides.env ? 1 : 0);
    return `Port ${this.app().port}. ${changed === 0 ? 'Using the detected commands.' : `${changed} ${changed === 1 ? 'setting' : 'settings'} changed from the detected values.`}`;
  });

  protected readonly detectedEnv = computed(() =>
    Object.entries(this.app().scan?.commands.env ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join(', '),
  );

  protected readonly nodeExample = computed(() =>
    this.appState.state()?.platform === 'windows' ? 'C:\\Users\\you\\AppData\\Local\\nvm\\v18.20.4' : '~/.nvm/versions/node/v18.20.4/bin',
  );

  protected detected(key: CommandKey): string {
    return this.app().scan?.commands[key] ?? '';
  }

  protected toggle(): void {
    if (!this.open()) this.load();
    this.open.set(!this.open());
  }

  private load(): void {
    const app = this.app();
    this.port = app.port;
    this.subdir = app.source.kind === 'git' ? (app.source.subdir ?? '') : '';
    this.commands = {
      install: app.overrides.install ?? '',
      build: app.overrides.build ?? '',
      test: app.overrides.test ?? '',
      serve: app.overrides.serve ?? '',
    };
    this.envText = Object.entries(app.overrides.env ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    this.nodeDir = app.overrides.nodeDir ?? '';
  }

  protected resetToDetected(): void {
    this.commands = { install: '', build: '', test: '', serve: '' };
    this.envText = '';
    this.nodeDir = '';
  }

  protected async save(): Promise<void> {
    const env: Record<string, string> = {};
    for (const line of this.envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const index = trimmed.indexOf('=');
      if (index <= 0) {
        this.notify.error(new Error(`"${trimmed}" is not KEY=value.`), 'Check the environment variables');
        return;
      }
      env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
    }
    const overrides: CommandOverrides = { ...this.commands, nodeDir: this.nodeDir, env };
    this.saving.set(true);
    try {
      const updated = await this.api.updateApp(this.app().id, {
        port: this.port,
        overrides,
        ...(this.app().source.kind === 'git' ? { subdir: this.subdir } : {}),
      });
      this.appState.patchApp(updated);
      this.notify.success('Advanced settings saved', updated.scanState.status === 'scanning' ? 'Scanning again with the new settings.' : undefined);
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }
}
