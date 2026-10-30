import semver from 'semver';
import type { CommandSet } from '@refit/shared';
import type { RepoContext } from '../types.js';
import type { AngularWorkspace } from './workspace.js';

/**
 * The commands Refit runs for an Angular app. They are plain shell commands so a developer can
 * read, copy and override each one under Advanced.
 */
export function angularCommands(repo: RepoContext, workspace: AngularWorkspace, angularMajor: number | null, nodeVersion: string, specCount: number): CommandSet {
  const scripts = repo.packageJson?.scripts ?? {};
  const pm = repo.packageManager;
  const run = (script: string) => (pm === 'npm' ? `npm run ${script}` : pm === 'yarn' ? `yarn ${script}` : `pnpm run ${script}`);

  let install: string;
  let installRetry: string | undefined;
  if (pm === 'yarn') {
    install = repo.hasFile('.yarnrc.yml') ? 'yarn install --immutable' : 'yarn install --frozen-lockfile';
  } else if (pm === 'pnpm') {
    install = 'pnpm install --frozen-lockfile';
  } else {
    install = repo.lockfile ? 'npm ci' : 'npm install';
    installRetry = `${install} --legacy-peer-deps`;
  }

  const build = scripts['build'] ? run('build') : 'npx ng build';

  const commands: CommandSet = {
    install,
    ...(installRetry ? { installRetry } : {}),
    build,
    serve: serveCommand(scripts['start']),
    env: {},
  };

  const test = testCommand(repo, workspace, pm, specCount);
  if (test) commands.test = test;

  // Angular 11 and older use webpack 4, which needs the legacy OpenSSL provider on Node 17+.
  const nodeMajor = semver.coerce(nodeVersion)?.major ?? 0;
  if (angularMajor !== null && angularMajor <= 11 && nodeMajor >= 17) {
    commands.env['NODE_OPTIONS'] = '--openssl-legacy-provider';
  }
  return commands;
}

/** Keeps the app's own `ng serve` flags (like --proxy-config) but always uses Refit's port. */
export function serveCommand(startScript: string | undefined): string {
  const match = startScript ? /(?:^|&&\s*|\s)ng\s+serve\b([^&|;]*)/.exec(startScript) : null;
  const flags = ` ${match?.[1] ?? ''} `
    .replace(/\s(?:--port|-p)(?:=|\s+)\S+(?=\s)/g, ' ')
    .replace(/\s(?:--open|-o)(?=\s)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `npx ng serve${flags ? ` ${flags}` : ''} --port {port}`;
}

function testCommand(repo: RepoContext, workspace: AngularWorkspace, pm: string, specCount: number): string | null {
  if (specCount === 0) return null;
  const script = repo.packageJson?.scripts?.['test'] ?? '';
  if (/\bjest\b/.test(script)) return pm === 'npm' ? 'npm test -- --ci' : `${pm} test --ci`;
  if (/\bvitest\b/.test(script)) return pm === 'npm' ? 'npm test -- --run' : `${pm} test --run`;
  const karma =
    repo.hasFile('karma.conf.js') ||
    repo.files.some((file) => file.endsWith('karma.conf.js')) ||
    (workspace.testBuilder ?? '').includes('karma');
  if (script.includes('ng test') || workspace.testBuilder) {
    return `npx ng test --watch=false${karma ? ' --browsers=ChromeHeadless' : ''}`;
  }
  return script ? (pm === 'npm' ? 'npm test' : `${pm} test`) : null;
}
