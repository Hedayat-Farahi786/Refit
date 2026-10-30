import { Component, ElementRef, computed, effect, input, model, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PageRunState, Viewport } from '@refit/shared';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';

type Mode = 'slider' | 'side';

/**
 * Before/after comparison on a blueprint grid: a draggable divider (also a keyboard slider) or
 * the two screenshots side by side, for desktop and mobile.
 */
@Component({
  selector: 'app-compare-stage',
  imports: [FormsModule, Select, SelectButton],
  template: `
    <div class="toolbar">
      <p-select
        [options]="pagesWithShots()"
        optionLabel="name"
        optionValue="pageId"
        [ngModel]="selectedId()"
        (ngModelChange)="selectedId.set($event)"
        ariaLabel="Page to compare"
        class="page-select"
      />
      <p-selectbutton [options]="viewports" optionLabel="label" optionValue="value" [ngModel]="viewport()" (ngModelChange)="viewport.set($event)" [allowEmpty]="false" size="small" ariaLabel="Screen size" />
      <span class="spacer"></span>
      <p-selectbutton [options]="modes" optionLabel="label" optionValue="value" [ngModel]="mode()" (ngModelChange)="mode.set($event)" [allowEmpty]="false" size="small" ariaLabel="Comparison mode" />
    </div>

    <div class="stage blueprint" [class.mobile]="viewport() === 'mobile'">
      @if (!before() && !after()) {
        <p class="empty muted">No screenshots for this page yet.</p>
      } @else if (mode() === 'slider') {
        <div
          #frame
          class="frame"
          (pointerdown)="startDrag($event)"
          (pointermove)="drag($event)"
          (pointerup)="endDrag($event)"
          (pointercancel)="endDrag($event)"
        >
          @if (after(); as src) {
            <img class="shot" [src]="src" [alt]="'After: ' + (selected()?.name ?? '')" draggable="false" />
          } @else {
            <div class="shot placeholder">No after screenshot yet</div>
          }
          @if (before(); as src) {
            <img class="shot before" [src]="src" [alt]="'Before: ' + (selected()?.name ?? '')" draggable="false" [style.clip-path]="clip()" />
          }
          <span class="tag tag-before" aria-hidden="true">Before</span>
          <span class="tag tag-after" aria-hidden="true">After</span>
          <div class="divider" [style.left.%]="position()">
            <div
              class="handle"
              role="slider"
              tabindex="0"
              aria-label="Move the divider between before and after"
              aria-valuemin="0"
              aria-valuemax="100"
              [attr.aria-valuenow]="position()"
              [attr.aria-valuetext]="position() + '% before'"
              (keydown)="onKey($event)"
            >
              <i class="pi pi-arrows-h" aria-hidden="true"></i>
            </div>
          </div>
        </div>
      } @else {
        <div class="side">
          <figure>
            <figcaption class="section-title">Before</figcaption>
            @if (before(); as src) {
              <img class="shot" [src]="src" [alt]="'Before: ' + (selected()?.name ?? '')" />
            } @else {
              <div class="shot placeholder">No before screenshot</div>
            }
          </figure>
          <figure>
            <figcaption class="section-title">After</figcaption>
            @if (after(); as src) {
              <img class="shot" [src]="src" [alt]="'After: ' + (selected()?.name ?? '')" />
            } @else {
              <div class="shot placeholder">No after screenshot yet</div>
            }
          </figure>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      padding: 12px 16px;
      border-bottom: 1px solid var(--refit-border);
    }
    .page-select {
      min-width: 200px;
    }
    .stage {
      padding: 24px;
      max-height: 78vh;
      overflow: auto;
      border-radius: 0 0 var(--refit-radius-xl) var(--refit-radius-xl);
    }
    .frame {
      position: relative;
      display: grid;
      margin: 0 auto;
      max-width: 1180px;
      cursor: ew-resize;
      touch-action: pan-y;
      user-select: none;
      border-radius: var(--refit-radius-lg);
      box-shadow: var(--refit-shadow-float);
      overflow: hidden;
      background: var(--refit-panel);
    }
    .mobile .frame,
    .mobile .side figure {
      max-width: 390px;
    }
    .shot {
      grid-area: 1 / 1;
      width: 100%;
      display: block;
    }
    .before {
      z-index: 1;
    }
    .placeholder {
      display: grid;
      place-items: center;
      min-height: 320px;
      color: var(--refit-muted);
      background: var(--refit-subtle);
    }
    .tag {
      position: absolute;
      top: 12px;
      z-index: 3;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: color-mix(in srgb, var(--p-surface-950) 72%, transparent);
      color: white;
    }
    .tag-before {
      left: 12px;
    }
    .tag-after {
      right: 12px;
    }
    .divider {
      position: absolute;
      top: 0;
      bottom: 0;
      z-index: 2;
      width: 2px;
      margin-left: -1px;
      background: var(--p-primary-color);
      box-shadow: 0 0 0 1px rgb(255 255 255 / 0.6);
    }
    .handle {
      position: sticky;
      top: 35%;
      margin-top: 120px;
      width: 36px;
      height: 36px;
      margin-left: -17px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--p-primary-color);
      color: var(--p-primary-contrast-color);
      box-shadow: var(--refit-shadow-float);
      cursor: ew-resize;
    }
    .handle:focus-visible {
      outline: 3px solid var(--p-primary-200);
      outline-offset: 2px;
    }
    .side {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      align-items: start;
    }
    .mobile .side {
      grid-template-columns: repeat(2, minmax(0, 390px));
      justify-content: center;
    }
    figure {
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    figure .shot {
      border-radius: var(--refit-radius-lg);
      box-shadow: var(--refit-shadow-float);
    }
    .empty {
      text-align: center;
      padding: 48px 0;
    }
    @media (max-width: 720px) {
      .side {
        grid-template-columns: 1fr;
      }
      .stage {
        padding: 12px;
      }
    }
  `,
})
export class CompareStage {
  readonly pages = input.required<PageRunState[]>();
  /** The page to show; two-way so page cards can pick one. */
  readonly selectedId = model<string | null>(null);

