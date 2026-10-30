import { Component, computed, input } from '@angular/core';
import type { PageStatus, RunStatus } from '@refit/shared';

type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

const RUN: Record<RunStatus, { label: string; icon: string; tone: Tone }> = {
  running: { label: 'Running', icon: 'pi-spin pi-spinner', tone: 'info' },
  done: { label: 'Ready for review', icon: 'pi-check-circle', tone: 'success' },
  failed: { label: 'Stopped', icon: 'pi-times-circle', tone: 'danger' },
  cancelled: { label: 'Cancelled', icon: 'pi-ban', tone: 'neutral' },
  interrupted: { label: 'Interrupted', icon: 'pi-exclamation-circle', tone: 'warn' },
};

const PAGE: Record<PageStatus, { label: string; icon: string; tone: Tone }> = {
  queued: { label: 'Waiting', icon: 'pi-clock', tone: 'neutral' },
  working: { label: 'Working', icon: 'pi-spin pi-spinner', tone: 'info' },
  reviewing: { label: 'Design review', icon: 'pi-spin pi-spinner', tone: 'info' },
  done: { label: 'Done', icon: 'pi-check', tone: 'success' },
  flagged: { label: 'Flagged', icon: 'pi-flag', tone: 'warn' },
  skipped: { label: 'Skipped', icon: 'pi-minus-circle', tone: 'neutral' },
};

/** A status pill with an icon and a word, for runs and pages. */
@Component({
  selector: 'app-status-chip',
  template: `<span class="chip" [class]="spec().tone"><i class="pi" [class]="spec().icon" aria-hidden="true"></i>{{ spec().label }}</span>`,
  styles: `
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 2px 9px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1.6;
      white-space: nowrap;
    }
    .chip .pi {
      font-size: 0.72rem;
    }
    .neutral {
      color: var(--refit-text-soft);
      background: var(--refit-subtle);
    }
    .info {
      color: var(--refit-info);
      background: var(--refit-info-soft);
    }
    .success {
      color: var(--refit-success);
      background: var(--refit-success-soft);
    }
    .warn {
      color: var(--refit-warn);
      background: var(--refit-warn-soft);
    }
    .danger {
      color: var(--refit-danger);
      background: var(--refit-danger-soft);
    }
  `,
})
export class StatusChip {
  readonly run = input<RunStatus | null>(null);
  readonly page = input<PageStatus | null>(null);
  protected readonly spec = computed(() => {
    const page = this.page();
    if (page) return PAGE[page];
    return RUN[this.run() ?? 'running'];
  });
}
