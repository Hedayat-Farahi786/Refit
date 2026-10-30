import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openPullRequest } from '../../src/git/pull-request.js';
import { gitIn, tempDir } from '../helpers/repos.js';

/** A workspace with one commit on main and a branch with one more, like a finished run. */
async function workspace(): Promise<string> {
  const dir = await tempDir('refit-pr-');
  await gitIn(dir, 'init', '-q', '-b', 'main');
  await gitIn(dir, 'config', 'user.name', 'Refit Test');
  await gitIn(dir, 'config', 'user.email', 'test@example.com');
  await gitIn(dir, 'config', 'commit.gpgsign', 'false');
  await fs.writeFile(path.join(dir, 'index.html'), '<h1>Before</h1>\n');
  await gitIn(dir, 'add', '-A');
  await gitIn(dir, 'commit', '-q', '-m', 'Initial');
  await gitIn(dir, 'checkout', '-q', '-b', 'refit/modernize-20261030-abc');
  await fs.writeFile(path.join(dir, 'index.html'), '<h1>After</h1>\n');
  await gitIn(dir, 'commit', '-q', '-am', 'refit(ui): modernize Home');
  await fs.writeFile(path.join(dir, 'report.md'), '# Report\n');
  return dir;
}

async function bareRemote(): Promise<string> {
  const dir = await tempDir('refit-remote-');
  await gitIn(dir, 'init', '-q', '--bare');
  return dir;
}

const input = (dir: string) => ({
  workspace: dir,
  branch: 'refit/modernize-20261030-abc',
  base: 'main',
  title: 'Modernize the front end',
  reportFile: path.join(dir, 'report.md'),
  description: '# Report\n',
});

describe('openPullRequest', () => {
  it('explains how to fetch the branch when the workspace has no remote', async () => {
    const dir = await workspace();
    const result = await openPullRequest({ ...input(dir), sourcePath: '/home/me/my app' });
    expect(result).toMatchObject({ host: 'none', pushed: false, created: false, description: '# Report\n' });
    expect(result.commands).toEqual(['cd "/home/me/my app"', `git fetch ${dir} refit/modernize-20261030-abc:refit/modernize-20261030-abc`]);
  });

  it('pushes the branch to any remote and says to open the pull request there', async () => {
    const dir = await workspace();
    const remote = await bareRemote();
    await gitIn(dir, 'remote', 'add', 'origin', remote);
    const result = await openPullRequest(input(dir));
    expect(result).toMatchObject({ host: 'other', pushed: true, created: false, commands: [] });
    expect(await gitIn(remote, 'branch', '--list')).toContain('refit/modernize-20261030-abc');
  });

  it('on GitHub without the gh CLI, pushes and links the compare page', async () => {
    const dir = await workspace();
    const remote = await bareRemote();
    await gitIn(dir, 'remote', 'add', 'origin', 'https://github.com/acme/portal.git');
    // Pushes go to the local bare repo; the remote still looks like GitHub.
    await gitIn(dir, 'config', `url.${remote}.pushInsteadOf`, 'https://github.com/acme/portal.git');
    const result = await openPullRequest({ ...input(dir), ghCommand: '' });
    expect(result).toMatchObject({ host: 'github', pushed: true, created: false, url: 'https://github.com/acme/portal/compare/main...refit%2Fmodernize-20261030-abc?expand=1' });
    expect(result.message).toMatch(/Branch pushed/);
  });

  it.skipIf(process.platform === 'win32')('on GitHub with the gh CLI, creates the pull request', async () => {
    const dir = await workspace();
    const remote = await bareRemote();
    await gitIn(dir, 'remote', 'add', 'origin', 'https://github.com/acme/portal.git');
    await gitIn(dir, 'config', `url.${remote}.pushInsteadOf`, 'https://github.com/acme/portal.git');
    const gh = path.join(await tempDir('refit-gh-'), 'gh');
    await fs.writeFile(gh, '#!/bin/sh\necho "$@" > "$(dirname "$0")/args.txt"\necho "https://github.com/acme/portal/pull/42"\n', { mode: 0o755 });
    const result = await openPullRequest({ ...input(dir), ghCommand: gh });
    expect(result).toMatchObject({ host: 'github', pushed: true, created: true, url: 'https://github.com/acme/portal/pull/42' });
    const args = await fs.readFile(path.join(path.dirname(gh), 'args.txt'), 'utf8');
    expect(args).toContain('pr create --head refit/modernize-20261030-abc --base main --title Modernize the front end --body-file');
  });

  it('gives the commands to run by hand when the push fails', async () => {
    const dir = await workspace();
    await gitIn(dir, 'remote', 'add', 'origin', 'https://dev.azure.com/acme/Portal/_git/portal');
    await gitIn(dir, 'config', 'url./nonexistent/refit-remote.pushInsteadOf', 'https://dev.azure.com/acme/Portal/_git/portal');
    const result = await openPullRequest(input(dir));
    expect(result).toMatchObject({ host: 'azure-devops', pushed: false, created: false });
    expect(result.message).toMatch(/^Pushing the branch failed/);
    expect(result.commands).toEqual([`cd ${dir}`, 'git push -u origin refit/modernize-20261030-abc']);
    expect(result.url).toBe('https://dev.azure.com/acme/Portal/_git/portal/pullrequestcreate?sourceRef=refit%2Fmodernize-20261030-abc&targetRef=main');
  });
});
