import { describe, expect, it } from 'vitest';
import { angularCommands, serveCommand } from '../../src/stacks/angular/commands.js';
import { nodeCompatibility, resolveAngularVersion, versionFromLockfile } from '../../src/stacks/angular/versions.js';
import { readAngularWorkspace } from '../../src/stacks/angular/workspace.js';
import { stripJsonComments } from '../../src/util/json.js';
import { makeRepo } from '../helpers/repos.js';

const pkg = (deps: Record<string, string>, scripts: Record<string, string> = {}) => JSON.stringify({ dependencies: deps, scripts });

describe('Angular version detection', () => {
  it('prefers the npm lockfile (v3 packages map)', async () => {
    const repo = await makeRepo({
      'package.json': pkg({ '@angular/core': '^17.0.0' }),
      'package-lock.json': JSON.stringify({ lockfileVersion: 3, packages: { 'node_modules/@angular/core': { version: '17.3.12' } } }),
    });
    expect(await resolveAngularVersion(repo)).toEqual({ version: '17.3.12', major: 17, source: 'lockfile', declared: '^17.0.0' });
  });

  it('reads npm lockfile v1, yarn.lock and pnpm-lock.yaml', async () => {
    const v1 = await makeRepo({ 'package.json': '{}', 'package-lock.json': JSON.stringify({ dependencies: { '@angular/core': { version: '11.2.14' } } }) });
    expect(await versionFromLockfile(v1, '@angular/core')).toBe('11.2.14');

    const yarn = await makeRepo({
      'package.json': '{}',
      'yarn.lock': '"@angular/common@^15.0.0":\n  version "15.2.1"\n\n"@angular/core@^15.0.0", "@angular/core@~15.1.0":\n  version "15.2.9"\n',
    });
    expect(await versionFromLockfile(yarn, '@angular/core')).toBe('15.2.9');

    const pnpm = await makeRepo({
      'package.json': '{}',
      'pnpm-lock.yaml': "lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      '@angular/core':\n        specifier: ^18.2.0\n        version: 18.2.13(rxjs@7.8.1)\npackages:\n  '@angular/core@18.2.13':\n    resolution: {}\n",
    });
    expect(await versionFromLockfile(pnpm, '@angular/core')).toBe('18.2.13');
  });

  it('falls back to the lowest version of the package.json range', async () => {
    const repo = await makeRepo({ 'package.json': pkg({ '@angular/core': '~16.1.3' }) });
    expect(await resolveAngularVersion(repo)).toMatchObject({ version: '16.1.3', major: 16, source: 'package.json' });
    const unknown = await makeRepo({ 'package.json': pkg({ '@angular/core': 'github:angular/core' }) });
    expect((await resolveAngularVersion(unknown)).major).toBeNull();
  });
});

describe('Node compatibility', () => {
  it('accepts supported versions', () => {
    expect(nodeCompatibility(21, '22.12.0')).toMatchObject({ ok: true, mismatch: null });
  });

  it('flags a Node that is newer than an old Angular supports and recommends the newest supported major', () => {
    expect(nodeCompatibility(15, 'v22.12.0')).toEqual({
      supported: '^14.20.0 || ^16.13.0 || ^18.10.0',
      ok: false,
      mismatch: 'newer',
      recommendedMajor: 18,
    });
  });

  it('flags a Node that is too old', () => {
    expect(nodeCompatibility(22, '22.12.0')).toMatchObject({ ok: false, mismatch: 'older', recommendedMajor: 26 });
  });

  it('says nothing for unknown Angular versions', () => {
    expect(nodeCompatibility(null, '22.12.0').ok).toBe(true);
  });
});

