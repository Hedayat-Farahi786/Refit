import type { GitInfo } from '@refit/shared';
import { childEnv } from '../proc/env.js';
import { describeExit, runProcess, succeeded, type ProcessResult } from '../proc/run.js';

export interface GitOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onLine?: (line: string) => void;
}

export class GitError extends Error {
  constructor(
    readonly args: string[],
    readonly result: ProcessResult,
  ) {
    const detail = result.tail.slice(-6).join('\n');
    super(`git ${args[0]} failed (${describeExit(result)})${detail ? `:\n${detail}` : ''}`);
    this.name = 'GitError';
  }
}

/** Runs git without a shell. Throws GitError when git exits with an error. */
export async function git(cwd: string, args: string[], options: GitOptions = {}): Promise<string> {
  const result = await runGit(cwd, args, options);
  if (!succeeded(result)) {
    if (result.spawnError) {
      throw new Error('Git is not installed or not on PATH. Install Git (https://git-scm.com) and restart Refit.');
    }
    throw new GitError(args, result);
  }
  return result.stdout.replace(/\s+$/, '');
}

export function runGit(cwd: string, args: string[], options: GitOptions = {}): Promise<ProcessResult> {
  return runProcess({
    command: 'git',
    args,
    cwd,
    env: childEnv({ GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' }),
    timeoutMs: options.timeoutMs ?? 120_000,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.onLine ? { onLine: (line: string) => options.onLine?.(line) } : {}),
  });
}

export async function isGitRepo(dir: string): Promise<boolean> {
  const result = await runGit(dir, ['rev-parse', '--is-inside-work-tree'], { timeoutMs: 15_000 });
  return succeeded(result) && result.stdout.trim() === 'true';
}

/** Repo root of `dir`, or null when `dir` is not inside a git work tree. */
export async function repoRoot(dir: string): Promise<string | null> {
  const result = await runGit(dir, ['rev-parse', '--show-toplevel'], { timeoutMs: 15_000 });
  return succeeded(result) ? result.stdout.trim() : null;
}

export async function gitInfo(dir: string): Promise<GitInfo> {
  if (!(await isGitRepo(dir))) return { isRepo: false };
  const [branch, commit, status, remote] = await Promise.all([
    runGit(dir, ['symbolic-ref', '--short', '-q', 'HEAD']),
    runGit(dir, ['rev-parse', '--verify', '-q', 'HEAD']),
    runGit(dir, ['status', '--porcelain', '--untracked-files=normal']),
    runGit(dir, ['remote', 'get-url', 'origin']),
  ]);
  const info: GitInfo = { isRepo: true, dirty: succeeded(status) && status.stdout.trim() !== '' };
  if (succeeded(branch) && branch.stdout.trim()) info.branch = branch.stdout.trim();
  if (succeeded(commit) && commit.stdout.trim()) info.commit = commit.stdout.trim();
  if (succeeded(remote) && remote.stdout.trim()) info.remoteUrl = remote.stdout.trim();
  return info;
}

/** Number of changed and untracked files in a work tree (for the "uncommitted changes" warning). */
export async function countUncommitted(dir: string): Promise<number> {
  const result = await runGit(dir, ['status', '--porcelain', '--untracked-files=normal']);
  if (!succeeded(result)) return 0;
  return result.stdout.split('\n').filter((line) => line.trim() !== '').length;
}

/** Tracked files as repo-relative paths with forward slashes. */
export async function listTrackedFiles(dir: string): Promise<string[]> {
  const out = await git(dir, ['ls-files', '-z'], { timeoutMs: 60_000 });
  return out.split('\0').filter(Boolean);
}

export interface CloneOptions extends GitOptions {
  depth?: number;
  branch?: string;
}

/** Clones with settings that work on Windows (long paths) and never wait for a password prompt. */
export async function clone(source: string, target: string, options: CloneOptions = {}): Promise<void> {
  const args = ['-c', 'core.longpaths=true', 'clone', '--no-tags'];
  if (options.depth) args.push('--depth', String(options.depth));
  if (options.branch) args.push('--branch', options.branch);
  args.push('--', source, target);
  await git(process.cwd(), args, { timeoutMs: options.timeoutMs ?? 10 * 60_000, ...withoutTimeout(options) });
  await git(target, ['config', 'core.longpaths', 'true']);
}

function withoutTimeout(options: GitOptions): GitOptions {
  const { timeoutMs: _ignored, ...rest } = options;
  return rest;
}
