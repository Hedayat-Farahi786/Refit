import semver from 'semver';
import type { RepoContext } from '../types.js';
import { allDependencies } from '../repo.js';

/**
 * Node versions each Angular major supports, from https://angular.dev/reference/versions
 * (latest minor of each major; checked 2026-10-29).
 */
export const ANGULAR_NODE_SUPPORT: Readonly<Record<number, string>> = {
  22: '^22.22.3 || ^24.15.0 || ^26.0.0',
  21: '^20.19.0 || ^22.12.0 || ^24.0.0',
  20: '^20.19.0 || ^22.12.0 || ^24.0.0',
  19: '^18.19.1 || ^20.11.1 || ^22.0.0',
  18: '^18.19.1 || ^20.11.1 || ^22.0.0',
  17: '^18.13.0 || ^20.9.0',
  16: '^16.14.0 || ^18.10.0',
  15: '^14.20.0 || ^16.13.0 || ^18.10.0',
  14: '^14.15.0 || ^16.10.0',
  13: '^12.20.0 || ^14.15.0 || ^16.10.0',
  12: '^12.14.0 || ^14.15.0',
  11: '^10.13.0 || ^12.11.0',
  10: '^10.13.0 || ^12.11.0',
  9: '^10.13.0 || ^12.11.0',
  8: '^10.9.0',
  7: '^8.9.0 || ^10.9.0',
  6: '^8.9.0',
};

export interface AngularVersion {
  version: string | null;
  major: number | null;
  source: 'lockfile' | 'package.json' | null;
  /** The range written in package.json, e.g. "^17.3.0". */
  declared: string | null;
}

export async function resolveAngularVersion(repo: RepoContext): Promise<AngularVersion> {
  const declared = allDependencies(repo.packageJson)['@angular/core'] ?? null;
  const fromLock = await versionFromLockfile(repo, '@angular/core');
  if (fromLock) return { version: fromLock, major: semver.major(fromLock), source: 'lockfile', declared };
  if (declared) {
    const min = safeMinVersion(declared);
    if (min) return { version: min, major: semver.major(min), source: 'package.json', declared };
  }
  return { version: null, major: null, source: null, declared };
}

function safeMinVersion(range: string): string | null {
  try {
    return semver.minVersion(range)?.version ?? null;
  } catch {
    return null;
  }
}

/** Version of an installed package according to the lockfile, or null. */
export async function versionFromLockfile(repo: RepoContext, name: string): Promise<string | null> {
  const lock = repo.lockfile;
  if (!lock) return null;
  if (lock.kind === 'npm') {
    const json = await repo.readJson<{
      packages?: Record<string, { version?: string }>;
      dependencies?: Record<string, { version?: string }>;
    }>(lock.path);
    const version = json?.packages?.[`node_modules/${name}`]?.version ?? json?.dependencies?.[name]?.version;
    return version && semver.valid(version) ? version : null;
  }
  const text = await repo.readText(lock.path);
  if (!text) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  if (lock.kind === 'yarn') {
    // "@angular/core@^17.0.0", "@angular/core@~17.1.0":\n  version "17.3.12"
    const match = new RegExp(`^"?${escaped}@[^\\n]*:\\n\\s+version:?\\s+"?([0-9][^"\\s]*)"?`, 'm').exec(text);
    return match?.[1] && semver.valid(match[1]) ? match[1] : null;
  }
  // pnpm v6+: "/@angular/core@17.3.12:" or "'@angular/core@17.3.12':" or importer "version: 17.3.12(...)"
  const keyed = new RegExp(`['"/]?${escaped}@(\\d+\\.\\d+\\.\\d+[^'":(\\s]*)`).exec(text);
  if (keyed?.[1] && semver.valid(keyed[1])) return keyed[1];
  const importer = new RegExp(`${escaped}['"]?:\\n\\s+specifier:[^\\n]*\\n\\s+version:\\s*(\\d+\\.\\d+\\.\\d+)`).exec(text);
  return importer?.[1] ?? null;
}

export interface NodeCompatibility {
  supported: string | null;
  ok: boolean;
  /** "newer" when the Node is newer than Angular was tested with; "older" when it is too old. */
  mismatch: 'newer' | 'older' | null;
  /** Best Node major to install when there is a mismatch. */
  recommendedMajor: number | null;
}

export function nodeCompatibility(angularMajor: number | null, nodeVersion: string): NodeCompatibility {
  const supported = angularMajor === null ? null : (ANGULAR_NODE_SUPPORT[angularMajor] ?? null);
  if (!supported) return { supported: null, ok: true, mismatch: null, recommendedMajor: null };
  const clean = semver.coerce(nodeVersion)?.version ?? nodeVersion;
  if (semver.satisfies(clean, supported)) return { supported, ok: true, mismatch: null, recommendedMajor: null };
  const majors = supported
    .split('||')
    .map((part) => semver.minVersion(part.trim())?.major)
    .filter((major): major is number => typeof major === 'number');
  const highest = Math.max(...majors);
  const mismatch = semver.gtr(clean, supported) ? 'newer' : 'older';
  return { supported, ok: false, mismatch, recommendedMajor: Number.isFinite(highest) ? highest : null };
}
