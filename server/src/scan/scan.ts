import path from 'node:path';
import type { AppRecord, Fact, ScanResult } from '@refit/shared';
import { IS_WINDOWS, childEnv } from '../proc/env.js';
import { runProcess, succeeded } from '../proc/run.js';
import { pickAdapter } from '../stacks/registry.js';
import { createRepoContext } from '../stacks/repo.js';
import type { StackScan } from '../stacks/types.js';
import { UserError } from '../util/errors.js';
import { genericFindings, sortFindings } from './findings.js';
import { appFolder, takeSnapshot } from './snapshot.js';

export interface ScanOptions {
  sourcesDir: string;
  targetAngularMajor: number;
  signal?: AbortSignal;
}

/** Scans an app: free, deterministic and read-only. Never touches the user's folder. */
export async function scanApp(app: AppRecord, options: ScanOptions): Promise<ScanResult> {
  const started = Date.now();
  const snapshot = await takeSnapshot(app, options.sourcesDir, options.signal);
  const repo = await createRepoContext(appFolder(snapshot), snapshot.files);
  const nodeDir = app.overrides.nodeDir?.trim();
  const nodeVersion = nodeDir ? await nodeVersionIn(nodeDir) : process.versions.node;
  const packageManagerAvailable = repo.packageManager === 'npm' || (await commandAvailable(repo.packageManager, nodeDir));

  const adapter = pickAdapter(repo);
  const stack: StackScan = adapter
    ? await adapter.scan(repo, {
        port: app.port,
        nodeVersion,
        customNode: Boolean(nodeDir),
        targetAngularMajor: options.targetAngularMajor,
      })
    : emptyStackScan();

  const findings = sortFindings([
    ...genericFindings(app, snapshot, repo, adapter?.id ?? null, packageManagerAvailable),
    ...stack.findings,
  ]);

  const facts: Fact[] = [...stack.facts];
  facts.push({ label: 'Package manager', value: repo.lockfile ? `${repo.packageManager} (${repo.lockfile.path})` : `${repo.packageManager} (no lockfile)` });
  if (snapshot.git.commit) {
    facts.push({ label: 'Source', value: `${snapshot.git.branch ?? 'detached'} @ ${snapshot.git.commit.slice(0, 8)}` });
  }
  if (snapshot.appDir) facts.push({ label: 'App folder', value: snapshot.appDir });

  return {
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    appDir: snapshot.appDir,
    stack: adapter?.id ?? null,
    git: snapshot.git,
    packageManager: repo.packageManager,
    lockfile: repo.lockfile?.path ?? null,
    scripts: repo.packageJson?.scripts ?? {},
    uiLibraries: stack.uiLibraries,
    msal: stack.msal,
    counts: { ...stack.counts, pages: stack.pages.length, sourceFiles: snapshot.files.length },
    node: { current: nodeVersion, ...stack.node },
    ...(stack.angular ? { angular: stack.angular } : {}),
    facts,
    pages: stack.pages,
    findings,
    commands: stack.commands,
  };
}

function emptyStackScan(): StackScan {
  return {
    facts: [],
    pages: [],
    findings: [],
    commands: { install: 'npm install', build: 'npm run build', serve: 'npm start -- --port {port}', env: {} },
    uiLibraries: [],
    msal: false,
    counts: { components: 0, specs: 0 },
    node: { supported: null, ok: true },
  };
}

/** Version of the `node` in a folder, e.g. "18.20.4". */
export async function nodeVersionIn(nodeDir: string): Promise<string> {
  const executable = path.join(nodeDir, IS_WINDOWS ? 'node.exe' : 'node');
  const result = await runProcess({ command: executable, args: ['--version'], cwd: nodeDir, timeoutMs: 15_000 });
  if (!succeeded(result)) {
    throw new UserError(
      `There is no working node in ${nodeDir}.`,
      IS_WINDOWS
        ? 'Choose the folder that contains node.exe, for example C:\\Users\\you\\AppData\\Local\\nvm\\v18.20.4.'
        : 'Choose the folder that contains the node executable, for example ~/.nvm/versions/node/v18.20.4/bin.',
    );
  }
  return result.stdout.trim().replace(/^v/, '');
}

async function commandAvailable(command: string, nodeDir?: string): Promise<boolean> {
  const result = await runProcess({ command: `${command} --version`, shell: true, cwd: process.cwd(), env: childEnv({}, nodeDir), timeoutMs: 20_000 });
  return succeeded(result);
}
