import path from 'node:path';
import type { AppRecord, AppSource, CommandOverrides, PageConfig } from '@refit/shared';
import { shortId } from '@refit/shared';
import type { ServerContext } from '../context.js';
import { pageFindings, readinessOf, sortFindings } from '../scan/findings.js';
import { mergePages } from '../scan/pages.js';
import { scanApp } from '../scan/scan.js';
import { errorMessage, UserError } from '../util/errors.js';
import { removeTree } from '../util/fs.js';

export interface NewApp {
  name: string;
  source: AppSource;
  port: number;
}

export interface AppPatch {
  name?: string;
  port?: number;
  pages?: PageConfig[];
  overrides?: CommandOverrides;
  subdir?: string;
}

/** Adds, edits, scans and removes apps. Scans run in the background and report over the state stream. */
export class AppService {
  private readonly scans = new Map<string, Promise<void>>();

  constructor(private readonly ctx: ServerContext) {}

  get(id: string): AppRecord {
    const app = this.ctx.store.get((state) => state.apps.find((candidate) => candidate.id === id));
    if (!app) throw new UserError('That app does not exist any more.', 'Reload the page.', 404);
    return app;
  }

  create(input: NewApp): AppRecord {
    const source = normalizeSource(input.source);
    const existing = this.ctx.store.get((state) => state.apps.find((app) => sameSource(app.source, source)));
    if (existing) throw new UserError(`This app is already in Refit as "${existing.name}".`, 'Open it from the list instead of adding it again.', 409);
    const now = new Date().toISOString();
    const app: AppRecord = {
      id: shortId(),
      name: input.name.trim(),
      source,
      port: input.port,
      createdAt: now,
      updatedAt: now,
      scanState: { status: 'idle' },
      pages: [],
      overrides: {},
      findings: [],
      readiness: null,
    };
    this.ctx.store.update((state) => state.apps.push(app));
    this.ctx.bus.changed('app-added', { appId: app.id });
    this.startScan(app.id);
    return this.get(app.id);
  }

  update(id: string, patch: AppPatch): AppRecord {
    this.get(id);
    let rescan = false;
    this.ctx.store.update((state) => {
      const app = state.apps.find((candidate) => candidate.id === id)!;
      if (patch.name !== undefined) app.name = patch.name.trim();
      if (patch.port !== undefined && patch.port !== app.port) {
        app.port = patch.port;
        rescan = true;
      }
      if (patch.pages !== undefined) app.pages = patch.pages;
      if (patch.overrides !== undefined) {
        rescan ||= (patch.overrides.nodeDir ?? '') !== (app.overrides.nodeDir ?? '');
        app.overrides = cleanOverrides(patch.overrides);
      }
      if (patch.subdir !== undefined && app.source.kind === 'git') {
        const subdir = patch.subdir.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (subdir !== (app.source.subdir ?? '')) {
          app.source = subdir ? { ...app.source, subdir } : { kind: 'git', url: app.source.url };
          rescan = true;
        }
      }
      app.updatedAt = new Date().toISOString();
      recompute(app);
    });
    this.ctx.bus.changed('app-updated', { appId: id });
    if (rescan) this.startScan(id);
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    this.get(id);
    const busy = this.ctx.store.get((state) => state.runs.some((run) => run.appId === id && run.status === 'running'));
    if (busy) throw new UserError('This app has a run in progress.', 'Cancel the run first, then remove the app.', 409);
    this.ctx.store.update((state) => {
      state.apps = state.apps.filter((app) => app.id !== id);
    });
    await removeTree(path.join(this.ctx.paths.sources, id));
    this.ctx.bus.changed('app-removed', { appId: id });
  }

