import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isErrnoException } from './errors.js';

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

export async function readTextIfExists(target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch (error) {
    if (isErrnoException(error) && (error.code === 'ENOENT' || error.code === 'EISDIR')) return null;
    throw error;
  }
}

export async function readJsonIfExists<T>(target: string): Promise<T | null> {
  const text = await readTextIfExists(target);
  if (text === null) return null;
  return JSON.parse(stripBom(text)) as T;
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY', 'ENOTEMPTY']);

/**
 * Writes a file atomically: write a temp file next to it, flush, then rename over the target.
 * On Windows, antivirus and indexers briefly lock files, so the rename is retried a few times.
 */
export async function writeFileAtomic(target: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  const handle = await fs.open(temp, 'w');
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(temp, target);
      return;
    } catch (error) {
      if (attempt < 8 && isErrnoException(error) && RETRYABLE.has(error.code ?? '')) {
        await delay(25 * 2 ** attempt);
        continue;
      }
      await fs.rm(temp, { force: true });
      throw error;
    }
  }
}

/** Deletes a folder tree, retrying on Windows file locks and read-only git objects. */
export async function removeTree(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 });
}

/** True when `child` is `parent` itself or inside it (after resolving both). */
export function isInside(parent: string, child: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** Converts an absolute path inside `root` to a repo-relative path with forward slashes. */
export function toRepoPath(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join('/');
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.angular', 'coverage', 'out-tsc', '.nx', 'bower_components', '.refit', 'tmp']);

/** Lists files under `root` as repo-relative POSIX paths, skipping build output and dependencies. */
export async function walkFiles(root: string, limit = 50_000): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    if (out.length >= limit) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) await visit(full);
      } else if (entry.isFile()) {
        out.push(toRepoPath(root, full));
      }
    }
  }
  await visit(root);
  return out.sort();
}
