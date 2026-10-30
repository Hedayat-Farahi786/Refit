import type { RefitConfig } from './config/config.js';
import type { StateBus } from './events/bus.js';
import type { RefitPaths } from './paths.js';
import type { StateStore } from './store/store.js';

/** Everything route handlers and services share. Created once in main.ts (or per test). */
export interface ServerContext {
  paths: RefitPaths;
  store: StateStore;
  bus: StateBus;
  version: string;
  /** True under `npm run dev`, which serves the web UI from the Angular dev server on port 4701. */
  dev: boolean;
  getConfig(): RefitConfig;
  setConfig(config: RefitConfig): void;
}
