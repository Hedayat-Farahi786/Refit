import { promises as fs } from 'node:fs';
import path from 'node:path';
import semver from 'semver';
import type { RunContext } from '../context.js';

interface PackageJson {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

async function readJson(file: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

/** The app's dependencies and devDependencies as written in its package.json right now. */
export async function appDependencies(ctx: RunContext): Promise<Record<string, string>> {
  const pkg = await readJson(path.join(ctx.paths.appFolder, 'package.json'));
  return { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
}

/**
 * The installed version of a package: from node_modules (in the app folder or, for workspaces,
 * the repo root), falling back to the lowest version package.json allows.
 */
export async function installedVersion(ctx: RunContext, name: string): Promise<string | null> {
  for (const root of [ctx.paths.appFolder, ctx.paths.workspace]) {
    const pkg = await readJson(path.join(root, 'node_modules', ...name.split('/'), 'package.json'));
    if (pkg?.version) return pkg.version;
  }
  const declared = (await appDependencies(ctx))[name];
  try {
    return declared ? (semver.minVersion(declared)?.version ?? null) : null;
  } catch {
    return null;
  }
}

export async function installedMajor(ctx: RunContext, name: string): Promise<number | null> {
  const version = await installedVersion(ctx, name);
  return version ? semver.major(version) : null;
}

/** The command that adds exact package versions with the app's package manager. */
export function addPackagesCommand(manager: 'npm' | 'yarn' | 'pnpm', specs: readonly string[]): string {
  const list = specs.join(' ');
  if (manager === 'yarn') return `yarn add --exact ${list}`;
  if (manager === 'pnpm') return `pnpm add --save-exact ${list}`;
  return `npm install --save-exact ${list}`;
}
