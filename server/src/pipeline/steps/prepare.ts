import { promises as fs } from 'node:fs';
import path from 'node:path';
import { clone, git, repoRoot, runGit } from '../../git/git.js';
import { createBranch, currentBranch, ensureCommitIdentity, excludeFromGit, headCommit } from '../../git/workspace.js';
import { succeeded } from '../../proc/run.js';
import { isDirectory, removeTree } from '../../util/fs.js';
import { dateStamp } from '../../util/time.js';
import { activity, log, StepFailure, type RunContext } from '../context.js';

export const REFIT_FOLDER = '.refit';

/** Step 1: clone the app into workspaces/<runId> and create the refit branch. The original is never touched. */
export async function prepareStep(ctx: RunContext): Promise<string> {
  activity(ctx, 'Making a safe copy of the app');
  const { workspace } = ctx.paths;
  await removeTree(workspace);
  await fs.mkdir(path.dirname(workspace), { recursive: true });

  const source = ctx.app.source;
  if (source.kind === 'local') {
    const root = await repoRoot(source.path);
    if (!root) throw new StepFailure(`${source.path} is not a git repository.`, 'Make it a git repository and commit, then scan again.');
    log(ctx, 'info', 'refit', `Cloning ${root} into the run's workspace.`);
    await clone(root, workspace, { signal: ctx.signal, timeoutMs: 10 * 60_000 });
    // Point origin at the source repo's own remote, so the branch can later be pushed there
    // and never into the developer's folder.
    const origin = await runGit(source.path, ['remote', 'get-url', 'origin']);
    if (succeeded(origin) && origin.stdout.trim()) await git(workspace, ['remote', 'set-url', 'origin', origin.stdout.trim()]);
    else await git(workspace, ['remote', 'remove', 'origin']);
  } else {
    log(ctx, 'info', 'refit', `Cloning ${source.url} into the run's workspace.`);
    await clone(source.url, workspace, { signal: ctx.signal, timeoutMs: 15 * 60_000 });
  }

  if (!(await isDirectory(ctx.paths.appFolder))) {
    throw new StepFailure(`The app folder "${ctx.appDir}" is missing in the copy.`, 'Scan the app again; its folder may have moved.');
  }

  const baseBranch = (await currentBranch(workspace)) ?? 'HEAD';
  const baseCommit = await headCommit(workspace);
  const branch = `refit/modernize-${dateStamp()}-${ctx.runId}`;
  await createBranch(workspace, branch);
  await excludeFromGit(workspace, `${REFIT_FOLDER}/`);
  await ensureCommitIdentity(workspace);

  ctx.facts.branch = branch;
  ctx.facts.baseBranch = baseBranch;
  ctx.facts.baseCommit = baseCommit;
  ctx.emit({ type: 'meta', branch, baseBranch, baseCommit, workspace });
  log(ctx, 'info', 'refit', `Working on branch ${branch} from ${baseBranch} (${baseCommit.slice(0, 8)}).`);
  return `Branch ${branch} from ${baseBranch}`;
}