describe('commands', () => {
  it('uses npm ci with a lockfile and retries with --legacy-peer-deps', async () => {
    const repo = await makeRepo({ 'package.json': pkg({ '@angular/core': '^17.0.0' }, { build: 'ng build', start: 'ng serve --proxy-config proxy.conf.json --port 4300 -o' }), 'package-lock.json': '{}' });
    const commands = angularCommands(repo, await readAngularWorkspace(repo), 17, '22.12.0', 0);
    expect(commands).toEqual({
      install: 'npm ci',
      installRetry: 'npm ci --legacy-peer-deps',
      build: 'npm run build',
      serve: 'npx ng serve --proxy-config proxy.conf.json --port {port}',
      env: {},
    });
  });

  it('uses npm install without a lockfile and npx ng build without a build script', async () => {
    const repo = await makeRepo({ 'package.json': pkg({ '@angular/core': '^17.0.0' }) });
    const commands = angularCommands(repo, await readAngularWorkspace(repo), 17, '22.12.0', 0);
    expect(commands.install).toBe('npm install');
    expect(commands.build).toBe('npx ng build');
    expect(commands.serve).toBe('npx ng serve --port {port}');
  });

  it('supports yarn classic, yarn berry and pnpm', async () => {
    const yarn1 = await makeRepo({ 'package.json': pkg({}, { build: 'ng build' }), 'yarn.lock': '' });
    expect(angularCommands(yarn1, await readAngularWorkspace(yarn1), 17, '22.0.0', 0)).toMatchObject({ install: 'yarn install --frozen-lockfile', build: 'yarn build' });
    const berry = await makeRepo({ 'package.json': pkg({}), 'yarn.lock': '', '.yarnrc.yml': '' });
    expect(angularCommands(berry, await readAngularWorkspace(berry), 17, '22.0.0', 0).install).toBe('yarn install --immutable');
    const pnpm = await makeRepo({ 'package.json': pkg({}, { build: 'ng build' }), 'pnpm-lock.yaml': '' });
    expect(angularCommands(pnpm, await readAngularWorkspace(pnpm), 17, '22.0.0', 0)).toMatchObject({ install: 'pnpm install --frozen-lockfile', build: 'pnpm run build' });
  });

  it('adds the legacy OpenSSL provider for Angular 11 and older on Node 17+', async () => {
    const repo = await makeRepo({ 'package.json': pkg({}) });
    const workspace = await readAngularWorkspace(repo);
    expect(angularCommands(repo, workspace, 11, '22.12.0', 0).env).toEqual({ NODE_OPTIONS: '--openssl-legacy-provider' });
    expect(angularCommands(repo, workspace, 12, '22.12.0', 0).env).toEqual({});
    expect(angularCommands(repo, workspace, 11, '16.20.0', 0).env).toEqual({});
  });

  it('runs Karma tests headless and once', async () => {
    const repo = await makeRepo({ 'package.json': pkg({}, { test: 'ng test' }), 'karma.conf.js': '' });
    expect(angularCommands(repo, await readAngularWorkspace(repo), 17, '22.0.0', 3).test).toBe('npx ng test --watch=false --browsers=ChromeHeadless');
    const jest = await makeRepo({ 'package.json': pkg({}, { test: 'jest' }) });
    expect(angularCommands(jest, await readAngularWorkspace(jest), 17, '22.0.0', 3).test).toBe('npm test -- --ci');
    expect(angularCommands(jest, await readAngularWorkspace(jest), 17, '22.0.0', 0).test).toBeUndefined();
  });

  it('keeps ng serve flags from start scripts but always uses Refit\'s port', () => {
    expect(serveCommand('ng serve')).toBe('npx ng serve --port {port}');
    expect(serveCommand('ng serve --port=4300 --ssl')).toBe('npx ng serve --ssl --port {port}');
    expect(serveCommand('npm run env && ng serve -c local -p 4200 --open')).toBe('npx ng serve -c local --port {port}');
    expect(serveCommand('node server.js')).toBe('npx ng serve --port {port}');
    expect(serveCommand(undefined)).toBe('npx ng serve --port {port}');
  });
});

describe('angular.json', () => {
  it('reads the default application project', async () => {
    const repo = await makeRepo({
      'angular.json': JSON.stringify({
        projects: {
          lib: { projectType: 'library', root: 'projects/lib' },
          portal: { projectType: 'application', root: 'apps/portal', sourceRoot: 'apps/portal/src', architect: { build: { builder: '@angular-devkit/build-angular:browser', options: { main: 'apps/portal/src/main.ts', styles: ['node_modules/bootstrap/dist/css/bootstrap.css', { input: 'apps/portal/src/styles.scss' }] } } } },
        },
      }),
    });
    expect(await readAngularWorkspace(repo)).toMatchObject({
      project: 'portal',
      projectCount: 2,
      sourceRoot: 'apps/portal/src',
      main: 'apps/portal/src/main.ts',
      styles: ['node_modules/bootstrap/dist/css/bootstrap.css', 'apps/portal/src/styles.scss'],
      format: 'angular.json',
    });
  });

  it('recognizes the pre-6 format', async () => {
    const repo = await makeRepo({ '.angular-cli.json': '{}' });
    expect((await readAngularWorkspace(repo)).format).toBe('angular-cli-legacy');
  });

  it('strips comments and trailing commas but keeps strings', () => {
    expect(JSON.parse(stripJsonComments('{ "a": "http://x // y", /* c */ "b": [1, 2,], }'))).toEqual({ a: 'http://x // y', b: [1, 2] });
  });
});
