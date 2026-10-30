import { Component, computed, input, signal } from '@angular/core';
import type { AppRecord, Finding } from '@refit/shared';
import { plural } from '../../../core/format';

const SEVERITY_ICON: Record<Finding['severity'], string> = {
  block: 'pi-ban',
  warn: 'pi-exclamation-triangle',
  info: 'pi-info-circle',
};

@Component({
  selector: 'app-readiness-panel',
  template: `
    <section class="panel" aria-labelledby="readiness-title">
      <div class="hero" [class]="app().readiness ?? 'none'">
        <div class="badge" aria-hidden="true"><i class="pi" [class]="heroIcon()"></i></div>
        <div class="hero-text">
          <h2 id="readiness-title">{{ headline() }}</h2>
          <p class="soft">{{ summary() }}</p>
        </div>
      </div>

      @if (important().length > 0) {
        <ul class="findings" role="list">
          @for (finding of important(); track finding.id) {
            <li class="finding" [class]="finding.severity">
              <i class="pi" [class]="icon(finding)" aria-hidden="true"></i>
              <div class="finding-text">
                <h3>{{ finding.title }}<span class="sr-only"> ({{ severityLabel(finding) }})</span></h3>
                <p class="soft">{{ finding.explanation }}</p>
                <p class="fix"><span class="fix-label">How to fix</span>{{ finding.fix }}</p>
              </div>
            </li>
          }
        </ul>
      }

      @if (notes().length > 0) {
        <div class="notes">
          <button type="button" class="notes-toggle" (click)="showNotes.set(!showNotes())" [attr.aria-expanded]="showNotes()">
            <i class="pi" [class]="showNotes() ? 'pi-chevron-down' : 'pi-chevron-right'" aria-hidden="true"></i>
            {{ notesLabel() }}
          </button>
          @if (showNotes()) {
            <ul class="findings notes-list" role="list">
              @for (finding of notes(); track finding.id) {
                <li class="finding info">
                  <i class="pi pi-info-circle" aria-hidden="true"></i>
                  <div class="finding-text">
                    <h3>{{ finding.title }}</h3>
                    <p class="soft">{{ finding.explanation }}</p>
                    <p class="fix"><span class="fix-label">Note</span>{{ finding.fix }}</p>
                  </div>
                </li>
              }
            </ul>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .hero {
      display: flex;
      gap: 16px;
      align-items: center;
      padding: 22px 24px;
    }
    .badge {
      flex: 0 0 44px;
      height: 44px;
      border-radius: 12px;
      display: grid;
      place-items: center;
    }
    .badge .pi {
      font-size: 1.3rem;
    }
    .green .badge {
      background: var(--refit-success-soft);
      color: var(--refit-success);
    }
    .yellow .badge {
      background: var(--refit-warn-soft);
      color: var(--refit-warn);
    }
    .red .badge {
      background: var(--refit-danger-soft);
      color: var(--refit-danger);
    }
    .none .badge {
      background: var(--refit-subtle);
      color: var(--refit-muted);
    }
    .hero-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .findings {
      border-top: 1px solid var(--refit-border);
    }
    .finding {
      display: flex;
      gap: 14px;
      padding: 16px 24px;
      border-bottom: 1px solid var(--refit-border);
    }
    .finding:last-child {
      border-bottom: none;
    }
    .finding > .pi {
      margin-top: 3px;
      font-size: 1rem;
    }
    .finding.block > .pi {
      color: var(--refit-danger);
    }
    .finding.warn > .pi {
      color: var(--refit-warn);
    }
    .finding.info > .pi {
      color: var(--refit-info);
    }
    .finding-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .finding h3 {
      font-size: 0.95rem;
    }
    .fix {
      font-size: 0.875rem;
      color: var(--refit-text-soft);
    }
    .fix-label {
      font-weight: 600;
      color: var(--refit-text);
      margin-right: 8px;
    }
    .notes {
      border-top: 1px solid var(--refit-border);
    }
    .notes-toggle {
      all: unset;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      width: calc(100% - 48px);
      padding: 12px 24px;
      color: var(--refit-text-soft);
      font-weight: 500;
      font-size: 0.875rem;
    }
    .notes-toggle:focus-visible {
      outline: 2px solid var(--refit-accent);
      outline-offset: -2px;
    }
    .notes-list .finding {
      padding-top: 12px;
      padding-bottom: 12px;
    }
  `,
})
export class ReadinessPanel {
  readonly app = input.required<AppRecord>();
  protected readonly showNotes = signal(false);

  protected readonly important = computed(() => this.app().findings.filter((finding) => finding.severity !== 'info'));
  protected readonly notes = computed(() => this.app().findings.filter((finding) => finding.severity === 'info'));
  protected readonly notesLabel = computed(() => (this.notes().length === 1 ? '1 note' : `${this.notes().length} notes`));

  protected readonly heroIcon = computed(() => {
    switch (this.app().readiness) {
      case 'green':
        return 'pi-check';
      case 'yellow':
        return 'pi-exclamation-triangle';
      case 'red':
        return 'pi-ban';
      default:
        return 'pi-question';
    }
  });

  protected readonly headline = computed(() => {
    const blocking = this.app().findings.filter((finding) => finding.severity === 'block').length;
    const warnings = this.app().findings.filter((finding) => finding.severity === 'warn').length;
    switch (this.app().readiness) {
      case 'green':
        return 'Ready to modernize';
      case 'yellow':
        return `Ready, with ${plural(warnings, 'thing')} to check`;
      case 'red':
        return `Blocked: ${plural(blocking, 'issue')} to fix first`;
      default:
        return 'Not scanned yet';
    }
  });

  protected readonly summary = computed(() => {
    const scan = this.app().scan;
    if (!scan) return 'Scan the app to see whether it is ready.';
    const included = this.app().pages.filter((page) => page.include).length;
    const parts = [
      `${plural(scan.counts.pages, 'page')} found${included !== scan.counts.pages ? ` (${included} included)` : ''}`,
      plural(scan.counts.components, 'component'),
      scan.counts.specs > 0 ? plural(scan.counts.specs, 'test file') : 'no unit tests',
    ];
    return `${parts.join(', ')}.`;
  });

  protected icon(finding: Finding): string {
    return SEVERITY_ICON[finding.severity];
  }

  protected severityLabel(finding: Finding): string {
    return finding.severity === 'block' ? 'blocking' : finding.severity === 'warn' ? 'warning' : 'note';
  }
}
