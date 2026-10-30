import { promises as fs } from 'node:fs';
import path from 'node:path';
import { git, runGit } from './git.js';
import { succeeded } from '../proc/run.js';

/** Git operations on a run's workspace clone. Paths are repo-relative with forward slashes. */

export interface ChangedPath {
  file: string;
  status: 'added' | 'modified' | 'deleted';
}

export async function headCommit(repo: string): Promise<string> {
  return git(repo, ['rev-parse', 'HEAD']);
}

export async function currentBranch(repo: string): Promise<string | null> {
  const result = await runGit(repo, ['symbolic-ref', '--short', '-q', 'HEAD']);
  return succeeded(result) && result.stdout.trim() ? result.stdout.trim() : null;
}

export async function createBranch(repo: string, branch: string): Promise<void> {
  await git(repo, ['checkout', '-q', '-b', branch]);
}

/** Keeps Refit's own working folder (.refit/) out of every commit and diff. */
/**
 * Turns all commits after `base` into one commit with this message (the changes stay the same).
 * Returns the new commit, or null when there is nothing to commit.
 */
export async function squashSince(repo: string, base: string, message: string): Promise<string | null> {
  await git(repo, ['reset', '--soft', base]);
  return commitAll(repo, message);
}

export async function excludeFromGit(repo: string, pattern: string): Promise<void> {
  const exclude = path.join(repo, '.git', 'info', 'exclude');
  await fs.mkdir(path.dirname(exclude), { recursive: true });
  let current = '';
  try {
    current = await fs.readFile(exclude, 'utf8');
  } catch {
    // no exclude file yet
  }
  if (!current.split(/\r?\n/).includes(pattern)) {
    await fs.writeFile(exclude, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${pattern}\n`);
  }
}

/** Makes sure commits work even when the developer has no global git identity. */
export async function ensureCommitIdentity(repo: string): Promise<void> {
  const name = await runGit(repo, ['config', 'user.name']);
  const email = await runGit(repo, ['config', 'user.email']);
  if (!succeeded(name) || !name.stdout.trim()) await git(repo, ['config', 'user.name', 'Refit']);
  if (!succeeded(email) || !email.stdout.trim()) await git(repo, ['config', 'user.email', 'refit@localhost']);
}

/**
 * Every file that differs from `since`: committed, staged, unstaged and untracked (not ignored).
 * Renames are reported as a delete plus an add so each path can be judged on its own.
 */
export async function changedSince(repo: string, since: string): Promise<ChangedPath[]> {
  const changes = new Map<string, ChangedPath['status']>();
  const diff = await git(repo, ['diff', '--name-status', '--no-renames', '-z', since]);
  const parts = diff.split('\0').filter(Boolean);
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const code = parts[i]!;
    const file = parts[i + 1]!;
    changes.set(file, code.startsWith('A') ? 'added' : code.startsWith('D') ? 'deleted' : 'modified');
  }
  const untracked = await git(repo, ['ls-files', '--others', '--exclude-standard', '-z']);
  for (const file of untracked.split('\0').filter(Boolean)) changes.set(file, 'added');
  return [...changes.entries()].map(([file, status]) => ({ file, status })).sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Ignored files in the working tree that match `isInteresting` (for example a new .env.local).
 * Ignored folders such as node_modules are reported as one entry and skipped, never expanded.
 */
export async function ignoredFiles(repo: string, isInteresting: (file: string) => boolean): Promise<string[]> {
  const output = await git(repo, ['status', '--porcelain', '--ignored', '--untracked-files=normal', '-z']);
  return output
    .split('\0')
    .filter((entry) => entry.startsWith('!! '))
    .map((entry) => entry.slice(3))
    .filter((file) => !file.endsWith('/') && isInteresting(file));
}

/** Puts a file back to its content at `commit`, or deletes it when it did not exist then. */
export async function restoreFile(repo: string, commit: string, file: string): Promise<'restored' | 'deleted'> {
  const existed = succeeded(await runGit(repo, ['cat-file', '-e', `${commit}:${file}`]));
  if (existed) {
    await git(repo, ['checkout', commit, '--', file]);
    return 'restored';
  }
  await runGit(repo, ['rm', '-q', '--cached', '--ignore-unmatch', '--', file]);
  await fs.rm(path.join(repo, ...file.split('/')), { force: true });
  return 'deleted';
}

/** Throws away everything since `commit`: tracked changes and new untracked files (ignored ones stay). */
export async function resetHard(repo: string, commit: string): Promise<void> {
  await git(repo, ['reset', '-q', '--hard', commit]);
  await git(repo, ['clean', '-q', '-fd']);
}

/** Stages everything (except ignored files) and commits. Returns the new commit, or null when nothing changed. */
export async function commitAll(repo: string, message: string): Promise<string | null> {
  await git(repo, ['add', '-A']);
  const staged = await runGit(repo, ['diff', '--cached', '--quiet']);
  if (staged.code === 0) return null;
  await git(repo, ['commit', '-q', '--no-verify', '-m', message]);
  return headCommit(repo);
}

/** Unified diff of one file between `base` and the working tree. */
export async function fileDiff(repo: string, base: string, file: string): Promise<string> {
  const tracked = await git(repo, ['diff', '--no-color', '--no-ext-diff', base, '--', file]);
  if (tracked) return tracked;
  // A new untracked file: show it as added.
  const untracked = await runGit(repo, ['diff', '--no-color', '--no-index', '--', process.platform === 'win32' ? 'NUL' : '/dev/null', file]);
  return untracked.stdout;
}
