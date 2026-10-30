import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppRecord, StateResponse } from '@refit/shared';
import { fixtureRepo } from '../helpers/repos.js';
import { startTestServer, type TestServer } from '../helpers/server.js';

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.app.close();
});

describe('local-only guard', () => {
  it('rejects requests addressed to another host name (DNS rebinding)', async () => {
    const response = await server.app.inject({ method: 'GET', url: '/api/state', headers: { host: 'evil.example.com:4700' } });
    expect(response.statusCode).toBe(403);
  });

  it('rejects state changes sent by another website', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/apps',
      headers: { host: 'localhost:4700', origin: 'https://evil.example.com', 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(response.statusCode).toBe(403);
    const crossSite = await server.app.inject({ method: 'POST', url: '/api/apps/x/scan', headers: { host: '127.0.0.1:4700', 'sec-fetch-site': 'cross-site' } });
    expect(crossSite.statusCode).toBe(403);
  });

  it('refuses plain-text bodies, which cross-site forms can send', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/apps',
      headers: { host: 'localhost:4700', 'content-type': 'text/plain' },
      payload: 'name=x',
    });
    expect(response.statusCode).toBe(415);
  });

  it('serves files only from the runs folder', async () => {
    const response = await server.app.inject({ method: 'GET', url: '/files/runs/../state.json', headers: { host: 'localhost:4700' } });
    expect([403, 404]).toContain(response.statusCode);
  });
});

describe('apps API', () => {
  it('returns the initial state with the starter brand', async () => {
    const { status, json } = await server.call('GET', '/api/state');
    const state = json as StateResponse;
    expect(status).toBe(200);
    expect(state.apps).toEqual([]);
    expect(state.brands[0]?.id).toBe('oerlikon-draft');
    expect(state.config.targetAngularMajor).toBe(21);
  });

  it('explains invalid input', async () => {
    const { status, json } = await server.call('POST', '/api/apps', { name: '', source: { kind: 'local', path: 'relative/path' }, port: 80 });
    expect(status).toBe(400);
    expect((json as { error: string }).error).toMatch(/Enter a name/);
    const relative = await server.call('POST', '/api/apps', { name: 'X', source: { kind: 'local', path: 'relative/path' }, port: 4200 });
    expect((relative.json as { error: string; fix: string })).toMatchObject({ error: 'Use the full path of the app folder.' });
    const refitPort = await server.call('POST', '/api/apps', { name: 'X', source: { kind: 'local', path: '/x' }, port: 4700 });
    expect((refitPort.json as { error: string }).error).toMatch(/used by Refit itself/);
  });

  it('adds an app, scans it in the background and updates its page list', async () => {
    const folder = await fixtureRepo('ng-modern-bootstrap');
    const created = await server.call('POST', '/api/apps', { name: 'Service desk', source: { kind: 'local', path: `"${folder}"` }, port: 4200 });
    expect(created.status).toBe(201);
    const app = created.json as AppRecord;
    expect(app.source).toEqual({ kind: 'local', path: folder });
    expect(app.scanState.status).toBe('scanning');

    await server.services.apps.waitForScan(app.id);
    const scanned = server.services.apps.get(app.id);
    expect(scanned.scanState.status).toBe('idle');
    expect(scanned.pages.map((page) => page.route)).toEqual(['/', '/requests', '/requests/:id', '/requests/new']);
    expect(scanned.findings.map((finding) => finding.id)).toContain('params-needed');
    expect(scanned.readiness).toBe('yellow');

    const pages = scanned.pages.map((page) => (page.route === '/requests/:id' ? { ...page, params: { id: '1' } } : page));
    const patched = await server.call('PATCH', `/api/apps/${app.id}`, { pages });
    expect(patched.status).toBe(200);
    expect((patched.json as AppRecord).findings.map((finding) => finding.id)).not.toContain('params-needed');
    expect((patched.json as AppRecord).readiness).toBe('green');

    const duplicate = await server.call('POST', '/api/apps', { name: 'Again', source: { kind: 'local', path: folder }, port: 4200 });
    expect(duplicate.status).toBe(409);

    const removed = await server.call('DELETE', `/api/apps/${app.id}`);
    expect(removed.status).toBe(204);
  });

  it('inspects folders for the add-app dialog', async () => {
    const folder = await fixtureRepo('ng-17-material');
    const { json } = await server.call('GET', `/api/inspect-folder?path=${encodeURIComponent(folder)}`);
    expect(json).toMatchObject({ ok: true, git: true, angular: '^17.3.0', suggestedName: 'Ng 17 material' });
    const missing = await server.call('GET', `/api/inspect-folder?path=${encodeURIComponent(`${folder}-missing`)}`);
    expect(missing.json).toMatchObject({ ok: false, message: 'This folder does not exist.' });
  });
});

describe('brands and settings API', () => {
  it('saves a valid brand and rejects an invalid one with reasons', async () => {
    const brand = { name: 'Test', status: 'approved', note: '', primary: '#0055aa', surface: 'zinc', fontFamily: 'Inter, sans-serif', fontImport: '', radius: 8 };
    const saved = await server.call('PUT', '/api/brands/test-brand', brand);
    expect(saved.status).toBe(200);
    const bad = await server.call('PUT', '/api/brands/test-brand', { ...brand, primary: 'blue' });
    expect(bad.status).toBe(400);
    expect((bad.json as { error: string }).error).toMatch(/hex color/);
    const settings = await server.call('PUT', '/api/settings', { defaultBrandId: 'test-brand' });
    expect(settings.json).toMatchObject({ defaultBrandId: 'test-brand' });
    await server.call('DELETE', '/api/brands/test-brand');
    const state = (await server.call('GET', '/api/state')).json as StateResponse;
    expect(state.settings.defaultBrandId).toBe('oerlikon-draft');
  });
});
