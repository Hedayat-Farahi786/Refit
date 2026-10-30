import { Injectable, inject, signal } from '@angular/core';
import type { LogLevel, LogSource, RunEvent, RunRecord } from '@refit/shared';
import { applyRunEvent } from '@refit/shared';
import { Api } from './api';

export type LogKind = 'command' | 'output' | 'info' | 'warning' | 'error' | 'guard' | 'thought' | 'tool';

export interface LogEntry {
  seq: number;
  ts: string;
  kind: LogKind;
  text: string;
  /** Agent tool name or the task the line belongs to. */
  tool?: string;
  target?: string;
  task?: string;
  exitCode?: number;
  source: LogSource | 'agent';
}

/**
 * Live view of one run: loads its summary, replays its events over SSE and keeps both the summary
 * (via the shared reducer) and the log up to date. Provide it per component that shows a run.
 */
@Injectable()
export class RunStream {
  private readonly api = inject(Api);
  private source: EventSource | null = null;
  private pending: RunEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private runId = '';
  private listeners = new Set<(event: RunEvent) => void>();

  readonly run = signal<RunRecord | null>(null);
  readonly log = signal<LogEntry[]>([]);
  readonly error = signal<string | null>(null);
  /** True once the stream has delivered everything (the run ended). */
  readonly ended = signal(false);

  async open(runId: string): Promise<void> {
    this.close();
    this.runId = runId;
    this.log.set([]);
    this.ended.set(false);
    this.error.set(null);
    try {
      this.run.set(await this.api.run(runId));
    } catch (error) {
      this.error.set((error as Error).message);
      return;
    }
    const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events?after=0`);
    this.source = source;
    source.onmessage = (message: MessageEvent<string>) => {
      const data = JSON.parse(message.data) as RunEvent | { type: 'stream-end' };
      if (data.type === 'stream-end') {
        this.flush();
        this.ended.set(true);
        source.close();
        return;
      }
      this.pending.push(data);
      if (data.type === 'result') {
        this.flush();
        this.ended.set(true);
        source.close();
        return;
      }
      this.flushTimer ??= setTimeout(() => this.flush(), 80);
    };
  }

  /** Called for each event after it was applied. */
  onEvent(listener: (event: RunEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.source?.close();
    this.source = null;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.pending = [];
  }

  async reload(): Promise<void> {
    if (this.runId) await this.open(this.runId);
  }

  /** Applies buffered events in one go, so bursts of build output stay smooth. */
  private flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    const events = this.pending;
    this.pending = [];
    if (events.length === 0) return;
    const current = this.run();
    if (current) {
      const next = structuredClone(current);
      for (const event of events) applyRunEvent(next, event);
      this.run.set(next);
    }
    const entries = events.map(toLogEntry).filter((entry): entry is LogEntry => entry !== null);
    if (entries.length > 0) this.log.update((log) => log.concat(entries));
    for (const event of events) for (const listener of this.listeners) listener(event);
  }
}

const LEVEL_KIND: Record<LogLevel, LogKind> = { cmd: 'command', out: 'output', info: 'info', warn: 'warning', error: 'error' };

function toLogEntry(event: RunEvent): LogEntry | null {
  if (event.type === 'log') {
    return {
      seq: event.seq,
      ts: event.ts,
      kind: event.source === 'guard' ? 'guard' : LEVEL_KIND[event.level],
      text: event.text,
      source: event.source,
      ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
    };
  }
  if (event.type === 'agent') {
    return {
      seq: event.seq,
      ts: event.ts,
      kind: event.kind,
      text: event.text ?? '',
      source: 'agent',
      ...(event.tool ? { tool: event.tool } : {}),
      ...(event.target ? { target: event.target } : {}),
      ...(event.task ? { task: event.task } : {}),
    };
  }
  if (event.type === 'step' && (event.status === 'failed' || event.status === 'warn') && event.detail) {
    return { seq: event.seq, ts: event.ts, kind: event.status === 'failed' ? 'error' : 'warning', text: event.detail, source: 'refit' };
  }
  return null;
}
