import { Injectable, computed, inject, signal } from '@angular/core';
import type { AppRecord, Brand, StateEvent, StateResponse } from '@refit/shared';
import { Api, RequestError, toRequestError } from './api';

/**
 * The single source of truth for what the UI shows. It loads /api/state and refreshes it
 * whenever the server says something changed (over the /api/events stream).
 */
@Injectable({ providedIn: 'root' })
export class AppState {
  private readonly api = inject(Api);
  private readonly stateSignal = signal<StateResponse | null>(null);
  private readonly errorSignal = signal<RequestError | null>(null);
  private readonly connectedSignal = signal(true);
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private events: EventSource | null = null;
  private readonly listeners = new Set<(event: StateEvent) => void>();

  readonly state = this.stateSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  /** False while the live connection to the server is down. */
  readonly connected = this.connectedSignal.asReadonly();
  readonly loaded = computed(() => this.stateSignal() !== null);
  readonly apps = computed<AppRecord[]>(() => this.stateSignal()?.apps ?? []);
  readonly brands = computed<Brand[]>(() => this.stateSignal()?.brands ?? []);
  /** The brand new runs use unless another one is chosen. */
  readonly defaultBrand = computed<Brand | null>(() => {
    const state = this.stateSignal();
    if (!state) return null;
    return state.brands.find((brand) => brand.id === state.settings.defaultBrandId) ?? state.brands[0] ?? null;
  });

  app(id: string | null | undefined): AppRecord | undefined {
    return id ? this.apps().find((app) => app.id === id) : undefined;
  }

  async load(): Promise<void> {
    try {
      this.stateSignal.set(await this.api.state());
      this.errorSignal.set(null);
    } catch (error) {
      this.errorSignal.set(toRequestError(error));
    }
  }

  /** Connects to the server's change stream. Safe to call more than once. */
  connect(): void {
    if (this.events) return;
    const source = new EventSource('/api/events');
    this.events = source;
    source.onopen = () => this.connectedSignal.set(true);
    source.onerror = () => this.connectedSignal.set(false);
    source.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as StateEvent;
      for (const listener of this.listeners) listener(event);
      // "connected" comes on every (re)connect. Changes made before the stream opened (a scan
      // that finished between the first load and the connection) would be missed otherwise.
      if (event.type === 'state-changed' && event.reason === 'connected') this.scheduleRefresh(0);
      else if (event.type === 'state-changed' || event.type === 'sign-in') this.scheduleRefresh(60);
    };
  }

  /** Listens to every server event (for example sign-in progress). Returns an unsubscribe function. */
  onEvent(listener: (event: StateEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Replaces one app in the local state right away (after a save), before the next refresh. */
  patchApp(app: AppRecord): void {
    this.stateSignal.update((state) => (state ? { ...state, apps: state.apps.map((existing) => (existing.id === app.id ? app : existing)) } : state));
  }

  refresh(): void {
    this.scheduleRefresh(0);
  }

  private scheduleRefresh(delayMs: number): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.load();
    }, delayMs);
  }
}
