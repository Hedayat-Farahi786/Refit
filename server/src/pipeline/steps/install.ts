import { changedSince, headCommit, restoreFile } from '../../git/workspace.js';
import { succeeded } from '../../proc/run.js';
import { activity, exec, log, StepFailure, throwIfCancelled, type RunContext } from '../context.js';

/** Step 2: install dependencies with the scan's command, retrying once with --legacy-peer-deps. */
export async function installStep(ctx: RunContext): Promise<string> {
  activity(ctx, 'Installing dependencies. This can take a few minutes.');
  const timeoutMin = ctx.config.timeouts.installMin;
  let result = await exec(ctx, ctx.commands.install, { timeoutMin });
  throwIfCancelled(ctx);
  let usedRetry = false;
  if (!succeeded(result) && ctx.commands.installRetry) {
    log(ctx, 'warn', 'refit', `Install failed. Trying again with: ${ctx.commands.installRetry}`);
    result = await exec(ctx, ctx.commands.installRetry, { timeoutMin });
    throwIfCancelled(ctx);
    usedRetry = true;
  }
  if (!succeeded(result)) {
    throw new StepFailure(
      result.timedOut ? `Installing dependencies took longer than ${timeoutMin} minutes.` : 'Installing dependencies failed.',
      `Run "${ctx.commands.install}" in the app folder to see the full error. Common causes: a lockfile that is out of sync with package.json, a private registry that needs a login (.npmrc), or a Node version the app does not support (see the scan).`,
    );
  }

  // Installs sometimes rewrite tracked files (usually the lockfile). They must not end up in the diff.
  const head = await headCommit(ctx.paths.workspace);
  for (const change of await changedSince(ctx.paths.workspace, head)) {
    if (change.status === 'modified') {
      await restoreFile(ctx.paths.workspace, head, change.file);
      log(ctx, 'info', 'refit', `Restored ${change.file}, which the install had changed.`);
    }
  }
  return usedRetry ? 'Installed (needed --legacy-peer-deps)' : 'Installed';
}
