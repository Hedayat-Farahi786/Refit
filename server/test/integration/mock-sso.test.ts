import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProviderRegistry } from '../../src/providers/registry.js';
import { startMockApi, startMockIdp, type MockServer } from '../helpers/mock-servers.js';
import { fixtureRepo } from '../helpers/repos.js';
import { startTestServer, type TestServer } from '../helpers/server.js';

/**
 * Fixture 3 signs in through a popup on another origin, like MSAL. Without a saved session the run
 * must stop with a clear explanation; after "Sign in once" the same run must work headless.
 */
let idp: MockServer;
let api: MockServer;
let server: TestServer;
let appId: string;

beforeAll(async () => {
  idp = await startMockIdp(4798);
  api = await startMockApi(4799);
  server = await startTestServer({ providers: createProviderRegistry({}, { delayMs: 5 }), signInHosts: ['127.0.0.1:4798'] });
  const folder = await fixtureRepo('ng-mock-sso');
  appId = server.services.apps.create({ name: 'Reports portal', source: { kind: 'local', path: folder }, port: 4291 }).id;
  await server.services.apps.waitForScan(appId);
});

afterAll(async () => {
  await server.app.close();
  await api.close();
  await idp.close();
});

describe('apps behind a sign-in popup', () => {
  it('stops with a clear message when no session was saved', async () => {
    expect(server.services.apps.get(appId).pages.map((page) => page.route)).toEqual(['/', '/reports']);
    const started = await server.services.runs.start(appId, { provider: 'dryrun' });
    await server.services.runs.waitFor(started.id);
    const run = server.services.runs.get(started.id);
    expect(run.status).toBe('failed');
    expect(run.message).toMatch(/sign-in is needed/);
    expect(run.message).toMatch(/Sign in once/);
    expect(run.steps.find((step) => step.id === 'baseline')?.status).toBe('failed');
  });

  it('works headless after "Sign in once", even with a session-only cookie', async () => {
    await server.services.browser.openSignIn({ url: 'http://127.0.0.1:4798/authorize?autologin=session', headless: true });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await server.services.browser.finishSignIn();

    const started = await server.services.runs.start(appId, { provider: 'dryrun' });
    await server.services.runs.waitFor(started.id);
    const run = server.services.runs.get(started.id);
    expect(run.status, run.message).toBe('done');
    expect(run.pages.every((page) => page.shots.before.desktop && page.shots.after.desktop)).toBe(true);
    expect(run.pages.find((page) => page.route === '/reports')?.apiDiff).toMatchObject({ added: [], removed: [], unchanged: 1 });
    expect(run.result?.apiUnchanged).toBe(true);
  });
});
