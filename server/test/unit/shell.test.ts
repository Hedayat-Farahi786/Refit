import { describe, expect, it } from 'vitest';
import { findAppShell } from '../../src/stacks/angular/shell.js';
import type { AngularWorkspace } from '../../src/stacks/angular/workspace.js';
import type { RepoContext } from '../../src/stacks/types.js';

function memoryRepo(files: Record<string, string>): RepoContext {
  return {
    root: '/repo',
    files: Object.keys(files),
    hasFile: (file) => file in files,
    readText: async (file) => files[file] ?? null,
    readJson: async () => null,
    packageJson: null,
    lockfile: null,
    packageManager: 'npm',
  };
}

const workspace = (styles: string[]): AngularWorkspace =>
  ({ project: 'demo', projectCount: 1, sourceRoot: 'src', main: 'src/main.ts', index: 'src/index.html', styles, buildBuilder: null, testBuilder: null, baseHref: null }) as unknown as AngularWorkspace;

describe('findAppShell', () => {
  it('finds layout parts by name, but not pages, services or routing', async () => {
    const repo = memoryRepo({
      'src/main.ts': "import { App } from './app/app';\nbootstrapApplication(App, { providers: [] });",
      'src/app/app.ts': '',
      'src/app/app.html': '',
      'src/app/layout/header/header.component.ts': '',
      'src/app/layout/header/header.component.html': '',
      'src/app/shared/footer.component.ts': '',
      'src/app/core/nav.service.ts': '',
      'src/app/app-routing.module.ts': '',
      'src/app/pages/orders/orders-menu/orders-menu.component.ts': '',
      'src/app/layout/header/header.component.spec.ts': '',
      'src/styles.css': '',
    });
    const shell = await findAppShell(repo, workspace(['@angular/material/prebuilt-themes/azure-blue.css', 'src/styles.css']));
    expect(shell.stylesFile).toBe('src/styles.css');
    // An inline config object: providers go into main.ts itself.
    expect(shell.providersFile).toBe('src/main.ts');
    expect(shell.shellFiles).toEqual([
      'src/app/app.ts',
      'src/app/app.html',
      'src/app/layout/header/header.component.ts',
      'src/app/layout/header/header.component.html',
      'src/app/shared/footer.component.ts',
    ]);
  });

  it('copes with an app it cannot read', async () => {
    const shell = await findAppShell(memoryRepo({}), workspace([]));
    expect(shell).toEqual({ stylesFile: null, providersFile: null, shellFiles: [] });
  });
});
