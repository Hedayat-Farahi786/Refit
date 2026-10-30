import { createWriteStream, promises as fs, type WriteStream } from 'node:fs';
import path from 'node:path';
import type { RunEvent, RunEventBody } from '@refit/shared';

const MAX_TEXT = 8_000;

/**
 * The event log of one run: appended to data/runs/<runId>/events.jsonl as it happens, kept in
 * memory while the run is active so the UI can replay it, and streamed to subscribers.
 */
export class RunEventLog {
  private readonly events: RunEvent[] = [];
  private readonly listeners = new Set<(event: RunEvent) => void>();
  private stream: WriteStream | null = null;
  private seq = 0;
  private closed = false;

  private constructor(readonly file: string) {}

  static async create(runDir: string): Promise<RunEventLog> {
    await fs.mkdir(runDir, { recursive: true });
    const log = new RunEventLog(path.join(runDir, 'events.jsonl'));
    log.stream = createWriteStream(log.file, { flags: 'a', encoding: 'utf8' });
    return log;
  }

  /** Reads a finished run's log from disk. */
  static async read(runDir: string): Promise<RunEvent[]> {
    let text: string;
    try {
      text = await fs.readFile(path.join(runDir, 'events.jsonl'), 'utf8');
    } catch {
      return [];
    }
    const events: RunEvent[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as RunEvent);
      } catch {
        // A partial last line after a crash; everything before it is still valid.
      }
    }
    return events;
  }

  get lastSeq(): number {
    return this.seq;
  }

  emit(body: RunEventBody): RunEvent {
    const event = { ...truncate(body), seq: ++this.seq, ts: new Date().toISOString() } as RunEvent;
    this.events.push(event);
    if (!this.closed) this.stream?.write(`${JSON.stringify(event)}\n`);
    for (const listener of this.listeners) listener(event);
    return event;
  }

  /** Events after `afterSeq`, for replays. */
  since(afterSeq: number): RunEvent[] {
    return afterSeq <= 0 ? [...this.events] : this.events.filter((event) => event.seq > afterSeq);
  }

  subscribe(listener: (event: RunEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const stream = this.stream;
    if (stream) await new Promise<void>((resolve) => stream.end(resolve));
  }
}

function truncate(body: RunEventBody): RunEventBody {
  if ((body.type === 'log' || body.type === 'agent') && body.text && body.text.length > MAX_TEXT) {
    return { ...body, text: `${body.text.slice(0, MAX_TEXT)}… (${body.text.length - MAX_TEXT} more characters)` };
  }
  return body;
}
