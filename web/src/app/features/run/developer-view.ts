import { ScrollingModule, type CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { Component, DestroyRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ChangedFile, RunRecord } from '@refit/shared';
import { Button } from 'primeng/button';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { Tag } from 'primeng/tag';
import { Tooltip } from 'primeng/tooltip';
import { Api } from '../../core/api';
import { Notify } from '../../core/notify';
import { RunStream, type LogEntry, type LogKind } from '../../core/run-stream';
import { DiffViewer } from './diff-viewer';

type Filter = 'all' | 'agent' | 'commands' | 'guard' | 'warnings';

const FILTER_KINDS: Record<Filter, ReadonlySet<LogKind> | null> = {
  all: null,
  agent: new Set(['thought', 'tool']),
  commands: new Set(['command', 'output']),
  guard: new Set(['guard']),
  warnings: new Set(['warning', 'error', 'guard']),
};

const TOOL_ICONS: Record<string, string> = {
  Read: 'pi-eye',
  view: 'pi-eye',
  Edit: 'pi-pencil',
  edit: 'pi-pencil',
  Write: 'pi-file-edit',
  create: 'pi-file-edit',
  Bash: 'pi-angle-right',
  shell: 'pi-angle-right',
  Glob: 'pi-search',
  Grep: 'pi-search',
};

@Component({
  selector: 'app-developer-view',
  imports: [ScrollingModule, FormsModule, Button, IconField, InputIcon, InputText, SelectButton, Tag, Tooltip, DiffViewer],
  template: `
    <div class="layout">
      <section class="panel log-panel" aria-labelledby="log-title">
        <div class="toolbar">
          <h2 id="log-title" class="sr-only">Log</h2>
          <p-selectbutton [options]="filters" optionLabel="label" optionValue="value" [ngModel]="filter()" (ngModelChange)="filter.set($event)" [allowEmpty]="false" size="small" aria-label="Show" />
          <p-iconfield class="search">
            <p-inputicon class="pi pi-search" />
            <input pInputText pSize="small" type="search" placeholder="Search the log" aria-label="Search the log" [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </p-iconfield>
          <span class="spacer"></span>
          <span class="tiny muted nowrap">{{ visible().length }} lines</span>
          <p-button icon="pi pi-copy" [text]="true" severity="secondary" size="small" pTooltip="Copy the visible lines" ariaLabel="Copy the visible lines" (onClick)="copy()" />
        </div>
        <cdk-virtual-scroll-viewport #viewport [itemSize]="rowHeight" class="log" (scrolledIndexChange)="onScroll()" role="log" aria-live="off" aria-label="Run log" tabindex="0">
          <div *cdkVirtualFor="let entry of visible(); trackBy: trackSeq" class="row" [class]="entry.kind">
            <span class="time">{{ entry.ts.slice(11, 19) }}</span>
            <span class="badge" [attr.title]="entry.source">{{ badge(entry) }}</span>
            @if (entry.kind === 'tool') {
              <span class="text"><i class="pi" [class]="toolIcon(entry)" aria-hidden="true"></i> <strong>{{ entry.tool }}</strong> {{ entry.target }}</span>
            } @else {
              <span class="text">{{ entry.text }}@if (entry.exitCode !== undefined && entry.exitCode !== 0) { <span class="exit">exit {{ entry.exitCode }}</span>}</span>
            }
          </div>
        </cdk-virtual-scroll-viewport>
        @if (!following()) {
          <p-button class="jump" label="Jump to latest" icon="pi pi-arrow-down" size="small" [rounded]="true" (onClick)="jumpToEnd()" />
        }
      </section>

      <section class="panel files" aria-labelledby="files-title">
        <div class="panel-header">
          <h2 id="files-title">Changed files</h2>
          <span class="muted small">{{ changes().length }}</span>
        </div>
        @if (run().workspaceRemoved) {
          <p class="muted small pad">The workspace was removed, so the changes cannot be shown any more.</p>
        } @else if (changes().length === 0) {
          <p class="muted small pad">{{ run().status === 'running' ? 'Files appear here as pages are committed.' : 'No files changed.' }}</p>
        } @else {
          <ul class="file-list" role="list">
            @for (file of changes(); track file.file) {
              <li>
                <button type="button" class="file" [class.selected]="selected() === file.file" (click)="openDiff(file)">
                  <span class="status" [class]="file.status" [attr.aria-label]="file.status">{{ file.status[0]!.toUpperCase() }}</span>
                  <span class="path">
                    <span class="name small truncate">{{ baseName(file.file) }}</span>
                    <span class="folder tiny muted truncate">{{ folder(file.file) }}</span>
                  </span>
                  @if (file.sensitive) {
                    <p-tag value="Sensitive" severity="warn" pTooltip="Allowed, but reviewers should look closely" />
                  }
                </button>
              </li>
            }
          </ul>
        }
      </section>
    </div>

    @if (selected(); as file) {
      <section class="panel diff-panel" aria-labelledby="diff-title">
        <div class="panel-header">
          <h2 id="diff-title" class="mono small truncate">{{ file }}</h2>
          <p-button icon="pi pi-times" [text]="true" severity="secondary" size="small" ariaLabel="Close the diff" (onClick)="selected.set(null)" />
        </div>
        <app-diff-viewer [diff]="diff()" [loading]="diffLoading()" />
      </section>
    }
  `,
  styles: `
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 340px;
      gap: 24px;
      align-items: start;
    }
    @media (max-width: 1100px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .log-panel {
      position: relative;
      overflow: hidden;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--refit-border);
      flex-wrap: wrap;
    }
    .search {
      flex: 1 1 160px;
      min-width: 140px;
      max-width: 260px;
    }
    .search input {
      width: 100%;
    }
    .log {
      height: min(62vh, 640px);
      background: var(--p-surface-950);
      color: var(--p-surface-200);
      font-family: var(--refit-mono);
      font-size: 12.5px;
    }
    .row {
      display: grid;
      grid-template-columns: 64px 64px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      height: 22px;
      padding: 0 12px;
      white-space: pre;
    }
    .row:hover {
      background: rgb(255 255 255 / 0.04);
    }
    .time {
      color: var(--p-surface-500);
    }
    .badge {
      color: var(--p-surface-400);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .text {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .command .text {
      color: var(--p-sky-300);
      font-weight: 600;
    }
    .output .text {
      color: var(--p-surface-300);
    }
    .warning .text {
      color: var(--p-amber-300);
    }
    .error .text {
      color: var(--p-red-300);
    }
    .guard .text,
    .guard .badge {
      color: var(--p-violet-300);
    }
    .thought .text {
      color: var(--p-surface-300);
      font-style: italic;
    }
    .tool .text {
      color: var(--p-emerald-300);
    }
    .exit {
      margin-left: 8px;
      padding: 0 6px;
      border-radius: 4px;
      background: var(--p-red-900);
      color: var(--p-red-200);
    }
    .jump {
      position: absolute;
      right: 16px;
      bottom: 16px;
    }
    .files {
      position: sticky;
      top: calc(var(--refit-topbar-height) + 16px);
      max-height: calc(100vh - var(--refit-topbar-height) - 32px);
      display: flex;
      flex-direction: column;
    }
    .pad {
      padding: 16px 20px;
    }
    .file-list {
      overflow: auto;
      padding: 6px;
    }
    .file {
      all: unset;
      box-sizing: border-box;
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: var(--refit-radius);
      cursor: pointer;
    }
    .file:hover {
      background: var(--refit-hover);
    }
    .file.selected {
      background: var(--refit-accent-soft);
    }
    .file:focus-visible {
      outline: 2px solid var(--refit-accent);
    }
    .path {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .name {
      font-weight: 600;
    }
    .folder {
      font-family: var(--refit-mono);
    }
    .status {
      flex: none;
      width: 18px;
      font-family: var(--refit-mono);
      font-weight: 700;
      font-size: 0.75rem;
      text-align: center;
    }
    .status.added {
      color: var(--refit-success);
    }
    .status.modified {
      color: var(--refit-warn);
    }
    .status.deleted {
      color: var(--refit-danger);
    }
    .diff-panel {
      margin-top: 24px;
    }
  `,
})
export class DeveloperView {
  readonly run = input.required<RunRecord>();
  private readonly stream = inject(RunStream);
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly viewport = viewChild<CdkVirtualScrollViewport>('viewport');

  protected readonly rowHeight = 22;
  protected readonly filters = [
    { label: 'All', value: 'all' as Filter },
    { label: 'Agent', value: 'agent' as Filter },
    { label: 'Commands', value: 'commands' as Filter },
    { label: 'Guard', value: 'guard' as Filter },
    { label: 'Warnings', value: 'warnings' as Filter },
  ];
  protected readonly filter = signal<Filter>('all');
  protected readonly query = signal('');
  protected readonly following = signal(true);
  protected readonly changes = signal<ChangedFile[]>([]);
  protected readonly selected = signal<string | null>(null);
  protected readonly diff = signal('');
  protected readonly diffLoading = signal(false);

  protected readonly visible = computed(() => {
    const kinds = FILTER_KINDS[this.filter()];
    const query = this.query().trim().toLowerCase();
    return this.stream.log().filter((entry) => (!kinds || kinds.has(entry.kind)) && (!query || `${entry.text} ${entry.tool ?? ''} ${entry.target ?? ''}`.toLowerCase().includes(query)));
  });

  constructor() {
    // Keep the newest line in view while following (after the viewport has rendered the rows).
    effect(() => {
      const count = this.visible().length;
      const viewport = this.viewport();
      if (viewport && untracked(this.following) && count > 0) requestAnimationFrame(() => viewport.scrollToIndex(count - 1));
    });
    // Inputs are only available once the view is set up, so load from an effect, not the constructor.
    effect(() => {
      const runId = this.run().id;
      untracked(() => void this.loadChanges(runId));
    });
    const stop = this.stream.onEvent((event) => {
      if ((event.type === 'page' && (event.status === 'done' || event.status === 'flagged')) || event.type === 'result') void this.loadChanges(this.run().id);
    });
    inject(DestroyRef).onDestroy(stop);
  }

  protected trackSeq(_index: number, entry: LogEntry): number {
    return entry.seq;
  }

  protected badge(entry: LogEntry): string {
    switch (entry.kind) {
      case 'command':
        return '$';
      case 'output':
        return 'out';
      case 'thought':
        return 'agent';
      case 'tool':
        return 'tool';
      case 'guard':
        return 'guard';
      case 'warning':
        return 'warn';
      case 'error':
        return 'error';
      default:
        return entry.source;
    }
  }

  protected baseName(file: string): string {
    return file.split('/').pop() ?? file;
  }

  protected folder(file: string): string {
    return file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '(root)';
  }

  protected toolIcon(entry: LogEntry): string {
    return TOOL_ICONS[entry.tool ?? ''] ?? 'pi-cog';
  }

  protected onScroll(): void {
    const viewport = this.viewport();
    if (!viewport) return;
    const distance = viewport.measureScrollOffset('bottom');
    this.following.set(distance < this.rowHeight * 2);
  }

  protected jumpToEnd(): void {
    this.following.set(true);
    this.viewport()?.scrollToIndex(this.visible().length - 1);
  }

  protected async copy(): Promise<void> {
    const text = this.visible()
      .map((entry) => `${entry.ts.slice(11, 19)} ${this.badge(entry)} ${entry.kind === 'tool' ? `${entry.tool} ${entry.target ?? ''}` : entry.text}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      this.notify.success('Log copied', `${this.visible().length} lines are on the clipboard.`);
    } catch (error) {
      this.notify.error(error, 'Could not copy the log');
    }
  }

  private async loadChanges(runId: string): Promise<void> {
    try {
      this.changes.set(await this.api.runChanges(runId));
    } catch (error) {
      this.changes.set([]);
      this.notify.error(error, 'Could not list the changed files');
    }
  }

  protected async openDiff(file: ChangedFile): Promise<void> {
    this.selected.set(file.file);
    this.diffLoading.set(true);
    try {
      this.diff.set((await this.api.runDiff(this.run().id, file.file)).diff);
    } catch (error) {
      this.diff.set('');
      this.notify.error(error, 'Could not load the diff');
    } finally {
      this.diffLoading.set(false);
    }
  }
}
