import { describe, expect, it } from 'vitest';
import type { Finding, PageConfig } from '@refit/shared';
import { pageFindings, readinessOf, sortFindings } from '../../src/scan/findings.js';
import { mergePages } from '../../src/scan/pages.js';
import { angularFindings, type AngularFindingInput } from '../../src/stacks/angular/findings.js';
import { nodeCompatibility } from '../../src/stacks/angular/versions.js';

const base: AngularFindingInput = {
  major: 21,
  version: '21.2.0',
  workspace: { project: 'app', projectCount: 1, sourceRoot: 'src', main: 'src/main.ts', index: 'src/index.html', styles: [], buildBuilder: null, testBuilder: null, format: 'angular.json' },
  node: nodeCompatibility(21, '22.12.0'),
  nodeVersion: '22.12.0',
  customNode: false,
  libraries: { libraries: ['Bootstrap'], primengVersion: null, msal: false, otherAuth: [], nodeSass: false, ssr: false },
  hasBuildScript: true,
  specCount: 4,
  componentCount: 12,
  pageCount: 4,
  routeWarnings: [],
  targetMajor: 21,
  port: 4200,
};

const ids = (findings: Finding[]) => findings.map((finding) => finding.id);

describe('Angular readiness rules', () => {
  it('a current, healthy app has no warnings', () => {
    const findings = angularFindings(base);
    expect(findings).toEqual([]);
    expect(readinessOf(findings)).toBe('green');
  });

  it('old Angular needs upgrade hops (yellow) and very old Angular gets an extra warning', () => {
    const findings = angularFindings({ ...base, major: 15, version: '15.2.0', node: nodeCompatibility(15, '22.12.0') });
    expect(ids(findings)).toEqual(['needs-upgrade', 'node-mismatch']);
    expect(findings[0]!.title).toBe('Angular 15 needs 6 upgrade steps');
    expect(findings[1]!.fix).toContain('nvm install 18');
    expect(readinessOf(findings)).toBe('yellow');
    expect(ids(angularFindings({ ...base, major: 10, version: '10.0.0' }))).toContain('very-old-angular');
  });

  it('blocks Angular 22+ because its PrimeNG needs a commercial license, and pre-6 workspaces', () => {
    expect(readinessOf(angularFindings({ ...base, major: 22 }))).toBe('red');
    expect(ids(angularFindings({ ...base, workspace: { ...base.workspace, format: 'angular-cli-legacy' } }))).toContain('angular-cli-legacy');
  });

  it('explains missing tests, missing build script, no pages, large apps, MSAL and node-sass', () => {
    const findings = angularFindings({
      ...base,
      specCount: 0,
      hasBuildScript: false,
      pageCount: 0,
      componentCount: 500,
      libraries: { ...base.libraries, msal: true, nodeSass: true },
    });
    expect(ids(findings)).toEqual(['node-sass', 'no-build-script', 'no-tests', 'no-pages', 'large-app', 'msal']);
    expect(findings.find((f) => f.id === 'msal')!.fix).toContain('http://localhost:4200');
    expect(readinessOf(findings)).toBe('yellow');
  });

  it('every finding explains what happened and how to fix it', () => {
    const all = angularFindings({ ...base, major: 9, specCount: 0, hasBuildScript: false, pageCount: 0, componentCount: 999, routeWarnings: ['Routes in src/app.ts are built by a function call.'], libraries: { ...base.libraries, msal: true, nodeSass: true, primengVersion: '15.0.0', ssr: true } });
    for (const finding of all) {
      expect(finding.title.length).toBeGreaterThan(5);
      expect(finding.explanation.length).toBeGreaterThan(20);
      expect(finding.fix.length).toBeGreaterThan(10);
    }
  });
});

describe('page findings', () => {
  const page = (route: string, params: Record<string, string> = {}, include = true): PageConfig => ({
    id: route,
    name: route,
    route,
    include,
    params,
    files: [],
    manual: false,
  });

  it('asks for sample values for included pages with parameters', () => {
    expect(ids(pageFindings([page('/requests/:id')]))).toEqual(['params-needed']);
    expect(pageFindings([page('/requests/:id', { id: '42' })])).toEqual([]);
    expect(pageFindings([page('/requests/:id', {}, false), page('/')])).toEqual([]);
  });

  it('warns when every page is excluded', () => {
    expect(ids(pageFindings([page('/', {}, false)]))).toEqual(['no-pages-included']);
  });

  it('sorts blocking findings first', () => {
    const sorted = sortFindings([
      { id: 'a', severity: 'info', title: '', explanation: '', fix: '' },
      { id: 'b', severity: 'block', title: '', explanation: '', fix: '' },
      { id: 'c', severity: 'warn', title: '', explanation: '', fix: '' },
    ]);
    expect(ids(sorted)).toEqual(['b', 'c', 'a']);
  });
});

describe('mergePages', () => {
  it('keeps the user\'s choices and hand-added pages across rescans', () => {
    const existing: PageConfig[] = [
      { id: 'requests-id', name: 'Request', route: '/requests/:id', include: false, params: { id: '7' }, files: [], manual: false },
      { id: 'custom', name: 'Custom', route: '/custom', include: true, params: {}, files: ['src/custom.ts'], manual: true },
      { id: 'gone', name: 'Gone', route: '/gone', include: true, params: {}, files: [], manual: false },
    ];
    const merged = mergePages(existing, [
      { id: 'requests-id', name: 'Request details', route: '/requests/:id', params: ['id'], componentFile: 'a.ts', templateFile: 'a.html', styleFiles: ['a.scss'], lazy: false },
      { id: 'home', name: 'Home', route: '/', params: [], componentFile: 'h.ts', styleFiles: [], lazy: false },
    ]);
    expect(merged).toEqual([
      { id: 'requests-id', name: 'Request', route: '/requests/:id', include: false, params: { id: '7' }, files: ['a.ts', 'a.html', 'a.scss'], componentFile: 'a.ts', manual: false },
      { id: 'home', name: 'Home', route: '/', include: true, params: {}, files: ['h.ts'], componentFile: 'h.ts', manual: false },
      existing[1],
    ]);
  });
});
