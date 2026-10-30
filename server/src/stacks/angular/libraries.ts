import semver from 'semver';
import { allDependencies } from '../repo.js';
import type { RepoContext } from '../types.js';
import type { AngularWorkspace } from './workspace.js';

interface LibraryRule {
  label: string;
  packages: Array<string | RegExp>;
  /** Also detected from a stylesheet or CDN link with this name. */
  css?: RegExp;
}

const RULES: LibraryRule[] = [
  { label: 'Angular Material', packages: ['@angular/material'] },
  { label: 'Bootstrap', packages: ['bootstrap'], css: /bootstrap(\.min)?\.css|bootstrap\/scss|bootstrap\/dist/i },
  { label: 'ngx-bootstrap', packages: ['ngx-bootstrap'] },
  { label: 'ng-bootstrap', packages: ['@ng-bootstrap/ng-bootstrap'] },
  { label: 'PrimeNG', packages: ['primeng'] },
  { label: 'Tailwind CSS', packages: ['tailwindcss'] },
  { label: 'Kendo UI', packages: [/^@progress\/kendo-angular-/] },
  { label: 'NG-ZORRO', packages: ['ng-zorro-antd'] },
  { label: 'Clarity', packages: ['@clr/angular'] },
  { label: 'Angular Flex Layout', packages: ['@angular/flex-layout'] },
  { label: 'Font Awesome', packages: ['font-awesome', /^@fortawesome\//], css: /font-awesome/i },
];

export interface LibraryReport {
  libraries: string[];
  primengVersion: string | null;
  msal: boolean;
  otherAuth: string[];
  nodeSass: boolean;
  ssr: boolean;
}

export async function detectLibraries(repo: RepoContext, workspace: AngularWorkspace): Promise<LibraryReport> {
  const deps = allDependencies(repo.packageJson);
  const names = Object.keys(deps);
  const styleText = [...workspace.styles, (workspace.index ? await repo.readText(workspace.index) : '') ?? ''].join('\n');
  const libraries: string[] = [];
  for (const rule of RULES) {
    const inDeps = rule.packages.some((pkg) => (typeof pkg === 'string' ? pkg in deps : names.some((name) => pkg.test(name))));
    if (inDeps || (rule.css && rule.css.test(styleText))) libraries.push(rule.label);
  }

  const primengRange = deps['primeng'];
  let primengVersion: string | null = null;
  if (primengRange) {
    try {
      primengVersion = semver.minVersion(primengRange)?.version ?? null;
    } catch {
      primengVersion = null;
    }
    const index = libraries.indexOf('PrimeNG');
    if (index !== -1 && primengVersion) libraries[index] = `PrimeNG ${semver.major(primengVersion)}`;
  }

  if (await hasCustomCss(repo, workspace)) libraries.push('Custom CSS');

  const otherAuth = ['angular-oauth2-oidc', 'angular-auth-oidc-client', 'keycloak-angular', '@auth0/auth0-angular'].filter((pkg) => pkg in deps);
  return {
    libraries,
    primengVersion,
    msal: '@azure/msal-angular' in deps || '@azure/msal-browser' in deps,
    otherAuth,
    nodeSass: 'node-sass' in deps,
    ssr: '@angular/ssr' in deps || '@nguniversal/express-engine' in deps,
  };
}

/** True when the app has a meaningful amount of its own CSS (more than a few small files). */
async function hasCustomCss(repo: RepoContext, workspace: AngularWorkspace): Promise<boolean> {
  const styleFiles = repo.files.filter(
    (file) => file.startsWith(`${workspace.sourceRoot}/`) && /\.(css|scss|sass|less)$/.test(file),
  );
  let lines = 0;
  for (const file of styleFiles.slice(0, 400)) {
    const text = await repo.readText(file);
    if (text) lines += text.split('\n').filter((line) => line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('@import')).length;
    if (lines > 150) return true;
  }
  return false;
}
