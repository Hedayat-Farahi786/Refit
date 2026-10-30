import { promises as fs } from 'node:fs';
import path from 'node:path';
import { stripBom } from '../util/fs.js';
import type { Lockfile, PackageJson, PackageManager, RepoContext } from './types.js';

const MAX_READ_BYTES = 2 * 1024 * 1024;

/** Builds a cached, read-only view of a repository from a list of its files. */
export async function createRepoContext(root: string, files: readonly string[]): Promise<RepoContext> {
  const fileSet = new Set(files.map((file) => file.toLowerCase()));
  const textCache = new Map<string, Promise<string | null>>();

  const readText = (relativePath: string): Promise<string | null> => {
    const key = relativePath.replace(/\\/g, '/');
    let cached = textCache.get(key);
    if (!cached) {
      cached = (async () => {
        const full = path.join(root, ...key.split('/'));
        try {
          const stat = await fs.stat(full);
          if (!stat.isFile() || stat.size > MAX_READ_BYTES) return null;
          return stripBom(await fs.readFile(full, 'utf8'));
        } catch {
          return null;
        }
      })();
      textCache.set(key, cached);
    }
    return cached;
  };

  const readJson = async <T>(relativePath: string): Promise<T | null> => {
    const text = await readText(relativePath);
    if (text === null) return null;
    try {
      return JSON.parse(stripJsonComments(text)) as T;
    } catch {
      return null;
    }
  };

  const hasFile = (relativePath: string) => fileSet.has(relativePath.replace(/\\/g, '/').toLowerCase());
  const packageJson = await readJson<PackageJson>('package.json');
  const lockfile = detectLockfile(hasFile);

  return {
    root,
    files,
    hasFile,
    readText,
    readJson,
    packageJson,
    lockfile,
    packageManager: detectPackageManager(lockfile, packageJson),
  };
}

function detectLockfile(hasFile: (file: string) => boolean): Lockfile | null {
  if (hasFile('package-lock.json')) return { kind: 'npm', path: 'package-lock.json' };
  if (hasFile('npm-shrinkwrap.json')) return { kind: 'npm', path: 'npm-shrinkwrap.json' };
  if (hasFile('pnpm-lock.yaml')) return { kind: 'pnpm', path: 'pnpm-lock.yaml' };
  if (hasFile('yarn.lock')) return { kind: 'yarn', path: 'yarn.lock' };
  return null;
}

function detectPackageManager(lockfile: Lockfile | null, pkg: PackageJson | null): PackageManager {
  if (lockfile) return lockfile.kind;
  const declared = pkg?.packageManager?.split('@')[0];
  return declared === 'yarn' || declared === 'pnpm' ? declared : 'npm';
}

/**
 * Removes // and /* *\/ comments and trailing commas so tsconfig.json and angular.json files
 * (which allow them) can be parsed as JSON. Strings are left untouched.
 */
export function stripJsonComments(text: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    const next = text[i + 1];
    if (inString) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        i++;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
    } else if (char === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (char === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += char;
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

export function allDependencies(pkg: PackageJson | null): Record<string, string> {
  return { ...(pkg?.devDependencies ?? {}), ...(pkg?.dependencies ?? {}) };
}
