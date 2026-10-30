import { Component, input, signal } from '@angular/core';
import { Button } from 'primeng/button';
import { Tooltip } from 'primeng/tooltip';

/** Copies a value to the clipboard and confirms it in place. */
@Component({
  selector: 'app-copy-button',
  imports: [Button, Tooltip],
  template: `
    <p-button
      [icon]="copied() ? 'pi pi-check' : 'pi pi-copy'"
      [text]="true"
      [rounded]="true"
      size="small"
      severity="secondary"
      [pTooltip]="copied() ? 'Copied' : label()"
      tooltipPosition="top"
      [ariaLabel]="label()"
      (onClick)="copy()"
    />
    <span class="sr-only" aria-live="polite">{{ copied() ? 'Copied to the clipboard' : '' }}</span>
  `,
})
export class CopyButton {
  readonly value = input.required<string>();
  readonly label = input('Copy');
  protected readonly copied = signal(false);

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.value());
    } catch {
      // Older browsers or blocked clipboard: fall back to a hidden textarea.
      const area = document.createElement('textarea');
      area.value = this.value();
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1600);
  }
}
