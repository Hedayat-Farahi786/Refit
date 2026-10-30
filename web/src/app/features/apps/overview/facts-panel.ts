import { Component, computed, input } from '@angular/core';
import type { ScanResult } from '@refit/shared';

@Component({
  selector: 'app-facts-panel',
  template: `
    <section class="panel" aria-labelledby="facts-title">
      <div class="panel-header"><h2 id="facts-title">What we found</h2></div>
      <dl class="facts">
        @for (fact of scan().facts; track fact.label) {
          <div class="fact">
            <dt class="muted small">{{ fact.label }}</dt>
            <dd [class]="fact.tone ?? 'neutral'">{{ fact.value }}</dd>
          </div>
        }
      </dl>
      <div class="panel-header commands-head"><h2>Commands</h2></div>
      <dl class="facts">
        @for (command of commands(); track command.label) {
          <div class="fact">
            <dt class="muted small">{{ command.label }}</dt>
            <dd><code>{{ command.value }}</code></dd>
          </div>
        }
      </dl>
    </section>
  `,
  styles: `
    .facts {
      display: flex;
      flex-direction: column;
      padding: 8px 0;
    }
    .fact {
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr);
      gap: 12px;
      padding: 8px 20px;
    }
    dd {
      overflow-wrap: anywhere;
      font-weight: 500;
    }
    dd code {
      font-weight: 400;
      font-size: 0.8rem;
      color: var(--refit-text-soft);
    }
    .good {
      color: var(--refit-success);
    }
    .warn {
      color: var(--refit-warn);
    }
    .bad {
      color: var(--refit-danger);
    }
    .commands-head {
      border-top: 1px solid var(--refit-border);
    }
  `,
})
export class FactsPanel {
  readonly scan = input.required<ScanResult>();

  protected readonly commands = computed(() => {
    const commands = this.scan().commands;
    const rows = [
      { label: 'Install', value: commands.install },
      { label: 'Build', value: commands.build },
      { label: 'Serve', value: commands.serve },
    ];
    if (commands.test) rows.push({ label: 'Test', value: commands.test });
    for (const [key, value] of Object.entries(commands.env)) rows.push({ label: 'Env', value: `${key}=${value}` });
    return rows;
  });
}
