import type { PageConfig } from '@refit/shared';
import { appRelative, enforceGuard } from '../../guard/guard.js';
import { commitAll, headCommit, resetHard } from '../../git/workspace.js';
import { succeeded } from '../../proc/run.js';
import { parsePageReport } from '../../prompts/report.js';
import { fixPrompt, pagePrompt } from '../../prompts/tasks.js';
import { runAgentTask } from '../agent.js';
import { activity, log, throwIfCancelled, type RunContext } from '../context.js';
import { logTail, runBuild } from './build.js';

/** Step 6: modernize the included pages one at a time. A broken page is rolled back, never the run. */
export async function pagesStep(ctx: RunContext): Promise<string> {
  let done = 0;
  let flagged = 0;
  let skipped = 0;

  for (const [index, page] of ctx.pages.entries()) {
    throwIfCancelled(ctx);
    if (!ctx.budget.canStart(page.id)) {
      for (const rest of ctx.pages.slice(index)) {
        ctx.emit({ type: 'page', pageId: rest.id, status: 'skipped', note: 'Skipped: the run budget was reached.' });
        skipped++;
      }
      log(ctx, 'warn', 'refit', `The run budget ($${ctx.budget.perRunUsd.toFixed(2)}) is used up. ${skipped} pages were not started.`);
      break;
    }
    const outcome = await modernizePage(ctx, page, index);
    if (outcome === 'done') done++;
    else flagged++;
  }

  const parts = [`${done} done`];
  if (flagged) parts.push(`${flagged} flagged`);
  if (skipped) parts.push(`${skipped} skipped`);
  return parts.join(', ');
}

async function modernizePage(ctx: RunContext, page: PageConfig, index: number): Promise<'done' | 'flagged'> {
  const { workspace } = ctx.paths;
  ctx.emit({ type: 'page', pageId: page.id, status: 'working' });
  activity(ctx, `Restyling the ${page.name} page (${index + 1} of ${ctx.pages.length})`);
  const checkpoint = await headCommit(workspace);

  const task = { kind: 'page' as const, label: `${page.name} page`, files: page.files };
  const result = await runAgentTask(ctx, task, {
    scope: page.id,
    prompt: pagePrompt({
      name: page.name,
      route: page.route,
      files: page.files,
      beforeShots: [],
      buildCommand: ctx.commands.build,
      designSystem: 'PrimeNG with the brand preset (src/app/theme/brand-preset.ts) and the variables in src/app/theme/brand.css.',
    }),
  });
  throwIfCancelled(ctx);

  if (!result.ok && !result.limitReached) {
    await resetHard(workspace, checkpoint);
    return flag(ctx, page, `The agent could not finish (${result.error ?? 'unknown reason'}). Changes were rolled back.`);
  }

  await guard(ctx, page, checkpoint);

  let build = await runBuild(ctx, `The build after the ${page.name} page`);
  throwIfCancelled(ctx);
  if (!succeeded(build)) {
    log(ctx, 'warn', 'refit', `The build broke after the ${page.name} page. Asking the agent to fix it.`);
    activity(ctx, `Fixing the build after the ${page.name} page`);
    if (ctx.budget.canStart(page.id)) {
      const changed = await guard(ctx, page, checkpoint);
      await runAgentTask(ctx, { kind: 'fix', label: `${page.name} page`, files: page.files }, {
        scope: page.id,
        prompt: fixPrompt({ label: `${page.name} page`, buildCommand: ctx.commands.build, logTail: logTail(build), changedFiles: changed }),
      });
      throwIfCancelled(ctx);
      await guard(ctx, page, checkpoint);
      build = await runBuild(ctx, `The build after fixing the ${page.name} page`);
      throwIfCancelled(ctx);
    }
    if (!succeeded(build)) {
      await resetHard(workspace, checkpoint);
      return flag(ctx, page, 'The build broke and could not be fixed, so the changes were rolled back.');
    }
  }

  const report = parsePageReport(result.text);
  const commit = await commitAll(workspace, `refit(ui): modernize ${page.name}`);
  if (commit) ctx.facts.pageCommits.set(page.id, commit);
  ctx.emit({
    type: 'page',
    pageId: page.id,
    status: 'done',
    ...(commit ? {} : { note: 'The agent made no changes to this page.' }),
    report,
  });
  return 'done';
}

/** Runs the guard, reports changed files and records reverts. Returns the changed files, relative to the app folder. */
async function guard(ctx: RunContext, page: PageConfig, checkpoint: string): Promise<string[]> {
  const result = await enforceGuard(ctx.paths.workspace, checkpoint, ctx.guardPolicy);
  for (const reverted of result.reverted) {
    ctx.facts.protectedReverts.push({ file: reverted.file, reason: reverted.reason, pageId: page.id });
    log(ctx, 'warn', 'guard', `Reverted ${reverted.file}: ${reverted.reason}. Agents may not change it.`);
  }
  for (const file of result.changed) if (file.sensitive && !file.reverted) ctx.facts.sensitiveChanges.add(file.file);
  ctx.emit({ type: 'files', pageId: page.id, changed: result.changed });
  return result.changed.filter((file) => !file.reverted).map((file) => appRelative(file.file, ctx.appDir) ?? file.file);
}

function flag(ctx: RunContext, page: PageConfig, note: string): 'flagged' {
  log(ctx, 'warn', 'refit', `${page.name}: ${note}`);
  ctx.emit({ type: 'page', pageId: page.id, status: 'flagged', note });
  return 'flagged';
}
