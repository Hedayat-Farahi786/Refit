import { Component, computed, input } from '@angular/core';
import { Skeleton } from 'primeng/skeleton';

interface DiffLine {
  kind: 'add' | 'del' | 'ctx' | 'hunk';
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

/** Renders a unified diff with line numbers and added/removed highlighting. */
@Component({
  selector: 'app-diff-viewer',
  imports: [Skeleton],
  template: `
    @if (loading()) {
      <div class="pad"><p-skeleton height="10rem" /></div>
    } @else if (lines().length === 0) {
      <p class="muted small pad">No differences.</p>
    } @else {
      <div class="diff" role="table" aria-label="Changes in this file">
        @for (line of lines(); track $index) {
          <div class="line" [class]="line.kind" role="row">
            <span class="no" role="cell">{{ line.oldNo ?? '' }}</span>
            <span class="no" role="cell">{{ line.newNo ?? '' }}</span>
            <span class="sign" role="cell" aria-hidden="true">{{ line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' ' }}</span>
            <span class="code" role="cell"><span class="sr-only">{{ line.kind === 'add' ? 'Added: ' : line.kind === 'del' ? 'Removed: ' : '' }}</span>{{ line.text }}</span>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .pad {
      padding: 16px 20px;
    }
    .diff {
      overflow: auto;
      max-height: 70vh;
      font-family: var(--refit-mono);
      font-size: 12.5px;
      line-height: 1.6;
    }
    .line {
      display: grid;
      grid-template-columns: 48px 48px 18px minmax(0, 1fr);
      white-space: pre;
    }
    .no {
      text-align: right;
      padding-right: 8px;
      color: var(--refit-muted);
      user-select: none;
    }
    .sign {
      color: var(--refit-muted);
      user-select: none;
    }
    .add {
      background: var(--refit-success-soft);
    }
    .add .sign,
    .add .code {
      color: var(--refit-success);
    }
    .del {
      background: var(--refit-danger-soft);
    }
    .del .sign,
    .del .code {
      color: var(--refit-danger);
    }
    .hunk {
      background: var(--refit-info-soft);
      color: var(--refit-info);
    }
    .code {
      padding-right: 16px;
    }
  `,
})
export class DiffViewer {
  readonly diff = input('');
  readonly loading = input(false);

  protected readonly lines = computed<DiffLine[]>(() => {
    const lines: DiffLine[] = [];
    let oldNo = 0;
    let newNo = 0;
    for (const raw of this.diff().split('\n')) {
      if (raw.startsWith('diff --git') || raw.startsWith('index ') || raw.startsWith('--- ') || raw.startsWith('+++ ') || raw.startsWith('new file mode') || raw.startsWith('deleted file mode')) continue;
      const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(raw);
      if (hunk) {
        oldNo = Number(hunk[1]);
        newNo = Number(hunk[2]);
        lines.push({ kind: 'hunk', text: raw, oldNo: null, newNo: null });
      } else if (raw.startsWith('+')) {
        lines.push({ kind: 'add', text: raw.slice(1), oldNo: null, newNo: newNo++ });
      } else if (raw.startsWith('-')) {
        lines.push({ kind: 'del', text: raw.slice(1), oldNo: oldNo++, newNo: null });
      } else if (raw.startsWith(' ')) {
        lines.push({ kind: 'ctx', text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ });
      } else if (raw.startsWith('\\')) {
        lines.push({ kind: 'ctx', text: raw, oldNo: null, newNo: null });
      }
    }
    return lines;
  });
}