  protected readonly viewports = [
    { label: 'Desktop', value: 'desktop' as Viewport },
    { label: 'Mobile', value: 'mobile' as Viewport },
  ];
  protected readonly modes = [
    { label: 'Slider', value: 'slider' as Mode },
    { label: 'Side by side', value: 'side' as Mode },
  ];
  protected readonly viewport = signal<Viewport>('desktop');
  protected readonly mode = signal<Mode>('slider');
  protected readonly position = signal(50);
  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  private dragging = false;

  protected readonly pagesWithShots = computed(() => this.pages().filter((page) => page.shots.before.desktop || page.shots.after.desktop));
  protected readonly selected = computed<PageRunState | null>(() => this.pages().find((page) => page.pageId === this.selectedId()) ?? this.pagesWithShots()[0] ?? null);
  protected readonly before = computed(() => this.selected()?.shots.before[this.viewport()] ?? null);
  protected readonly after = computed(() => this.selected()?.shots.after[this.viewport()] ?? null);
  /** The before image shows left of the divider. */
  protected readonly clip = computed(() => `inset(0 ${100 - this.position()}% 0 0)`);

  constructor() {
    effect(() => {
      if (!this.selectedId() && this.pagesWithShots()[0]) this.selectedId.set(this.pagesWithShots()[0]!.pageId);
    });
  }

  protected onKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 10 : 2;
    const moves: Record<string, () => number> = {
      ArrowLeft: () => this.position() - step,
      ArrowDown: () => this.position() - step,
      ArrowRight: () => this.position() + step,
      ArrowUp: () => this.position() + step,
      PageDown: () => this.position() - 10,
      PageUp: () => this.position() + 10,
      Home: () => 0,
      End: () => 100,
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    this.position.set(clamp(move()));
  }

  protected startDrag(event: PointerEvent): void {
    this.dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.moveTo(event.clientX);
  }

  protected drag(event: PointerEvent): void {
    if (this.dragging) this.moveTo(event.clientX);
  }

  protected endDrag(event: PointerEvent): void {
    this.dragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  private moveTo(clientX: number): void {
    const frame = this.frame()?.nativeElement;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    this.position.set(clamp(Math.round(((clientX - rect.left) / rect.width) * 100)));
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
