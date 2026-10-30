import type { PullRequestResult } from '@refit/shared';
import { describeExit, runProcess, succeeded } from '../proc/run.js';
import { childEnv } from '../proc/env.js';
import { runGit } from './git.js';
import { parseRemote, pullRequestUrl } from './remote.js';

export interface PullRequestInput {
  /** The run's clone. */
  workspace: string;
  branch: string;
  base: string;
  title: string;
  /** report.md, used as the description. */
  reportFile: string;
  description: string;
  /** For a local folder without a remote: where the branch can be fetched into. */
  sourcePath?: string;
  /** Replaces the `gh` program (tests). Empty string means "gh is not available". */
  ghCommand?: string;
}

const PUSH_TIMEOUT_MS = 5 * 60_000;

/**
 * Pushes the run's branch and opens a pull request where Refit can: `gh pr create` on GitHub,
 * the "create pull request" page elsewhere, or the exact commands to finish by hand. Never merges.
 */
export async function openPullRequest(input: PullRequestInput): Promise<PullRequestResult> {
  const at = new Date().toISOString();
  const base = { description: input.description, at, created: false };
  const quotedWorkspace = quote(input.workspace);

  const origin = await runGit(input.workspace, ['remote', 'get-url', 'origin']);
  if (!succeeded(origin) || !origin.stdout.trim()) {
    return {
      ...base,
      host: 'none',
      pushed: false,
      message: 'The app has no remote to push to, so Refit cannot open a pull request. Bring the branch into your own folder with these commands, then push it from there.',
      commands: input.sourcePath
        ? [`cd ${quote(input.sourcePath)}`, `git fetch ${quotedWorkspace} ${input.branch}:${input.branch}`]
        : [`cd ${quotedWorkspace}`, `git remote add origin <your repository URL>`, `git push -u origin ${input.branch}`],
    };
  }
  const remote = parseRemote(origin.stdout.trim());
  const host = remote.kind;
  const link = pullRequestUrl(remote, input.branch, input.base) ?? undefined;
  const manual = [`cd ${quotedWorkspace}`, `git push -u origin ${input.branch}`];

  // The user clicked "Create pull request", so a credential manager may ask them to sign in.
  const push = await runGit(input.workspace, ['push', '-u', 'origin', input.branch], { timeoutMs: PUSH_TIMEOUT_MS, env: { GCM_INTERACTIVE: undefined } });
  if (!succeeded(push)) {
    const reason = push.tail.filter((line) => !/^(To |remote: *$)/.test(line)).slice(-3).join(' ') || describeExit(push);
    return {
      ...base,
      host,
      pushed: false,
      message: `Pushing the branch failed: ${reason} Run these commands in a terminal where you are signed in to ${remote.host ?? 'the remote'}, then open the pull request.`,
      commands: manual,
      ...(link ? { url: link } : {}),
    };
  }

  if (host === 'github') {
    const gh = input.ghCommand ?? 'gh';
    if (gh) {
      const created = await runProcess({
        command: gh,
        args: ['pr', 'create', '--head', input.branch, '--base', input.base, '--title', input.title, '--body-file', input.reportFile],
        cwd: input.workspace,
        env: childEnv({ GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' }),
        timeoutMs: 120_000,
      });
      const url = created.stdout.match(/https?:\/\/\S+\/pull\/\d+/)?.[0];
      if (succeeded(created) && url) {
        return { ...base, host, pushed: true, created: true, url, message: 'Branch pushed and pull request created on GitHub.', commands: [] };
      }
      const why = created.spawnError ? 'the GitHub CLI (gh) is not installed' : `gh could not create it (${created.tail.slice(-2).join(' ') || describeExit(created)}; is "gh auth login" done?)`;
      return {
        ...base,
        host,
        pushed: true,
        message: `Branch pushed. Refit could not create the pull request because ${why}. Open the link and paste the description.`,
        commands: [],
        ...(link ? { url: link } : {}),
      };
    }
  }

  const where = host === 'azure-devops' ? 'Azure DevOps' : host === 'gitlab' ? 'GitLab' : (remote.host ?? 'your Git host');
  return {
    ...base,
    host,
    pushed: true,
    message: link ? `Branch pushed. Open the link to create the pull request in ${where}, and paste the description.` : `Branch pushed. Create the pull request in ${where} and paste the description.`,
    commands: [],
    ...(link ? { url: link } : {}),
  };
}

function quote(text: string): string {
  return /[\s"'&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}
