import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppRecord, GitInfo } from '@refit/shared';
import { clone, countUncommitted, gitInfo, GitError, listTrackedFiles, repoRoot } from '../git/git.js';
import { UserError } from '../util/errors.js';
import { isDirectory, removeTree, walkFiles } from '../util/fs.js';

export interface Snapshot {
  /** Folder with the repo as of its last commit (or the original folder when it is not a git repo). */
  repoDir: string;
  /** The app's folder relative to the repo root ("" for the whole repo). */
  appDir: string;
  /** Files of the app folder, relative to the app folder. */
  files: string[];
  git: GitInfo;
  /** Uncommitted or untracked files in the original folder (local sources only). */
  uncommitted: number;
}

/**
 * Makes a read-only copy of the app's last commit in data/sources/<appId> so scans and agent
 * reviews never touch the user's folder and see exactly what a run will modernize.
 */
export async function takeSnapshot(app: AppRecord, sourcesDir: string, signal?: AbortSignal): Promise<Snapshot> {
  const target = path.join(sourcesDir, app.id);
  if (app.source.kind === 'local') return snapshotLocal(app.source.path, target, signal);
  return snapshotGit(app.source.url, app.source.subdir ?? '', target, signal);
}

async function snapshotLocal(folder: string, target: string, signal?: AbortSignal): Promise<Snapshot> {
  const absolute = path.resolve(folder);
  if (!(await isDirectory(absolute))) {
    throw new UserError(`The folder ${absolute} does not exist or is not a folder.`, 'Check the path in the app settings, or remove the app and add it again.');
  }
  const root = await repoRoot(absolute);
  if (!root) {
    // Not a git repo: scan the folder in place (read-only). Modernizing it is blocked by a finding.
    return { repoDir: absolute, appDir: '', files: await walkFiles(absolute), git: { isRepo: false }, uncommitted: 0 };
  }
  // Compare real paths: git reports /private/var/... on macOS where the user typed /var/...,
  // and long names on Windows where the path may contain 8.3 short names like RUNNER~1.
  const appDir = path.relative(await fs.realpath(root), await fs.realpath(absolute)).split(path.sep).join('/');
  if (appDir.startsWith('..')) {
    throw new UserError(`Refit could not work out where ${absolute} sits inside its git repository.`, 'Add the app using the path of the repository folder itself.');
  }
  const [git, uncommitted] = await Promise.all([gitInfo(absolute), countUncommitted(absolute)]);
  if (!git.commit) {
    throw new UserError('The git repository has no commits yet.', 'Commit the app first (git add -A && git commit -m "Initial commit"), then scan again.');
  }
  await removeTree(target);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await clone(root, target, { timeoutMs: 5 * 60_000, ...(signal ? { signal } : {}) });
  return { repoDir: target, appDir, files: await appFiles(target, appDir), git, uncommitted };
}

async function snapshotGit(url: string, subdir: string, target: string, signal?: AbortSignal): Promise<Snapshot> {
  await removeTree(target);
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await clone(url, target, { depth: 1, timeoutMs: 10 * 60_000, ...(signal ? { signal } : {}) });
  } catch (error) {
    if (error instanceof GitError) {
      throw new UserError(
        `Could not clone ${url}.`,
        'Check the URL and that you can clone it in a terminal (git clone <url>). For private repos, sign in with your git credential manager first.',
      );
    }
    throw error;
  }
  const appDir = subdir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (appDir && !(await isDirectory(path.join(target, appDir)))) {
    throw new UserError(`The folder "${appDir}" does not exist in the repository.`, 'Correct the app folder in the app settings, or leave it empty for the repo root.');
  }
  const git = await gitInfo(target);
  return { repoDir: target, appDir, files: await appFiles(target, appDir), git, uncommitted: 0 };
}

async function appFiles(repoDir: string, appDir: string): Promise<string[]> {
  const tracked = await listTrackedFiles(repoDir);
  if (!appDir) return tracked;
  const prefix = `${appDir}/`;
  return tracked.filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length));
}

/** Absolute path of the app folder inside a snapshot. */
export function appFolder(snapshot: Pick<Snapshot, 'repoDir' | 'appDir'>): string {
  return snapshot.appDir ? path.join(snapshot.repoDir, ...snapshot.appDir.split('/')) : snapshot.repoDir;
}
