import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRepoContext } from '../../src/stacks/repo.js';
import type { RepoContext } from '../../src/stacks/types.js';
import { runProcess } from '../../src/proc/run.js';
import { walkFiles } from '../../src/util/fs.js';

export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
export const FIXTURES = path.join(REPO_ROOT, 'fixtures');

export async function tempDir(prefix = 'refit-test-'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/** Writes files into a fresh temp folder and returns a repo context for them. */
export async function makeRepo(files: Record<string, string>): Promise<RepoContext> {
  const root = await tempDir();
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, ...file.split('/'));
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  return createRepoContext(root, Object.keys(files).sort());
}

export async function repoFromFolder(root: string): Promise<RepoContext> {
  return createRepoContext(root, await walkFiles(root));
}

const GIT_IDENTITY = ['-c', 'user.name=Refit Test', '-c', 'user.email=refit-test@example.com', '-c', 'commit.gpgsign=false'];

export async function gitIn(cwd: string, ...args: string[]): Promise<string> {
  const result = await runProcess({ command: 'git', args: [...GIT_IDENTITY, ...args], cwd, timeoutMs: 60_000 });
  if (result.code !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.tail.join('\n')}`);
  return result.stdout.trim();
}

/** Copies a fixture app into a temp folder and makes it a git repo with one commit. */
export async function fixtureRepo(name: string, options: { subdir?: string } = {}): Promise<string> {
  const root = await tempDir(`refit-${name}-`);
  const target = options.subdir ? path.join(root, options.subdir) : root;
  await fs.cp(path.join(FIXTURES, name), target, {
    recursive: true,
    filter: (source) => !/[\\/](node_modules|dist|\.angular)([\\/]|$)/.test(source),
  });
  await gitIn(root, 'init', '-q', '-b', 'main');
  await gitIn(root, 'add', '-A');
  await gitIn(root, 'commit', '-q', '-m', 'Initial commit');
  return root;
}
