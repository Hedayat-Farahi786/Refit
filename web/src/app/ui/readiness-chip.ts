import { Component, computed, input } from '@angular/core';
import type { Readiness } from '@refit/shared';

const LABELS: Record<Readiness, string> = { green: 'Ready', yellow: 'Check first', red: 'Blocked' };
const ICONS: Record<Readiness, string> = { green: 'pi-check-circle', yellow: 'pi-exclamation-circle', red: 'pi-ban' };

/** Green / yellow / red readiness, always with an icon and a word (never color alone). */
@Component({
  selector: 'app-readiness-chip',
  template: `
    <span class="chip" [class]="readiness() ?? 'none'">
      @if (readiness(); as value) {
        <i class="pi" [class]="icon()" aria-hidden="true"></i>{{ label() }}
      } @else {
        <i class="pi pi-question-circle" aria-hidden="true"></i>Not scanned
      }
    </span>
  `,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1.6;
      white-space: nowrap;
    }
    .chip .pi {
      font-size: 0.75rem;
    }
    .green {
      color: var(--refit-success);
      background: var(--refit-success-soft);
    }
    .yellow {
      color: var(--refit-warn);
      background: var(--refit-warn-soft);
    }
    .red {
      color: var(--refit-danger);
      background: var(--refit-danger-soft);
    }
    .none {
      color: var(--refit-muted);
      background: var(--refit-subtle);
    }
  `,
})
export class ReadinessChip {
  readonly readiness = input<Readiness | null | undefined>(null);
  protected readonly label = computed(() => LABELS[this.readiness() ?? 'green']);
  protected readonly icon = computed(() => ICONS[this.readiness() ?? 'green']);
}
