import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppRecord, Brand, RunRecord, UiSettings } from '@refit/shared';
import { validateBrand } from '@refit/shared';
import { readJsonIfExists, writeFileAtomic } from '../util/fs.js';

export interface PersistedState {
  version: 1;
  apps: AppRecord[];
  runs: RunRecord[];
  brands: Brand[];
  settings: UiSettings;
}

const EMPTY: PersistedState = { version: 1, apps: [], runs: [], brands: [], settings: { uiBrandId: '' } };

/**
 * Refit's single-user state in data/state.json. All changes go through `update`, which applies
 * them in order and writes the file atomically. Bursts of updates (a busy run) are coalesced
 * into one write.
 */
export class StateStore {
  private state: PersistedState = structuredClone(EMPTY);
  private writing: Promise<void> = Promise.resolve();
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;

  private constructor(private readonly file: string) {}

  static async open(file: string, starterBrandsDir: string): Promise<StateStore> {
    const store = new StateStore(file);
    await store.load(starterBrandsDir);
    return store;
  }

  private async load(starterBrandsDir: string): Promise<void> {
    let loaded: PersistedState | null = null;
    try {
      loaded = await readJsonIfExists<PersistedState>(this.file);
    } catch (error) {
      // A corrupt state file must not lose data silently: keep it next to the new one.
      const backup = `${this.file}.corrupt-${Date.now()}`;
      await fs.rename(this.file, backup).catch(() => undefined);
      console.error(`Refit: data/state.json could not be read (${(error as Error).message}). Saved it as ${path.basename(backup)} and started fresh.`);
    }
    this.state = { ...structuredClone(EMPTY), ...(loaded ?? {}) };
    for (const app of this.state.apps) {
      app.scanState ??= { status: 'idle' };
      app.findings ??= [];
      app.readiness ??= null;
      app.pages ??= [];
      app.overrides ??= {};
    }
    if (this.state.brands.length === 0) {
      this.state.brands = await loadStarterBrands(starterBrandsDir);
    }
    if (!this.state.brands.some((brand) => brand.id === this.state.settings.uiBrandId)) {
      this.state.settings.uiBrandId = this.state.brands[0]?.id ?? '';
    }
    await this.flush();
  }

  /** A deep copy of the current state; safe to hand to callers. */
  snapshot(): PersistedState {
    return structuredClone(this.state);
  }

  get<T>(select: (state: PersistedState) => T): T {
    return structuredClone(select(this.state));
  }

  /** Applies a change and schedules a write. Returns the mutator's result. */
  update<T>(mutate: (state: PersistedState) => T): T {
    const result = mutate(this.state);
    this.scheduleFlush();
    return structuredClone(result);
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 50);
  }

  /** Writes pending changes now. Await this before shutting down. */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.dirty = true;
    this.writing = this.writing.then(async () => {
      if (!this.dirty) return;
      this.dirty = false;
      await writeFileAtomic(this.file, `${JSON.stringify(this.state, null, 2)}\n`);
    });
    await this.writing;
  }
}

async function loadStarterBrands(dir: string): Promise<Brand[]> {
  let names: string[];
  try {
    names = (await fs.readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const brands: Brand[] = [];
  for (const name of names) {
    const brand = await readJsonIfExists<Brand>(path.join(dir, name));
    if (brand && validateBrand(brand).length === 0) brands.push({ ...brand, updatedAt: new Date().toISOString() });
    else console.error(`Refit: skipped starter brand ${name} because it is not valid.`);
  }
  return brands;
}
