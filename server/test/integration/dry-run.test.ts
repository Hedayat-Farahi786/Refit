import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RunEvent } from '@refit/shared';
import { createProviderRegistry } from '../../src/providers/registry.js';
import { startMockApi, type MockServer } from '../helpers/mock-servers.js';
import { gitIn, fixtureRepo } from '../helpers/repos.js';
import { startTestServer, type TestServer } from '../helpers/server.js';

/**
 * A full modernize run with the Dry run provider on fixture 1: clone, install, build, pages,
 * guard, rollback, commits and report. Needs network access for npm ci the first time.
 */
let server: TestServer;
let api: MockServer;
let appId: string;

beforeAll(async () => {
  api = await startMockApi();
  server = await startTestServer({
    providers: createProviderRegistry({}, {
      delayMs: 5,
      touchFile: 'src/app/services/request.service.ts',
      breakBuildOnPage: 'New request page',
    }),
  });
  const folder = await fixtureRepo('ng-modern-bootstrap');
  appId = server.services.apps.create({ name: 'Service desk', source: { kind: 'local', path: folder }, port: 4290 }).id;
  await server.services.apps.waitForScan(appId);
  const app = server.services.apps.get(appId);
  server.services.apps.update(appId, { pages: app.pages.map((page) => (page.route === '/requests/:id' ? { ...page, params: { id: '1' } } : page)) });
});

afterAll(async () => {
  await server.app.close();
  await api.close();
});

