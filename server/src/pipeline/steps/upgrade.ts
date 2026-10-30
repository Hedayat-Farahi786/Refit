import semver from 'semver';
import { commitAll, headCommit, resetHard } from '../../git/workspace.js';
import { succeeded } from '../../proc/run.js';
import { fixPrompt } from '../../prompts/tasks.js';
import { adapterById } from '../../stacks/registry.js';
import { runAgentTask } from '../agent.js';
import { activity, exec, log, StepFailure, throwIfCancelled, type RunContext } from '../context.js';
import { logTail, runBuild } from './build.js';
import { filesInLog, runGuard } from './guard-run.js';
import { appDependencies, installedMajor } from './packages.js';

export interface StepOutcome {
  status: 'done' | 'warn' | 'skipped';
  detail: string;
}

/**
 * Step 4: upgrade Angular one major at a time. Each hop runs the target CLI's `ng update`, builds,
 * and is committed. If a hop's build breaks, one agent fix is allowed; if it still fails, the run
 * stops and the branch keeps everything up to that point for a developer.
 */
export async function upgradeStep(ctx: RunContext): Promise<StepOutcome> {
  const target = ctx.settings.targetAngularMajor;
  const adapter = adapterById(ctx.app.scan?.stack);
  const current = (adapter ? await installedMajor(ctx, adapter.frameworkPackage) : null) ?? ctx.app.scan?.angular?.major ?? null;
  if (target === 'keep') return { status: 'skipped', detail: current !== null ? `Keeping Angular ${current}` : 'Keeping the current version' };
  if (!adapter?.upgrades) return { status: 'skipped', detail: 'Refit cannot upgrade this kind of app' };
  if (current === null) {
    throw new StepFailure('Refit could not tell which Angular version the app uses.', 'Check that @angular/core is in package.json and that the install step worked.');
  }
  if (current >= target) return { status: 'skipped', detail: `Already on Angular ${current}` };

  const upgrades = adapter.upgrades;
  const hops = upgrades.plan(current, target, await appDependencies(ctx));
  const nodeVersion = ctx.app.scan?.node.current ?? process.versions.node;
  for (const hop of hops.filter((candidate) => candidate.node !== '' && !semver.satisfies(nodeVersion, candidate.node))) {
    log(ctx, 'warn', 'refit', `Angular ${hop.to} officially supports Node ${hop.node}, and this run uses Node ${nodeVersion}. Refit tries anyway; if the update fails, set a Node folder in the app's Advanced settings.`);
  }

  for (const [index, hop] of hops.entries()) {
    throwIfCancelled(ctx);
    activity(ctx, `Upgrading Angular ${hop.from} to ${hop.to} (${index + 1} of ${hops.length})`);
    const before = await headCommit(ctx.paths.workspace);
    const command = upgrades.command(hop);
    const update = await exec(ctx, command, { timeoutMin: ctx.config.timeouts.upgradeHopMin });
    throwIfCancelled(ctx);
    if (!succeeded(update)) {
      await resetHard(ctx.paths.workspace, before);
      throw new StepFailure(
        update.timedOut ? `Updating to Angular ${hop.to} took longer than ${ctx.config.timeouts.upgradeHopMin} minutes.` : `Updating to Angular ${hop.to} failed.`,
        `The branch keeps the app on Angular ${hop.from}. Run "${command}" in the workspace to see the full error; libraries that do not support Angular ${hop.to} yet are the usual cause.`,
      );
    }
    const updated = await commitAll(ctx.paths.workspace, `refit: upgrade Angular to ${hop.to}`);

    let build = await runBuild(ctx, `The build on Angular ${hop.to}`);
    throwIfCancelled(ctx);
    if (!succeeded(build)) {
      const checkpoint = updated ?? before;
      log(ctx, 'warn', 'refit', `The app does not build on Angular ${hop.to} yet. Asking the agent to fix the build errors.`);
      activity(ctx, `Fixing the build on Angular ${hop.to}`);
      const files = filesInLog(logTail(build));
      await runAgentTask(ctx, { kind: 'fix', label: `upgrade to Angular ${hop.to}`, files }, {
        scope: 'upgrade',
        scopeBudgetUsd: ctx.config.budget.foundationUsd,
        prompt: fixPrompt({ label: `upgrade to Angular ${hop.to}`, buildCommand: ctx.commands.build, logTail: logTail(build), changedFiles: files }),
      });
      throwIfCancelled(ctx);
      await runGuard(ctx, checkpoint);
      build = await runBuild(ctx, `The build after fixing Angular ${hop.to}`);
      throwIfCancelled(ctx);
      if (!succeeded(build)) {
        throw new StepFailure(
          `The app does not build on Angular ${hop.to}, and the agent could not fix it.`,
          `The branch keeps the upgrade so a developer can finish it. The build log above shows the errors.`,
        );
      }
      await commitAll(ctx.paths.workspace, `refit: fix the build on Angular ${hop.to}`);
    }
    log(ctx, 'info', 'refit', `Angular ${hop.to} builds.`);
  }
  return { status: 'done', detail: `Upgraded from Angular ${current} to ${target}` };
}
