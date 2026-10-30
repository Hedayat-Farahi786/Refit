import { EventEmitter } from 'node:events';
import type { StateEvent } from '@refit/shared';

/** In-process notifications that the web UI receives over GET /api/events. */
export class StateBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit(event: StateEvent): void {
    this.emitter.emit('event', event);
  }

  changed(reason: string, ids: { appId?: string; runId?: string } = {}): void {
    this.emit({ type: 'state-changed', reason, ...ids });
  }

  subscribe(listener: (event: StateEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