  /** Starts a scan unless one is already running for the app. */
  startScan(id: string): void {
    if (this.scans.has(id)) return;
    this.ctx.store.update((state) => {
      const app = state.apps.find((candidate) => candidate.id === id);
      if (app) app.scanState = { status: 'scanning', startedAt: new Date().toISOString() };
    });
    this.ctx.bus.changed('scan-started', { appId: id });
    const job = this.runScan(id).finally(() => this.scans.delete(id));
    this.scans.set(id, job);
  }

  /** Resolves when the current scan of the app (if any) has finished. */
  async waitForScan(id: string): Promise<void> {
    await this.scans.get(id);
  }

  private async runScan(id: string): Promise<void> {
    try {
      const app = this.get(id);
      const scan = await scanApp(app, { sourcesDir: this.ctx.paths.sources, targetAngularMajor: this.ctx.getConfig().targetAngularMajor });
      this.ctx.store.update((state) => {
        const current = state.apps.find((candidate) => candidate.id === id);
        if (!current) return;
        current.scan = scan;
        current.pages = mergePages(current.pages, scan.pages);
        current.scanState = { status: 'idle' };
        current.updatedAt = new Date().toISOString();
        recompute(current);
      });
    } catch (error) {
      const fix = error instanceof UserError ? error.fix : 'Try scanning again. If it keeps failing, check the server log for details.';
      if (!(error instanceof UserError)) console.error(`Refit: scan of app ${id} failed:`, error);
      this.ctx.store.update((state) => {
        const current = state.apps.find((candidate) => candidate.id === id);
        if (current) current.scanState = { status: 'failed', error: errorMessage(error), ...(fix ? { fix } : {}) };
      });
    }
    this.ctx.bus.changed('scan-finished', { appId: id });
  }
}

/** Recomputes findings and readiness from the last scan plus the current page list. */
export function recompute(app: AppRecord): void {
  if (!app.scan) {
    app.findings = [];
    app.readiness = null;
    return;
  }
  app.findings = sortFindings([...app.scan.findings, ...pageFindings(app.pages)]);
  app.readiness = readinessOf(app.findings);
}

/** Accepts paths pasted with quotes (Windows "Copy as path") and trims URLs. */
export function normalizeSource(source: AppSource): AppSource {
  if (source.kind === 'local') {
    const cleaned = source.path.trim().replace(/^["']|["']$/g, '');
    if (!path.isAbsolute(cleaned)) {
      throw new UserError('Use the full path of the app folder.', process.platform === 'win32' ? 'For example C:\\Users\\you\\code\\my-app.' : 'For example /Users/you/code/my-app.');
    }
    return { kind: 'local', path: path.normalize(cleaned).replace(/[\\/]+$/, '') || path.sep };
  }
  const url = source.url.trim();
  if (!/^(https?:\/\/|ssh:\/\/|git@)\S+$/.test(url)) {
    throw new UserError('That does not look like a git URL.', 'Use the HTTPS or SSH clone URL, for example https://github.com/org/app.git.');
  }
  const subdir = source.subdir?.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return subdir ? { kind: 'git', url, subdir } : { kind: 'git', url };
}

function sameSource(a: AppSource, b: AppSource): boolean {
  if (a.kind === 'local' && b.kind === 'local') {
    const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin';
    return caseInsensitive ? a.path.toLowerCase() === b.path.toLowerCase() : a.path === b.path;
  }
  if (a.kind === 'git' && b.kind === 'git') {
    const strip = (url: string) => url.replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();
    return strip(a.url) === strip(b.url) && (a.subdir ?? '') === (b.subdir ?? '');
  }
  return false;
}

function cleanOverrides(overrides: CommandOverrides): CommandOverrides {
  const out: CommandOverrides = {};
  for (const key of ['install', 'build', 'test', 'serve', 'nodeDir'] as const) {
    const value = overrides[key]?.trim();
    if (value) out[key] = value;
  }
  const env = Object.fromEntries(Object.entries(overrides.env ?? {}).filter(([key]) => key.trim() !== ''));
  if (Object.keys(env).length > 0) out.env = env;
  return out;
}
