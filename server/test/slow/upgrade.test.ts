import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProviderRegistry } from '../../src/providers/registry.js';
import { fixtureRepo, gitIn } from '../helpers/repos.js';
import { startTestServer, type TestServer } from '../helpers/server.js';

/**
 * Upgrades fixture 2 from Angular 17 to 21 one major at a time with the real Angular CLI, then
 * installs PrimeNG and the brand. Needs network access and takes a while (npm run test:slow).
 */
let server: TestServer;
let appId: string;

beforeAll(async () => {
  server = await startTestServer({ providers: createProviderRegistry({}, { delayMs: 5 }) });
  const folder = await fixtureRepo('ng-17-material');
  appId = server.services.apps.create({ name: 'Product admin', source: { kind: 'local', path: folder }, port: 4291 }).id;
  await server.services.apps.waitForScan(appId);
  const app = server.services.apps.get(appId);
  // One page is enough: this test is about the upgrade and the design system.
  server.services.apps.update(appId, { pages: app.pages.map((page) => ({ ...page, include: page.route === '/' })) });
});

afterAll(async () => {
  await server.app.close();
});

describe('upgrade ng-17-material to Angular 21', () => {
  it('upgrades one major at a time, builds after each hop and installs PrimeNG 21 with the brand', async () => {
    const started = await server.services.runs.start(appId, { provider: 'dryrun', targetAngularMajor: 21 });
    await server.services.runs.waitFor(started.id);
    const run = server.services.runs.get(started.id);
    expect(run.status, run.message).toBe('done');
    expect(run.steps.find((step) => step.id === 'upgrade')).toMatchObject({ status: 'done', detail: 'Upgraded from Angular 17 to 21' });
    expect(run.steps.find((step) => step.id === 'design-system')).toMatchObject({ status: 'done', detail: 'PrimeNG 21.1.10 with Oerlikon' });

    const workspace = run.workspace!;
    const history = (await gitIn(workspace, 'log', '--format=%s', `${run.baseCommit}..HEAD`)).split('\n').reverse();
    expect(history.slice(0, 4)).toEqual(['refit: upgrade Angular to 18', 'refit: upgrade Angular to 19', 'refit: upgrade Angular to 20', 'refit: upgrade Angular to 21']);
    expect(history).toContain('refit: install PrimeNG 21.1.10 and the Oerlikon brand');

    const pkg = JSON.parse(await fs.readFile(path.join(workspace, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@angular/core']).toMatch(/^[\^~]?21\./);
    expect(pkg.dependencies['@angular/material']).toMatch(/^[\^~]?21\./);
    expect(pkg.dependencies).toMatchObject({ primeng: '21.1.10', '@primeuix/themes': '2.0.3' });
    await expect(fs.stat(path.join(workspace, 'src/app/theme/BRAND.md'))).resolves.toBeTruthy();
  });
});
