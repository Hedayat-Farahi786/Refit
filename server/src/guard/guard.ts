import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ChangedFile } from '@refit/shared';
import { firstMatchingGlob } from '@refit/shared';
import { runGit } from '../git/git.js';
import { changedSince, ignoredFiles, restoreFile } from '../git/workspace.js';

export interface GuardPolicy {
  /** The app's folder relative to the repo root ("" for the whole repo). */
  appDir: string;
  protectedPaths: readonly string[];
  sensitivePaths: readonly string[];
}

export interface Classification {
  protected: boolean;
  sensitive: boolean;
  /** Why the file is protected, in plain words. */
  reason?: string;
}

const DATA_ACCESS = /\bHttpClient\b|\binject\(\s*HttpClient\s*\)|\bfetch\s*\(|\bXMLHttpRequest\b|\baxios\b/;
const COMPONENT = /@Component\s*\(/;

/** Path of a repo file relative to the app folder, or null when it is outside the app folder. */
export function appRelative(file: string, appDir: string): string | null {
  if (!appDir) return file;
  return file.startsWith(`${appDir}/`) ? file.slice(appDir.length + 1) : null;
}

/** Decides from the path alone whether a changed file is protected or sensitive. */
export function classifyPath(file: string, policy: GuardPolicy): Classification {
  const relative = appRelative(file, policy.appDir);
  if (relative === null) return { protected: true, sensitive: false, reason: `outside the app folder (${policy.appDir})` };
  const protectedBy = firstMatchingGlob(relative, policy.protectedPaths) ?? (policy.appDir ? firstMatchingGlob(file, policy.protectedPaths) : undefined);
  if (protectedBy) return { protected: true, sensitive: false, reason: `matches the protected pattern "${protectedBy}"` };
  const sensitive = Boolean(firstMatchingGlob(relative, policy.sensitivePaths));
  return { protected: false, sensitive };
}

/**
 * Content rule for code that loads data. Angular 20+ apps name services without ".service.ts",
 * so a TypeScript file that talks to the backend and is not a component counts as protected.
 */
export function isDataAccessCode(file: string, content: string | null): boolean {
  if (!content || !/\.(ts|js|mjs)$/.test(file) || /\.spec\.ts$/.test(file)) return false;
  return DATA_ACCESS.test(content) && !COMPONENT.test(content);
}

export interface GuardResult {
  /** Every file that changed since the checkpoint, after reverts. */
  changed: ChangedFile[];
  reverted: Array<ChangedFile & { reason: string }>;
}

/**
 * The lock that works for every provider: after an agent task, list everything that changed since
 * the checkpoint and put protected files back exactly as they were.
 */
export async function enforceGuard(repo: string, checkpoint: string, policy: GuardPolicy): Promise<GuardResult> {
  const changes = await changedSince(repo, checkpoint);
  const changed: ChangedFile[] = [];
  const reverted: GuardResult['reverted'] = [];

  for (const change of changes) {
    let classification = classifyPath(change.file, policy);
    if (!classification.protected) {
      const before = await contentAt(repo, checkpoint, change.file);
      const after = change.status === 'deleted' ? null : await fs.readFile(path.join(repo, ...change.file.split('/')), 'utf8').catch(() => null);
      if (isDataAccessCode(change.file, before) || isDataAccessCode(change.file, after)) {
        classification = { protected: true, sensitive: false, reason: 'it contains code that calls the backend' };
      }
    }
    const entry: ChangedFile = { file: change.file, status: change.status, protected: classification.protected, sensitive: classification.sensitive };
    if (classification.protected) {
      await restoreFile(repo, checkpoint, change.file);
      entry.reverted = true;
      reverted.push({ ...entry, reason: classification.reason ?? 'it is protected' });
    }
    changed.push(entry);
  }

  // Git ignores files like .env.local, so they never show up above. A run works on a fresh clone,
  // so any such protected file that exists now was written during the run: remove it.
  const secrets = await ignoredFiles(repo, (file) => /(^|\/)\.env/.test(file) && classifyPath(file, policy).protected);
  for (const file of secrets) {
    await fs.rm(path.join(repo, ...file.split('/')), { force: true });
    const entry: ChangedFile = { file, status: 'added', protected: true, sensitive: false, reverted: true };
    changed.push(entry);
    reverted.push({ ...entry, reason: 'it is an environment file' });
  }
  return { changed, reverted };
}

async function contentAt(repo: string, commit: string, file: string): Promise<string | null> {
  const result = await runGit(repo, ['show', `${commit}:${file}`]);
  return result.code === 0 ? result.stdout : null;
}
