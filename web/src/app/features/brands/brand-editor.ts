import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Brand, BrandIssue, BrandStatusColors, SurfaceFamily } from '@refit/shared';
import {
  brandContrast,
  contrastRatio,
  generatePalette,
  isHexColor,
  normalizeBrand,
  normalizeHex,
  primaryLooksLikeDanger,
  SHADES,
  SURFACE_FAMILIES,
  SURFACE_PALETTES,
  SUPPORTED_PRIMENG_MAJORS,
  validateBrand,
} from '@refit/shared';
import { ConfirmationService, type MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { Menu } from 'primeng/menu';
import { Select } from 'primeng/select';
import { SelectButton } from 'primeng/selectbutton';
import { Slider } from 'primeng/slider';
import { Textarea } from 'primeng/textarea';
import { Api } from '../../core/api';
import { AppState } from '../../core/app-state';
import { Notify } from '../../core/notify';
import { CopyButton } from '../../ui/copy-button';
import { EmptyState } from '../../ui/empty-state';
import { brandFiles, downloadText, type BrandFileKind } from './brand-files';
import { PREVIEW_BRAND, PREVIEW_READY } from './brand-preview';

type Tab = 'preview' | 'palette' | 'code';

const SURFACE_LABELS: Record<SurfaceFamily, string> = {
  slate: 'Slate (cool blue-grey)',
  zinc: 'Zinc (cool grey)',
  neutral: 'Neutral (pure grey)',
  stone: 'Stone (warm grey)',
};

const STATUS_FIELDS: Array<{ key: keyof BrandStatusColors; label: string; hint: string }> = [
  { key: 'success', label: 'Success', hint: 'Saved, approved, done' },
  { key: 'info', label: 'Info', hint: 'Neutral notices and new items' },
  { key: 'warn', label: 'Warning', hint: 'Needs attention soon' },
  { key: 'danger', label: 'Danger', hint: 'Errors and destructive actions' },
];

const FONT_SUGGESTIONS = [
  "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  "Inter, 'Segoe UI', Arial, sans-serif",
  "'Helvetica Neue', Helvetica, Arial, sans-serif",
  "Roboto, 'Segoe UI', Arial, sans-serif",
  "'IBM Plex Sans', 'Segoe UI', Arial, sans-serif",
  "Georgia, 'Times New Roman', serif",
];

@Component({
  selector: 'app-brand-editor',
  imports: [FormsModule, RouterLink, Button, InputText, Menu, Select, SelectButton, Slider, Textarea, CopyButton, EmptyState],
  template: `
    @if (draft(); as brand) {
      <div class="editor">
        <header class="head">
          <a routerLink="/brands" class="back small"><i class="pi pi-arrow-left" aria-hidden="true"></i>Brands</a>
          <div class="title-row">
            <h1 class="display truncate">{{ brand.name || 'Untitled brand' }}</h1>
            <span class="pill" [class.ok]="brand.status === 'approved'" [class.warn]="brand.status === 'draft'">{{ brand.status === 'approved' ? 'Approved' : 'Draft' }}</span>
            @if (isDefault()) {
              <span class="pill info">Default for new runs</span>
            }
            <span class="spacer"></span>
            <p-button label="Export" icon="pi pi-download" severity="secondary" [outlined]="true" (onClick)="exportMenu.toggle($event)" />
            <p-button icon="pi pi-ellipsis-h" severity="secondary" [text]="true" ariaLabel="More actions" (onClick)="moreMenu.toggle($event)" />
          </div>
        </header>

        @if (brand.status === 'draft') {
          <div class="draft-banner" role="note">
            <i class="pi pi-info-circle" aria-hidden="true"></i>
            <span><strong>Draft.</strong> Replace the values with the official ones from Corporate Communications, then mark the brand approved.</span>
          </div>
        }

        <div class="split">
          <form class="form" (ngSubmit)="save()" aria-label="Brand settings">
            <section class="group" aria-labelledby="g-identity">
              <h2 id="g-identity" class="section-title">Identity</h2>
              <div class="field">
                <label for="b-name">Name</label>
                <input pInputText id="b-name" name="name" [(ngModel)]="brand.name" (ngModelChange)="touch()" [invalid]="!!issue('name')" />
                @if (issue('name'); as message) {
                  <span class="field-error">{{ message }}</span>
                }
              </div>
              <div class="field">
                <span class="field-label" id="b-status">Status</span>
                <p-selectbutton name="status" [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="brand.status" (ngModelChange)="touch()" [allowEmpty]="false" ariaLabelledBy="b-status" />
              </div>
              <div class="field">
                <label for="b-note">Note</label>
                <textarea pTextarea id="b-note" name="note" rows="3" [(ngModel)]="brand.note" (ngModelChange)="touch()" placeholder="Where the values come from, who approved them"></textarea>
              </div>
            </section>

            <section class="group" aria-labelledby="g-color">
              <h2 id="g-color" class="section-title">Brand color</h2>
              <div class="color-row">
                <label class="swatch-input" [style.background]="safe(brand.primary)">
                  <span class="sr-only">Pick the brand color</span>
                  <input type="color" name="primaryPicker" [ngModel]="safe(brand.primary)" (ngModelChange)="brand.primary = $event; touch()" />
                </label>
                <div class="field grow">
                  <label for="b-primary">Hex</label>
                  <input pInputText id="b-primary" name="primary" class="mono" [(ngModel)]="brand.primary" (ngModelChange)="touch()" [invalid]="!!issue('primary')" />
                </div>
              </div>
              @if (issue('primary'); as message) {
                <span class="field-error">{{ message }}</span>
              } @else {
                <div class="scale" aria-hidden="true">
                  @for (color of primaryScale(); track $index) {
                    <span [style.background]="color"></span>
                  }
                </div>
                <p class="check small" [class.bad]="!contrast().meetsAA">
                  <i class="pi" [class]="contrast().meetsAA ? 'pi-check-circle' : 'pi-exclamation-triangle'" aria-hidden="true"></i>
                  {{ contrast().onPrimary === 'white' ? 'White' : 'Dark' }} text on buttons: {{ contrast().ratio.toFixed(1) }}:1
                  {{ contrast().meetsAA ? '(meets WCAG AA)' : '(below 4.5:1, pick a deeper color)' }}
                </p>
                @if (redBrand()) {
                  <p class="hint small"><i class="pi pi-info-circle" aria-hidden="true"></i> A red brand: inputs get a dark focus border and danger actions are outlined with an icon, so errors never look like brand actions.</p>
                }
              }
            </section>

            <section class="group" aria-labelledby="g-neutral">
              <h2 id="g-neutral" class="section-title">Neutrals</h2>
              <div class="surfaces" role="radiogroup" aria-labelledby="g-neutral">
                @for (family of surfaces; track family) {
                  <label class="surface" [class.selected]="brand.surface === family">
                    <input type="radio" name="surface" [value]="family" [(ngModel)]="brand.surface" (ngModelChange)="touch()" class="sr-only" />
                    <span class="mini" aria-hidden="true">
                      @for (shade of miniShades; track shade) {
                        <span [style.background]="surfaceShade(family, shade)"></span>
                      }
                    </span>
                    <span class="small">{{ surfaceLabel(family) }}</span>
                  </label>
                }
              </div>
            </section>

            <section class="group" aria-labelledby="g-status">
              <h2 id="g-status" class="section-title">Status colors</h2>
              @for (status of statusFields; track status.key) {
                <div class="status-row">
                  <label class="swatch-input small-swatch" [style.background]="safe(brand.colors[status.key])">
                    <span class="sr-only">Pick the {{ status.label }} color</span>
                    <input type="color" [name]="'pick-' + status.key" [ngModel]="safe(brand.colors[status.key])" (ngModelChange)="brand.colors[status.key] = $event; touch()" />
                  </label>
                  <div class="field grow">
                    <label [for]="'b-' + status.key">{{ status.label }} <span class="muted">· {{ status.hint }}</span></label>
                    <input pInputText [id]="'b-' + status.key" [name]="status.key" class="mono" [(ngModel)]="brand.colors[status.key]" (ngModelChange)="touch()" [invalid]="!!issue('colors.' + status.key)" />
                    @if (issue('colors.' + status.key); as message) {
                      <span class="field-error">{{ message }}</span>
                    } @else {
                      <span class="field-hint">{{ ratioOnWhite(brand.colors[status.key]) }}</span>
                    }
                  </div>
                </div>
              }
            </section>

            <section class="group" aria-labelledby="g-type">
              <h2 id="g-type" class="section-title">Type</h2>
              <div class="field">
                <label for="b-font">Body font</label>
                <input pInputText id="b-font" name="fontFamily" class="mono" list="font-suggestions" [(ngModel)]="brand.fontFamily" (ngModelChange)="touch()" [invalid]="!!issue('fontFamily')" />
                @if (issue('fontFamily'); as message) {
                  <span class="field-error">{{ message }}</span>
                } @else {
                  <span class="field-hint" [style.font-family]="brand.fontFamily">The quick brown fox jumps over the lazy dog</span>
                }
              </div>
              <div class="field">
                <label for="b-heading">Heading font</label>
                <input pInputText id="b-heading" name="headingFontFamily" class="mono" list="font-suggestions" [(ngModel)]="brand.headingFontFamily" (ngModelChange)="touch()" placeholder="Same as the body font" />
              </div>
              <div class="field">
                <label for="b-import">Font stylesheet URL</label>
                <input pInputText id="b-import" name="fontImport" class="mono" [(ngModel)]="brand.fontImport" (ngModelChange)="touch()" placeholder="https://… (optional)" [invalid]="!!issue('fontImport')" />
                @if (issue('fontImport'); as message) {
                  <span class="field-error">{{ message }}</span>
                } @else {
                  <span class="field-hint">Only when the font is not installed on users' computers.</span>
                }
              </div>
              <datalist id="font-suggestions">
                @for (font of fonts; track font) {
                  <option [value]="font"></option>
                }
              </datalist>
            </section>

            <section class="group" aria-labelledby="g-shape">
              <h2 id="g-shape" class="section-title">Shape and density</h2>
              <div class="field">
                <span class="field-label" id="b-radius">Corner radius <span class="muted">· {{ brand.radius }} px</span></span>
                <p-slider name="radius" [(ngModel)]="brand.radius" (ngModelChange)="touch()" [min]="0" [max]="16" ariaLabelledBy="b-radius" />
                <div class="corners" aria-hidden="true">
                  <span [style.border-radius.px]="brand.radius">Button</span>
                  <span class="card-corner" [style.border-radius.px]="cardRadius(brand.radius)">Card</span>
                </div>
              </div>
              <div class="field">
                <span class="field-label" id="b-density">Density</span>
                <p-selectbutton name="density" [options]="densityOptions" optionLabel="label" optionValue="value" [(ngModel)]="brand.density" (ngModelChange)="touch()" [allowEmpty]="false" ariaLabelledBy="b-density" />
                <span class="field-hint">Compact fits more rows on data-heavy screens.</span>
              </div>
            </section>

            @if (dirty()) {
              <div class="save" role="region" aria-label="Unsaved brand changes">
                <span class="soft small">{{ issues().length ? 'Fix the highlighted fields to save.' : 'Unsaved changes' }}</span>
                <span class="spacer"></span>
                <p-button label="Discard" severity="secondary" [text]="true" (onClick)="discard()" />
                <p-button label="Save brand" icon="pi pi-check" type="submit" [disabled]="issues().length > 0" [loading]="saving()" />
              </div>
            }
          </form>

          <section class="stage" aria-label="Brand preview and code">
            <div class="stage-bar">
              <p-selectbutton [options]="tabs" optionLabel="label" optionValue="value" [ngModel]="tab()" (ngModelChange)="tab.set($event)" [allowEmpty]="false" aria-label="Show" />
              <span class="spacer"></span>
              @if (tab() === 'preview') {
                <p-selectbutton [options]="devices" optionLabel="label" optionValue="value" [ngModel]="device()" (ngModelChange)="device.set($event)" [allowEmpty]="false" aria-label="Preview width" size="small" />
              } @else if (tab() === 'code') {
                <p-select ariaLabel="PrimeNG version" [options]="primengOptions" optionLabel="label" optionValue="value" [ngModel]="primeng()" (ngModelChange)="primeng.set($event)" size="small" />
              }
            </div>

            @switch (tab()) {
              @case ('preview') {
                <div class="frame-wrap" [class.mobile]="device() === 'mobile'">
                  <iframe #frame src="/preview/brand" title="Preview of real PrimeNG components with this brand" (load)="sendToPreview()"></iframe>
                </div>
              }
              @case ('palette') {
                <div class="palette">
                  <h3 class="section-title">Brand scale</h3>
                  <ul class="tiles" role="list">
                    @for (tile of primaryTiles(); track tile.shade) {
                      <li class="tile" [style.background]="tile.hex" [style.color]="tile.text">
                        <span class="tile-shade">{{ tile.shade }}</span>
                        <span class="tile-hex mono">{{ tile.hex }}</span>
                        <span class="tile-ratio">{{ tile.ratio }}</span>
                      </li>
                    }
                  </ul>
                  <h3 class="section-title">Neutrals</h3>
                  <ul class="tiles" role="list">
                    @for (tile of surfaceTiles(); track tile.shade) {
                      <li class="tile" [style.background]="tile.hex" [style.color]="tile.text">
                        <span class="tile-shade">{{ tile.shade }}</span>
                        <span class="tile-hex mono">{{ tile.hex }}</span>
                        <span class="tile-ratio">{{ tile.ratio }}</span>
                      </li>
                    }
                  </ul>
                  <h3 class="section-title">Status</h3>
                  <ul class="status-tiles" role="list">
                    @for (status of statusTiles(); track status.label) {
                      <li>
                        <span class="soft-chip" [style.background]="status.soft" [style.border-color]="status.border" [style.color]="status.base">{{ status.label }}</span>
                        <span class="solid-chip" [style.background]="status.base">{{ status.label }}</span>
                        <span class="mono tiny muted">{{ status.base }}</span>
                      </li>
                    }
                  </ul>
                </div>
              }
              @case ('code') {
                <div class="code">
                  <div class="file-tabs" role="tablist" aria-label="Generated files">
                    @for (file of files(); track file.kind) {
                      <button type="button" role="tab" [attr.aria-selected]="file.kind === fileKind()" [class.active]="file.kind === fileKind()" (click)="fileKind.set(file.kind)">
                        {{ file.name }}
                      </button>
                    }
                  </div>
                  @if (currentFile(); as file) {
                    <div class="file-bar">
                      <span class="muted small">{{ file.label }}</span>
                      <span class="spacer"></span>
                      <app-copy-button [value]="file.content" [label]="'Copy ' + file.name" />
                      <p-button icon="pi pi-download" [text]="true" severity="secondary" size="small" [ariaLabel]="'Download ' + file.name" (onClick)="download(file.name, file.content)" />
                    </div>
                    <pre class="source" tabindex="0" [attr.aria-label]="file.name"><code>{{ file.content }}</code></pre>
                  }
                </div>
              }
            }
          </section>
        </div>
      </div>
      <p-menu #exportMenu [model]="exportItems()" [popup]="true" appendTo="body" />
      <p-menu #moreMenu [model]="moreItems()" [popup]="true" appendTo="body" />
    } @else if (state.loaded()) {
      <div class="page">
        <app-empty-state icon="pi-palette" title="This brand does not exist" text="It may have been deleted in another window.">
          <p-button label="Back to brands" severity="secondary" [outlined]="true" (onClick)="router.navigate(['/brands'])" />
        </app-empty-state>
      </div>
    }
  `,
  styles: `
    .editor {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }
    .head {
      padding: 24px 40px 18px;
      border-bottom: 1px solid var(--refit-border);
    }
    .back {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--refit-muted);
      text-decoration: none;
      margin-bottom: 8px;
    }
    .back:hover {
      color: var(--refit-text);
    }
    .back .pi {
      font-size: 0.75rem;
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .draft-banner {
      display: flex;
      gap: 10px;
      align-items: baseline;
      padding: 10px 40px;
      background: var(--refit-warn-soft);
      color: var(--refit-text);
      font-size: 0.875rem;
      border-bottom: 1px solid var(--refit-border);
    }
    .draft-banner .pi {
      color: var(--refit-warn);
    }
    .split {
      flex: 1;
      display: grid;
      grid-template-columns: 400px minmax(0, 1fr);
      min-height: 0;
    }
    .form {
      border-right: 1px solid var(--refit-border);
      padding: 8px 0 0;
      display: flex;
      flex-direction: column;
    }
    .group {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 20px 28px 24px;
      border-bottom: 1px solid var(--refit-border);
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    input[pInputText],
    textarea {
      width: 100%;
    }
    .color-row,
    .status-row {
      display: flex;
      gap: 12px;
      align-items: flex-end;
    }
    .status-row {
      align-items: flex-start;
    }
    .swatch-input {
      position: relative;
      flex: 0 0 44px;
      height: 44px;
      border-radius: var(--refit-radius);
      border: 1px solid color-mix(in srgb, var(--refit-text) 15%, transparent);
      cursor: pointer;
      box-shadow: inset 0 0 0 2px rgb(255 255 255 / 0.4);
    }
    .small-swatch {
      flex-basis: 36px;
      height: 36px;
      margin-top: 26px;
    }
    .swatch-input:focus-within {
      outline: 2px solid var(--refit-accent);
      outline-offset: 2px;
    }
    .swatch-input input {
      position: absolute;
      inset: 0;
      opacity: 0;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
    .scale {
      display: grid;
      grid-template-columns: repeat(11, 1fr);
      height: 22px;
      border-radius: 6px;
      overflow: hidden;
    }
    .check,
    .hint {
      display: flex;
      gap: 8px;
      align-items: baseline;
      color: var(--refit-text-soft);
    }
    .check .pi {
      color: var(--refit-success);
    }
    .check.bad .pi {
      color: var(--refit-warn);
    }
    .hint .pi {
      color: var(--refit-muted);
    }
    .surfaces {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .surface {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 10px;
      border: 1px solid var(--refit-border);
      border-radius: var(--refit-radius-lg);
      cursor: pointer;
      background: var(--refit-panel);
    }
    .surface:has(input:focus-visible) {
      outline: 2px solid var(--refit-accent);
      outline-offset: 2px;
    }
    .surface.selected {
      border-color: var(--refit-text);
      box-shadow: inset 0 0 0 1px var(--refit-text);
    }
    .mini {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      height: 16px;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid var(--refit-border);
    }
    .corners {
      display: flex;
      gap: 12px;
      margin-top: 6px;
    }
    .corners span {
      padding: 6px 14px;
      border: 1px solid var(--refit-border-strong);
      font-size: 0.8rem;
      background: var(--refit-panel);
    }
    .corners .card-corner {
      padding: 14px 22px;
    }
    .save {
      position: sticky;
      bottom: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px 12px 28px;
      margin-top: auto;
      background: color-mix(in srgb, var(--refit-panel) 92%, transparent);
      backdrop-filter: blur(8px);
      border-top: 1px solid var(--refit-border);
    }
    .stage {
      display: flex;
      flex-direction: column;
      min-width: 0;
      background: var(--refit-subtle);
    }
    .stage-bar {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      background: var(--refit-subtle);
      border-bottom: 1px solid var(--refit-border);
    }
    .frame-wrap {
      position: sticky;
      top: 61px;
      height: calc(100vh - 61px);
      padding: 16px;
      display: flex;
      justify-content: center;
    }
    .frame-wrap iframe {
      width: 100%;
      height: 100%;
      border: 1px solid var(--refit-border);
      border-radius: var(--refit-radius-lg);
      background: #fff;
      box-shadow: var(--refit-shadow-float);
    }
    .frame-wrap.mobile iframe {
      width: 390px;
      max-width: 100%;
    }
    .palette {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
      gap: 8px;
      margin-bottom: 12px;
    }
    .tile {
      display: flex;
      flex-direction: column;
      gap: 2px;
      height: 92px;
      padding: 10px;
      border-radius: var(--refit-radius);
      border: 1px solid rgb(0 0 0 / 0.06);
      font-size: 0.75rem;
    }
    .tile-shade {
      font-weight: 600;
    }
    .tile-ratio {
      margin-top: auto;
      opacity: 0.85;
    }
    .status-tiles {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .status-tiles li {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .soft-chip,
    .solid-chip {
      min-width: 96px;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      text-align: center;
      border: 1px solid transparent;
    }
    .solid-chip {
      color: #fff;
    }
    .code {
      padding: 16px 20px 24px;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .file-tabs {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .file-tabs button {
      padding: 6px 12px;
      border: 1px solid transparent;
      border-radius: var(--refit-radius);
      background: transparent;
      color: var(--refit-text-soft);
      font-family: var(--refit-mono);
      font-size: 0.8rem;
      cursor: pointer;
    }
    .file-tabs button:hover {
      background: var(--refit-hover);
    }
    .file-tabs button.active {
      background: var(--refit-panel);
      border-color: var(--refit-border);
      color: var(--refit-text);
    }
    .file-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: 12px 0 6px;
    }
    .source {
      margin: 0;
      padding: 16px 18px;
      max-height: calc(100vh - 220px);
      overflow: auto;
      border: 1px solid var(--refit-border);
      border-radius: var(--refit-radius-lg);
      background: var(--refit-panel);
      font-family: var(--refit-mono);
      font-size: 0.8rem;
      line-height: 1.6;
      tab-size: 2;
    }
    @media (max-width: 1100px) {
      .split {
        grid-template-columns: minmax(0, 1fr);
      }
      .form {
        border-right: 0;
      }
      .frame-wrap {
        position: static;
        height: 720px;
      }
    }
    @media (max-width: 640px) {
      .head {
        padding: 20px 16px 14px;
      }
      .draft-banner {
        padding: 10px 16px;
      }
      .group {
        padding: 18px 16px 20px;
      }
    }
  `,
})
export class BrandEditor {
  readonly brandId = input.required<string>();
  protected readonly state = inject(AppState);
  protected readonly router = inject(Router);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(ConfirmationService);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');

  protected readonly draft = signal<Brand | null>(null);
  /** Bumped on every edit: the brand object is mutated in place by the form. */
  private readonly version = signal(0);
  private savedJson = '';
  protected readonly saving = signal(false);
  protected readonly tab = signal<Tab>('preview');
  protected readonly device = signal<'desktop' | 'mobile'>('desktop');
  protected readonly primeng = signal(21);
  protected readonly fileKind = signal<BrandFileKind>('preset');

  protected readonly statusOptions = [
    { label: 'Draft', value: 'draft' },
    { label: 'Approved', value: 'approved' },
  ];
  protected readonly densityOptions = [
    { label: 'Comfortable', value: 'comfortable' },
    { label: 'Compact', value: 'compact' },
  ];
  protected readonly tabs = [
    { label: 'Preview', value: 'preview' },
    { label: 'Palette', value: 'palette' },
    { label: 'Code', value: 'code' },
  ];
  protected readonly devices = [
    { label: 'Desktop', value: 'desktop' },
    { label: 'Phone', value: 'mobile' },
  ];
  protected readonly primengOptions = [...SUPPORTED_PRIMENG_MAJORS].reverse().map((major) => ({ label: `PrimeNG ${major}`, value: major }));
  protected readonly surfaces = SURFACE_FAMILIES;
  protected readonly miniShades = ['50', '200', '400', '600', '800'] as const;
  protected readonly statusFields = STATUS_FIELDS;
  protected readonly fonts = FONT_SUGGESTIONS;

  /** The brand as it is right now, valid or not, for everything derived from the form. */
  private readonly current = computed(() => {
    this.version();
    const brand = this.draft();
    return brand ? normalizeBrand(structuredClone(brand)) : null;
  });
  protected readonly issues = computed<BrandIssue[]>(() => {
    const brand = this.current();
    return brand ? validateBrand(brand) : [];
  });
  protected readonly dirty = computed(() => {
    this.version();
    return this.current() !== null && JSON.stringify(this.current()) !== this.savedJson;
  });
  /** The last valid version: previews and generated files never break while someone is typing. */
  private readonly valid = signal<Brand | null>(null);
  protected readonly isDefault = computed(() => this.state.defaultBrand()?.id === this.brandId());
  protected readonly contrast = computed(() => brandContrast(this.valid() ?? normalizeBrand({ id: 'x' })));
  protected readonly redBrand = computed(() => (this.valid() ? primaryLooksLikeDanger(this.valid()!) : false));
  protected readonly primaryScale = computed(() => {
    const palette = generatePalette(this.valid()?.primary ?? '#888888');
    return SHADES.map((shade) => palette[shade]);
  });
  protected readonly primaryTiles = computed(() => tiles(generatePalette(this.valid()?.primary ?? '#888888')));
  protected readonly surfaceTiles = computed(() => tiles({ '0': '#ffffff', ...SURFACE_PALETTES[this.valid()?.surface ?? 'slate'] }));
  protected readonly statusTiles = computed(() =>
    STATUS_FIELDS.map((field) => {
      const palette = generatePalette(this.valid()?.colors[field.key] ?? '#888888');
      return { label: field.label, base: palette['500'], soft: palette['50'], border: palette['200'] };
    }),
  );
  protected readonly files = computed(() => (this.valid() ? brandFiles(this.valid()!, this.primeng()) : []));
  protected readonly currentFile = computed(() => this.files().find((file) => file.kind === this.fileKind()) ?? null);

  protected readonly exportItems = computed<MenuItem[]>(() => [
    ...this.files().map((file) => ({ label: file.name, icon: file.kind === 'json' ? 'pi pi-box' : 'pi pi-file', command: () => this.download(file.name, file.content) })),
  ]);
  protected readonly moreItems = computed<MenuItem[]>(() => [
    { label: 'Use for new runs', icon: 'pi pi-star', disabled: this.isDefault(), command: () => void this.makeDefault() },
    { label: 'Duplicate', icon: 'pi pi-copy', command: () => void this.duplicate() },
    { separator: true },
    { label: 'Delete brand', icon: 'pi pi-trash', disabled: this.state.brands().length < 2, command: () => this.remove() },
  ]);

  constructor() {
    // Load the brand when the route or the saved brands change, unless there are unsaved edits.
    effect(() => {
      const id = this.brandId();
      const saved = this.state.brands().find((brand) => brand.id === id) ?? null;
      untracked(() => {
        if (this.draft()?.id === id && this.dirty()) return;
        this.load(saved);
      });
    });
    // Keep the last valid brand for the preview and the code view.
    effect(() => {
      const brand = this.current();
      if (brand && this.issues().length === 0) this.valid.set(brand);
    });
    // Send changes to the preview, a little after the last keystroke.
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      this.valid();
      this.tab();
      clearTimeout(timer);
      timer = setTimeout(() => this.sendToPreview(), 120);
    });
    const onMessage = (event: MessageEvent) => {
      if (event.origin === window.location.origin && (event.data as { type?: string } | null)?.type === PREVIEW_READY) this.sendToPreview();
    };
    window.addEventListener('message', onMessage);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    });
  }

  private load(brand: Brand | null): void {
    const copy = brand ? normalizeBrand(structuredClone(brand)) : null;
    this.draft.set(copy);
    this.savedJson = copy ? JSON.stringify(copy) : '';
    this.valid.set(copy);
    this.version.update((v) => v + 1);
  }

  protected touch(): void {
    this.version.update((v) => v + 1);
  }

  protected sendToPreview(): void {
    const brand = this.valid();
    const target = this.frame()?.nativeElement.contentWindow;
    if (brand && target) target.postMessage({ type: PREVIEW_BRAND, brand }, window.location.origin);
  }

  protected issue(field: string): string | null {
    return this.issues().find((issue) => issue.field === field)?.message ?? null;
  }

  /** A 6-digit hex for the native color picker, which accepts nothing else. */
  protected safe(hex: string): string {
    return isHexColor(hex) ? normalizeHex(hex) : '#888888';
  }

  protected surfaceShade(family: SurfaceFamily, shade: (typeof this.miniShades)[number]): string {
    return SURFACE_PALETTES[family][shade];
  }

  protected surfaceLabel(family: SurfaceFamily): string {
    return SURFACE_LABELS[family];
  }

  protected cardRadius(radius: number): number {
    return Math.round((radius * 4) / 3);
  }

  protected ratioOnWhite(hex: string): string {
    if (!isHexColor(hex)) return '';
    const ratio = contrastRatio(normalizeHex(hex), '#ffffff');
    return `${ratio.toFixed(1)}:1 on white${ratio >= 4.5 ? '' : ' (below 4.5:1: too light for text)'}`;
  }

  protected download(name: string, content: string): void {
    downloadText(name, content);
  }

  protected discard(): void {
    this.load(this.state.brands().find((brand) => brand.id === this.brandId()) ?? null);
  }

  protected async save(): Promise<void> {
    const brand = this.current();
    if (!brand || this.issues().length > 0) return;
    this.saving.set(true);
    try {
      const saved = await this.api.saveBrand(brand);
      this.load(saved);
      this.notify.success('Brand saved', saved.name);
      this.state.refresh();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.saving.set(false);
    }
  }

  private async makeDefault(): Promise<void> {
    try {
      await this.api.saveSettings({ defaultBrandId: this.brandId() });
      this.notify.success('Default brand set', 'New runs use this brand.');
      this.state.refresh();
    } catch (error) {
      this.notify.error(error);
    }
  }

  private async duplicate(): Promise<void> {
    const brand = this.current();
    if (!brand) return;
    try {
      const { id: _id, updatedAt: _updatedAt, ...rest } = brand;
      const copy = await this.api.createBrand({ ...rest, name: `${brand.name} copy`, status: 'draft' });
      this.notify.success('Brand duplicated', copy.name);
      this.state.refresh();
      await this.router.navigate(['/brands', copy.id]);
    } catch (error) {
      this.notify.error(error);
    }
  }

  private remove(): void {
    const brand = this.current();
    if (!brand) return;
    this.confirm.confirm({
      header: `Delete ${brand.name}?`,
      message: 'Runs that used it keep their results. This cannot be undone.',
      icon: 'pi pi-trash',
      acceptLabel: 'Delete brand',
      rejectLabel: 'Keep it',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', text: true },
      accept: async () => {
        try {
          await this.api.deleteBrand(brand.id);
          this.notify.success('Brand deleted', brand.name);
          this.state.refresh();
          await this.router.navigate(['/brands']);
        } catch (error) {
          this.notify.error(error);
        }
      },
    });
  }
}

function tiles(palette: Record<string, string>): Array<{ shade: string; hex: string; text: string; ratio: string }> {
  return Object.entries(palette).map(([shade, hex]) => {
    const onWhite = contrastRatio(hex, '#ffffff');
    const onBlack = contrastRatio(hex, '#000000');
    const text = onWhite >= onBlack ? '#ffffff' : '#111111';
    return { shade, hex, text, ratio: `${Math.max(onWhite, onBlack).toFixed(1)}:1 ${text === '#ffffff' ? 'white' : 'dark'}` };
  });
}