describe('dry run on ng-modern-bootstrap', () => {
  it('modernizes every page, reverts protected files, rolls back a broken page and writes a report', async () => {
    const started = await server.services.runs.start(appId, { provider: 'dryrun' });
    expect(started.status).toBe('running');
    await server.services.runs.waitFor(started.id);
    const run = server.services.runs.get(started.id);

    expect(run.status, run.message).toBe('done');
    expect(Object.fromEntries(run.steps.map((step) => [step.id, step.status]))).toEqual({
      prepare: 'done',
      install: 'done',
      baseline: 'done',
      upgrade: 'skipped',
      'design-system': 'done',
      pages: 'warn',
      final: 'done',
      ready: 'done',
    });
    expect(Object.fromEntries(run.pages.map((page) => [page.name, page.status]))).toEqual({
      Dashboard: 'done',
      Requests: 'done',
      'Request details': 'done',
      'New request': 'flagged',
    });
    expect(run.pages.find((page) => page.name === 'New request')?.note).toMatch(/rolled back/);
    expect(run.pages.find((page) => page.name === 'Dashboard')?.report?.structured).toBe(true);
    expect(run.branch).toMatch(/^refit\/modernize-\d{8}-[a-z0-9]{8}$/);
    expect(run.result).toMatchObject({ pagesDone: 3, pagesFlagged: 1, pagesSkipped: 0, build: 'passed', costUsd: 0 });
    expect(run.result?.protectedReverts).toBeGreaterThanOrEqual(3);

    // Screenshots before and after, desktop and mobile, and an unchanged API on every page.
    for (const page of run.pages) {
      expect(page.shots.before.desktop, page.name).toMatch(new RegExp(`^/files/runs/${run.id}/shots/${page.pageId}-before-desktop\\.jpg`));
      expect(page.shots.before.mobile, page.name).toBeTruthy();
      expect(page.shots.after.desktop, page.name).toBeTruthy();
      expect(page.apiDiff, page.name).toMatchObject({ added: [], removed: [] });
    }
    expect(run.pages.find((page) => page.name === 'Requests')?.apiDiff?.unchanged).toBeGreaterThan(0);
    expect(run.result?.apiUnchanged).toBe(true);
    const shotFile = path.join(server.ctx.paths.runs, run.id, 'shots', 'home-before-desktop.jpg');
    expect((await fs.stat(shotFile)).size).toBeGreaterThan(5000);
    const served = await server.app.inject({ method: 'GET', url: `/files/runs/${run.id}/shots/home-before-desktop.jpg`, headers: { host: 'localhost:4700' } });
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');

    // The branch has the design system, then one commit per modernized page, and never touches the protected service.
    const workspace = run.workspace!;
    const log = await gitIn(workspace, 'log', '--format=%s', `${run.baseCommit}..HEAD`);
    expect(log.split('\n').reverse()).toEqual([
      'refit: install PrimeNG 21.1.10 and the Oerlikon brand',
      'refit(ui): design system and app shell',
      'refit(ui): modernize Dashboard',
      'refit(ui): modernize Requests',
      'refit(ui): modernize Request details',
    ]);
    const changed = await gitIn(workspace, 'diff', '--name-only', run.baseCommit!);
    expect(changed.split('\n')).not.toContain('src/app/services/request.service.ts');
    expect(changed.split('\n')).not.toContain('src/app/pages/request-form/request-form.component.html');
    expect(await fs.readFile(path.join(workspace, 'src/app/pages/dashboard/dashboard.component.html'), 'utf8')).toMatch(/^<!-- Refit dry run: Dashboard page -->/);

    // The report and the event log.
    const report = await fs.readFile(run.result!.reportPath!, 'utf8');
    expect(report).toContain('# Front-end modernization: Service desk');
    expect(report).toContain('| Pages modernized | 3 of 4 |');
    expect(report).toContain('| Angular | Keeping Angular 21 |');
    expect(report).toContain('| Design system | PrimeNG 21.1.10 with Oerlikon |');
    expect(report).toContain('## Design system');
    expect(report).toContain('## Protected files the agent touched (reverted)');
    expect(report).toContain('`src/app/services/request.service.ts`');
    const events: RunEvent[] = await server.services.runs.events(run.id, 0);
    expect(events[0]).toMatchObject({ type: 'status', status: 'running', seq: 1 });
    expect(events.at(-1)?.type).toBe('result');
    expect(events.some((event) => event.type === 'log' && event.source === 'guard')).toBe(true);
    expect(events.some((event) => event.type === 'agent' && event.kind === 'tool')).toBe(true);

    // The design system: PrimeNG and the brand installed, the theme files written, PrimeNG registered.
    expect(run.steps.find((step) => step.id === 'upgrade')?.detail).toBe('Keeping Angular 21');
    expect(run.steps.find((step) => step.id === 'design-system')?.detail).toBe('PrimeNG 21.1.10 with Oerlikon');
    const appFolder = run.workspace!;
    const pkg = JSON.parse(await fs.readFile(path.join(appFolder, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).toMatchObject({ primeng: '21.1.10', '@primeuix/themes': '2.0.3', primeicons: '7.0.0' });
    expect(await fs.readFile(path.join(appFolder, 'src/app/theme/brand-preset.ts'), 'utf8')).toContain("500: '#eb0000'");
    expect(await fs.readFile(path.join(appFolder, 'src/app/theme/BRAND.md'), 'utf8')).toContain('# Oerlikon: design system');
    expect(await fs.readFile(path.join(appFolder, 'src/app/app.config.ts'), 'utf8')).toContain('providePrimeNG({ theme: { preset: BrandPreset');

    // Changes and diffs for the developer view.
    const changes = await server.services.runs.changes(run.id);
    expect(changes.map((change) => change.file)).toContain('src/app/pages/dashboard/dashboard.component.html');
    expect(await server.services.runs.diff(run.id, 'src/app/pages/dashboard/dashboard.component.html')).toContain('+<!-- Refit dry run: Dashboard page -->');
  });

  it('cancels a run, keeps the workspace and explains what happened', async () => {
    const started = await server.services.runs.start(appId, { provider: 'dryrun' });
    await new Promise<void>((resolve) => {
      const stop = server.services.runs.subscribe(started.id, (event) => {
        if (event.type === 'step' && event.step === 'install' && event.status === 'active') {
          stop?.();
          resolve();
        }
      });
    });
    server.services.runs.cancel(started.id);
    await server.services.runs.waitFor(started.id);
    const run = server.services.runs.get(started.id);
    expect(run.status).toBe('cancelled');
    expect(run.steps.find((step) => step.id === 'install')?.status).toBe('skipped');
    expect(run.steps.find((step) => step.id === 'pages')?.status).toBe('skipped');
    expect(run.pages.every((page) => page.status === 'skipped')).toBe(true);
    await expect(fs.stat(run.workspace!)).resolves.toBeTruthy();
    expect(server.services.runs.activeRunId()).toBeNull();
  });

  it('refuses a second run while one is active', async () => {
    const started = await server.services.runs.start(appId, { provider: 'dryrun' });
    await expect(server.services.runs.start(appId, { provider: 'dryrun' })).rejects.toThrow(/Another run is in progress/);
    server.services.runs.cancel(started.id);
    await server.services.runs.waitFor(started.id);
  });

  it('runs a read-only agent review and stores it on the app', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: `/api/apps/${appId}/review`,
      headers: { host: 'localhost:4700', origin: 'http://localhost:4700' },
      payload: { provider: 'dryrun' },
    });
    expect(response.statusCode, response.body).toBe(201);
    const started = response.json<{ id: string; kind: string }>();
    expect(started.kind).toBe('review');
    await server.services.runs.waitFor(started.id);

    const run = server.services.runs.get(started.id);
    expect(run.status, run.message).toBe('done');
    expect(run.steps).toEqual([expect.objectContaining({ id: 'review', status: 'done' })]);
    const review = server.services.apps.get(appId).review;
    expect(review).toMatchObject({ runId: started.id, provider: 'dryrun', structured: true, costUsd: 0 });
    expect(review?.pages.length).toBeGreaterThan(0);
    const events: RunEvent[] = await server.services.runs.events(run.id, 0);
    expect(events.some((event) => event.type === 'agent' && event.kind === 'tool')).toBe(true);
    // Read-only: the review never makes a workspace or a branch.
    expect(run.workspace).toBeUndefined();
    expect(run.branch).toBeUndefined();
  });
});
