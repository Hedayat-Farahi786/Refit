import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures');

/** Copies a fixture app into a temp folder and makes it a git repository with one commit. */
export function fixtureRepo(name: string): string {
  const folder = mkdtempSync(path.join(os.tmpdir(), `refit-e2e-${name}-`));
  cpSync(path.join(FIXTURES, name), folder, {
    recursive: true,
    filter: (source) => !/[\\/](node_modules|dist|\.angular)([\\/]|$)/.test(source),
  });
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Refit E2E', '-c', 'user.email=e2e@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd: folder, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('commit', '-q', '-m', 'Initial commit');
  return folder;
}
