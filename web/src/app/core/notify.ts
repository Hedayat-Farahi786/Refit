import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { toRequestError } from './api';

/** Toasts with consistent wording: success uses the same verb as the button that caused it. */
@Injectable({ providedIn: 'root' })
export class Notify {
  private readonly messages = inject(MessageService);

  success(summary: string, detail?: string): void {
    this.messages.add({ severity: 'success', summary, ...(detail ? { detail } : {}), life: 3500 });
  }

  info(summary: string, detail?: string): void {
    this.messages.add({ severity: 'info', summary, ...(detail ? { detail } : {}), life: 4500 });
  }

  /** Shows what went wrong and how to fix it. */
  error(error: unknown, summary?: string): void {
    const problem = toRequestError(error);
    this.messages.add({
      severity: 'error',
      summary: summary ?? problem.message,
      detail: summary ? `${problem.message}${problem.fix ? ` ${problem.fix}` : ''}` : problem.fix ?? '',
      life: 9000,
    });
  }
}
