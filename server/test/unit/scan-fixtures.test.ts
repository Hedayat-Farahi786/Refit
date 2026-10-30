import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AppRecord } from '@refit/shared';
import { scanApp } from '../../src/scan/scan.js';
import { fixtureRepo, tempDir } from '../helpers/repos.js';

function appFor(folder: string): AppRecord {
  return {
    id: 'test-app',
    name: 'Test',
    source: { kind: 'local', path: folder },
    port: 4200,
    createdAt: '',
    updatedAt: '',
    scanState: { status: 'idle' },
    pages: [],
    overrides: {},
    findings: [],
    readiness: null,
  };
}

describe('scanApp on the fixture apps', () => {
  it('scans ng-modern-bootstrap: Angular 21, standalone, Bootstrap, four pages', async () => {
    const folder = await fixtureRepo('ng-modern-bootstrap');
    const scan = await scanApp(appFor(folder), { sourcesDir: await tempDir(), targetAngularMajor: 21 });

    expect(scan.stack).toBe('angular');
    expect(scan.angular).toMatchObject({ major: 21, bootstrap: 'standalone', hashRouting: false, sourceRoot: 'src' });
    expect(scan.uiLibraries).toContain('Bootstrap');
    expect(scan.msal).toBe(false);
    expect(scan.git).toMatchObject({ isRepo: true, branch: 'main', dirty: false });
    expect(scan.lockfile).toBe('package-lock.json');
    expect(scan.commands).toMatchObject({ install: 'npm ci', build: 'npm run build', serve: 'npx ng serve --port {port}' });
    expect(scan.pages.map((page) => [page.route, page.name])).toEqual([
      ['/', 'Dashboard'],
      ['/requests', 'Requests'],
      ['/requests/:id', 'Request details'],
      ['/requests/new', 'New request'],
    ]);
    expect(scan.pages[1]).toMatchObject({
      componentFile: 'src/app/pages/request-list/request-list.component.ts',
      templateFile: 'src/app/pages/request-list/request-list.component.html',
      styleFiles: ['src/app/pages/request-list/request-list.component.scss'],
    });
    expect(scan.counts.components).toBe(5);
    expect(scan.findings.map((finding) => finding.id)).toEqual(['no-remote', 'no-tests']);
  });

  it('scans ng-17-material: NgModule, lazy admin module, Angular Material, upgrade needed', async () => {
    const folder = await fixtureRepo('ng-17-material');
    const scan = await scanApp(appFor(folder), { sourcesDir: await tempDir(), targetAngularMajor: 21 });

    expect(scan.angular).toMatchObject({ major: 17, bootstrap: 'ngmodule' });
    expect(scan.uiLibraries).toEqual(['Angular Material']);
    expect(scan.pages.map((page) => [page.route, page.name, page.lazy])).toEqual([
      ['/', 'Home', false],
      ['/admin', 'Admin', false],
      ['/admin/users/:id', 'Edit user', false],
      ['/products', 'Products', false],
    ]);
    expect(scan.pages.find((page) => page.route === '/')?.templateFile).toBe('src/app/home/home.component.ts');
    expect(scan.findings.map((finding) => finding.id)).toContain('needs-upgrade');
  });

  it('works on an app inside a bigger repo and warns about uncommitted changes', async () => {
    const root = await fixtureRepo('ng-modern-bootstrap', { subdir: 'ClientApp' });
    await fs.writeFile(path.join(root, 'ClientApp', 'src', 'new-file.ts'), 'export const x = 1;\n');
    const scan = await scanApp(appFor(path.join(root, 'ClientApp')), { sourcesDir: await tempDir(), targetAngularMajor: 21 });
    expect(scan.appDir).toBe('ClientApp');
    expect(scan.pages).toHaveLength(4);
    expect(scan.findings.map((finding) => finding.id)).toContain('uncommitted');
  });

  it('blocks folders that are not git repositories', async () => {
    const folder = await tempDir();
    await fs.writeFile(path.join(folder, 'package.json'), JSON.stringify({ dependencies: { '@angular/core': '^21.0.0' } }));
    const scan = await scanApp(appFor(folder), { sourcesDir: await tempDir(), targetAngularMajor: 21 });
    expect(scan.findings[0]).toMatchObject({ id: 'not-git', severity: 'block' });
  });

  it('blocks AngularJS and non-Angular apps', async () => {
    const angularJs = await tempDir();
    await fs.writeFile(path.join(angularJs, 'package.json'), JSON.stringify({ dependencies: { angular: '1.8.3' } }));
    const scanJs = await scanApp(appFor(angularJs), { sourcesDir: await tempDir(), targetAngularMajor: 21 });
    expect(scanJs.findings.map((finding) => finding.id)).toContain('angularjs');

    const react = await tempDir();
    await fs.writeFile(path.join(react, 'package.json'), JSON.stringify({ dependencies: { react: '19.0.0' } }));
    const scanReact = await scanApp(appFor(react), { sourcesDir: await tempDir(), targetAngularMajor: 21 });
    expect(scanReact.stack).toBeNull();
    expect(scanReact.findings.map((finding) => finding.id)).toContain('not-angular');
  });

  it('explains a missing folder', async () => {
    await expect(scanApp(appFor(path.join(await tempDir(), 'nope')), { sourcesDir: await tempDir(), targetAngularMajor: 21 })).rejects.toThrow(/does not exist/);
  });
});
