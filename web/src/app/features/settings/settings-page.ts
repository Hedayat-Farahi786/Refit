import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AgentTaskKind, EditableConfig } from '@refit/shared';
import { firstMatchingGlob } from '@refit/shared';
import { Button } from 'primeng/button';
import { InputNumber } from 'primeng/inputnumber';
import { InputText } from 'primeng/inputtext';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { Textarea } from 'primeng/textarea';
import { ToggleSwitch } from 'primeng/toggleswitch';
import { Api } from '../../core/api';
import { AppState } from '../../core/app-state';
import { relativeTime } from '../../core/format';
import { Notify } from '../../core/notify';
import { Theme, type ThemeMode } from '../../core/theme';
import { ProvidersPanel } from './providers-panel';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, Button, InputNumber, InputText, Select, SelectButton, Textarea, ToggleSwitch, ProvidersPanel],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1 class="display">Settings</h1>
          <p class="lede">Defaults for every run. Changes are saved to <code>data/config.local.json</code> and override <code>refit.config.json</code>.</p>
        </div>
      </header>

      <section class="panel" aria-labelledby="appearance-title">
        <div class="panel-header"><h2 id="appearance-title">Appearance</h2></div>
        <div class="panel-body grid">
          <div class="field">
            <span class="field-label" id="theme-label">Theme</span>
            <p-selectbutton [options]="themeOptions" optionLabel="label" optionValue="value" [ngModel]="theme.mode()" (ngModelChange)="theme.setMode($event)" [allowEmpty]="false" ariaLabelledBy="theme-label" />
          </div>
        </div>
      </section>

      <app-providers-panel />

      <section class="panel" aria-labelledby="signin-title">
        <div class="panel-header">
          <div class="stack" style="--stack-gap: 2px">
            <h2 id="signin-title">Microsoft sign-in</h2>
            <p class="muted small">Apps that use Microsoft sign-in need a signed-in browser for screenshots. Sign in once; Refit's browser remembers it for later runs.</p>
          </div>
        </div>
        <div class="panel-body stack">
          <div class="signin-status" aria-live="polite">
            @if (state.state()?.signInOpen) {
              <i class="pi pi-window-maximize info-icon" aria-hidden="true"></i>
              <div class="stack" style="--stack-gap: 4px">
                <strong>A browser window is open</strong>
                <span class="soft small">Sign in there with the test account (including any popup or MFA). When Microsoft asks "Stay signed in?", choose Yes. Then come back here.</span>
              </div>
            } @else if (state.state()?.settings?.lastSignInAt; as savedAt) {
              <i class="pi pi-check-circle ok-icon" aria-hidden="true"></i>
              <div class="stack" style="--stack-gap: 4px">
                <strong>Session saved {{ ago(savedAt) }}</strong>
                <span class="soft small">Runs use it to sign in silently. Sign in again if a run says sign-in is needed.</span>
              </div>
            } @else {
              <i class="pi pi-info-circle muted" aria-hidden="true"></i>
              <div class="stack" style="--stack-gap: 4px">
                <strong>No saved session yet</strong>
                <span class="soft small">Only needed for apps that use Microsoft sign-in.</span>
              </div>
            }
          </div>
          <div class="cluster">
            @if (state.state()?.signInOpen) {
              <p-button label="I'm signed in" icon="pi pi-check" [loading]="signInBusy()" (onClick)="finishSignIn()" />
            } @else {
              <p-button
                label="Sign in once"
                icon="pi pi-sign-in"
                [outlined]="true"
                [loading]="signInBusy()"
                [disabled]="!!state.state()?.activeRunId"
                (onClick)="openSignIn()"
              />
              @if (state.state()?.activeRunId) {
                <span class="muted small">Available when no run is in progress.</span>
              }
            }
          </div>
          <ul class="tips small soft">
            <li>Ask IT for a dedicated test account. Do not use your personal account.</li>
            <li>Conditional Access policies can block automated browsers. If sign-in keeps failing, ask IT to allow the test account on this computer.</li>
            <li>The app's dev server port (usually 4200) must be a redirect URI of the app in Entra ID.</li>
          </ul>
        </div>
      </section>

      @if (draft(); as config) {
        <form class="stack" style="--stack-gap: 24px" (ngSubmit)="save()">
          <section class="panel" aria-labelledby="budget-title">
            <div class="panel-header">
              <div class="stack" style="--stack-gap: 2px">
                <h2 id="budget-title">Budgets</h2>
                <p class="muted small">Hard limits for AI spend. Refit stops starting new work when a limit is reached.</p>
              </div>
            </div>
            <div class="panel-body grid budgets">
              <div class="field">
                <label for="b-page">Per page</label>
                <p-inputnumber inputId="b-page" name="perPageUsd" [(ngModel)]="config.budget.perPageUsd" mode="currency" currency="USD" [min]="0" [maxFractionDigits]="2" [fluid]="true" />
                <span class="field-hint">Covers the page, its fixes and its design reviews.</span>
              </div>
              <div class="field">
                <label for="b-run">Per run</label>
                <p-inputnumber inputId="b-run" name="perRunUsd" [(ngModel)]="config.budget.perRunUsd" mode="currency" currency="USD" [min]="0" [maxFractionDigits]="2" [fluid]="true" />
              </div>
              <div class="field">
                <label for="b-found">Foundation</label>
                <p-inputnumber inputId="b-found" name="foundationUsd" [(ngModel)]="config.budget.foundationUsd" mode="currency" currency="USD" [min]="0" [maxFractionDigits]="2" [fluid]="true" />
                <span class="field-hint">Theme setup and the app shell.</span>
              </div>
              <div class="field">
                <label for="b-review">Agent review</label>
                <p-inputnumber inputId="b-review" name="reviewUsd" [(ngModel)]="config.budget.reviewUsd" mode="currency" currency="USD" [min]="0" [maxFractionDigits]="2" [fluid]="true" />
              </div>
            </div>
          </section>

          <section class="panel" aria-labelledby="defaults-title">
            <div class="panel-header"><h2 id="defaults-title">Run defaults</h2></div>
            <div class="panel-body grid">
              <div class="field">
                <span class="field-label" id="rounds-label">Design review rounds</span>
                <p-selectbutton [options]="roundOptions" optionLabel="label" optionValue="value" name="polishRounds" [(ngModel)]="config.defaults.polishRounds" [allowEmpty]="false" ariaLabelledBy="rounds-label" />
              </div>
              <div class="field">
                <span class="field-label" id="api-label">When API calls change</span>
                <p-selectbutton [options]="apiOptions" optionLabel="label" optionValue="value" name="onApiChange" [(ngModel)]="config.defaults.onApiChange" [allowEmpty]="false" ariaLabelledBy="api-label" />
              </div>
              <label class="switch">
                <p-toggleswitch name="runTests" [(ngModel)]="config.defaults.runTests" ariaLabel="Run unit tests" />
                <span><strong>Run unit tests</strong><span class="field-hint block">Before and after, to report regressions.</span></span>
              </label>
              <label class="switch">
                <p-toggleswitch name="upgradeAngular" [(ngModel)]="config.defaults.upgradeAngular" ariaLabel="Upgrade Angular" />
                <span><strong>Upgrade Angular</strong><span class="field-hint block">One major version at a time, up to {{ state.state()?.config?.targetAngularMajor }}.</span></span>
              </label>
            </div>
          </section>

          <section class="panel" aria-labelledby="models-title">
            <div class="panel-header">
              <div class="stack" style="--stack-gap: 2px">
                <h2 id="models-title">Models</h2>
                <p class="muted small">Aliases like "sonnet" always use the current model of that family.</p>
              </div>
            </div>
            <div class="panel-body grid">
              @for (task of tasks; track task.key) {
                <div class="field">
                  <label [for]="'m-' + task.key">Claude: {{ task.label }}</label>
                  <input pInputText [id]="'m-' + task.key" [name]="'model-' + task.key" [(ngModel)]="config.claude.models[task.key]" class="mono" />
                </div>
              }
              <div class="field">
                <label for="m-strong">Claude: stronger model for complex pages</label>
                <input pInputText id="m-strong" name="strongModel" [(ngModel)]="config.claude.strongModel" class="mono" />
              </div>
              <div class="field">
                <label for="m-effort">Claude: effort</label>
                <p-select inputId="m-effort" name="effort" [options]="effortOptions" [(ngModel)]="config.claude.effort" [fluid]="true" />
              </div>
              <label class="switch">
                <p-toggleswitch name="strongPages" [(ngModel)]="config.defaults.strongModelForComplexPages" ariaLabel="Use the stronger model for complex pages" />
                <span><strong>Use the stronger model for complex pages</strong><span class="field-hint block">Pages the agent review rates "high".</span></span>
              </label>
              <div class="field">
                <label for="m-copilot">GitHub Copilot model</label>
                <input pInputText id="m-copilot" name="copilotModel" [(ngModel)]="config.copilot.model" class="mono" placeholder="Copilot's default" />
              </div>
              <div class="field">
                <label for="m-copilot-credits">GitHub Copilot: AI credit limit per task</label>
                <p-inputnumber inputId="m-copilot-credits" name="copilotCredits" [(ngModel)]="config.copilot.maxAiCreditsPerTask" [min]="0" [useGrouping]="false" [fluid]="true" />
                <span class="field-hint">0 means no limit. Copilot's smallest limit is 30.</span>
              </div>
              <div class="field">
                <label for="m-copilot-cmd">GitHub Copilot CLI program</label>
                <input pInputText id="m-copilot-cmd" name="copilotCommand" [(ngModel)]="config.copilot.command" class="mono" placeholder="copilot" />
                <span class="field-hint">A name on the PATH or the full path, for example C:\\Tools\\copilot.exe.</span>
              </div>
            </div>
          </section>

          <section class="panel" aria-labelledby="paths-title">
            <div class="panel-header">
              <div class="stack" style="--stack-gap: 2px">
                <h2 id="paths-title">Protected and sensitive files</h2>
                <p class="muted small">Protected files are never changed: Refit reverts any change to them. Sensitive files may change but are highlighted for reviewers.</p>
              </div>
            </div>
            <div class="panel-body grid two">
              <div class="field">
                <label for="p-protected">Protected (one pattern per line)</label>
                <textarea pTextarea id="p-protected" name="protected" rows="10" class="mono" [(ngModel)]="protectedText" (ngModelChange)="protectedSignal.set($event)"></textarea>
              </div>
              <div class="field">
                <label for="p-sensitive">Sensitive (one pattern per line)</label>
                <textarea pTextarea id="p-sensitive" name="sensitive" rows="10" class="mono" [(ngModel)]="sensitiveText" (ngModelChange)="sensitiveSignal.set($event)"></textarea>
              </div>
              <div class="field span">
                <label for="p-test">Test a file path</label>
                <input pInputText id="p-test" name="testPath" class="mono" [(ngModel)]="testPath" (ngModelChange)="testPathSignal.set($event)" placeholder="src/app/core/auth.service.ts" />
                <span class="field-hint" aria-live="polite">{{ testResult() }}</span>
                <span class="field-hint"><code>**</code> matches any folders, <code>*</code> any characters in a name, <code>?</code> one character. A pattern without a slash matches the file name anywhere.</span>
              </div>
            </div>
          </section>

          @if (isDirty()) {
            <div class="save" role="region" aria-label="Unsaved settings">
              <span class="soft small"><i class="pi pi-pencil" aria-hidden="true"></i> You have unsaved changes.</span>
              <span class="spacer"></span>
              <p-button label="Discard changes" severity="secondary" [text]="true" (onClick)="reset()" />
              <p-button label="Save settings" icon="pi pi-check" type="submit" [loading]="saving()" />
            </div>
          }
        </form>
      }
    </div>
  `,
  styles: `
    :host {
      flex: 1;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px 24px;
    }
    .grid.two {
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }
    .grid.budgets {
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    }
    .span {
      grid-column: 1 / -1;
    }
    .switch {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      cursor: pointer;
    }
    .block {
      display: block;
    }
    input[pInputText],
    textarea {
      width: 100%;
    }
    .signin-status {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 14px 16px;
      border-radius: var(--refit-radius-lg);
      background: var(--refit-subtle);
    }
    .signin-status > .pi {
      font-size: 1.15rem;
      margin-top: 2px;
    }
    .ok-icon {
      color: var(--refit-success);
    }
    .info-icon {
      color: var(--refit-info);
    }
    .tips {
      margin: 0;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .save {
      position: sticky;
      bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px 10px 20px;
      border: 1px solid var(--refit-border);
      border-radius: var(--refit-radius-xl);
      background: var(--refit-panel-raised);
      box-shadow: var(--refit-shadow-float);
    }
  `,
})
export class SettingsPage {
  protected readonly state = inject(AppState);
  protected readonly theme = inject(Theme);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  protected readonly draft = signal<EditableConfig | null>(null);
  protected readonly saving = signal(false);
  protected protectedText = '';
  protected sensitiveText = '';
  protected testPath = '';
  protected readonly protectedSignal = signal('');
  protected readonly sensitiveSignal = signal('');
  protected readonly testPathSignal = signal('');

  protected readonly themeOptions: Array<{ label: string; value: ThemeMode }> = [
    { label: 'System', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
  ];
  protected readonly roundOptions = [
    { label: 'None', value: 0 },
    { label: '1 round', value: 1 },
    { label: '2 rounds', value: 2 },
  ];
  protected readonly apiOptions = [
    { label: 'Flag the page', value: 'flag' },
    { label: 'Roll back the page', value: 'rollback' },
  ];
  protected readonly effortOptions = ['low', 'medium', 'high', 'xhigh', 'max'];
  protected readonly tasks: Array<{ key: AgentTaskKind; label: string }> = [
    { key: 'review', label: 'review' },
    { key: 'foundation', label: 'foundation' },
    { key: 'page', label: 'pages' },
    { key: 'polish', label: 'design review' },
    { key: 'fix', label: 'build fixes' },
  ];

  protected readonly testResult = computed(() => {
    const file = this.testPathSignal().trim();
    if (!file) return 'Type a path to see how Refit treats it.';
    const protectedMatch = firstMatchingGlob(file, lines(this.protectedSignal()));
    if (protectedMatch) return `Protected by "${protectedMatch}": the agent cannot change it.`;
    const sensitiveMatch = firstMatchingGlob(file, lines(this.sensitiveSignal()));
    if (sensitiveMatch) return `Sensitive because of "${sensitiveMatch}": allowed, and highlighted for reviewers.`;
    return 'Not protected or sensitive: the agent may change it if it belongs to the page.';
  });

  constructor() {
    effect(() => {
      const config = this.state.state()?.config;
      if (config && !untracked(this.draft)) this.fill(config);
    });
  }

  private savedJson = '';

  /** True when the form differs from the saved settings. */
  protected isDirty(): boolean {
    const draft = this.draft();
    if (!draft) return false;
    return JSON.stringify({ ...draft, protectedPaths: lines(this.protectedText), sensitivePaths: lines(this.sensitiveText) }) !== this.savedJson;
  }

  private fill(config: EditableConfig): void {
    this.draft.set(structuredClone({
      budget: config.budget,
      claude: config.claude,
      copilot: config.copilot,
      defaults: config.defaults,
      protectedPaths: config.protectedPaths,
      sensitivePaths: config.sensitivePaths,
    }));
    this.protectedText = config.protectedPaths.join('\n');
    this.sensitiveText = config.sensitivePaths.join('\n');
    this.protectedSignal.set(this.protectedText);
    this.sensitiveSignal.set(this.sensitiveText);
    this.savedJson = JSON.stringify(this.draft());
  }

  protected reset(): void {
    const config = this.state.state()?.config;
    if (config) this.fill(config);
  }

  protected readonly signInBusy = signal(false);

  protected ago(iso: string): string {
    return relativeTime(iso);
  }

  protected async openSignIn(): Promise<void> {
    this.signInBusy.set(true);
    try {
      await this.api.openSignIn();
      this.notify.info('Sign-in window opened', 'Sign in there, then come back and choose "I\'m signed in".');
      this.state.refresh();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.signInBusy.set(false);
    }
  }

  protected async finishSignIn(): Promise<void> {
    this.signInBusy.set(true);
    try {
      await this.api.finishSignIn();
      this.notify.success('Session saved', 'Runs will sign in with it.');
      this.state.refresh();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.signInBusy.set(false);
    }
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    this.saving.set(true);
    try {
      const saved = await this.api.saveConfig({ ...draft, protectedPaths: lines(this.protectedText), sensitivePaths: lines(this.sensitiveText) });
      this.fill(saved);
      this.state.refresh();
      this.notify.success('Settings saved');
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
