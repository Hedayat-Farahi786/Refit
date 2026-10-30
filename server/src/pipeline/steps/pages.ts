import type { ApiDiff, PageConfig } from '@refit/shared';
import { apiChanged, diffApiCalls, newConsoleErrors } from '../../browser/api-calls.js';
import { appRelative, enforceGuard } from '../../guard/guard.js';
import { commitAll, headCommit, resetHard } from '../../git/workspace.js';
import { succeeded } from '../../proc/run.js';
import { parsePageReport } from '../../prompts/report.js';
import { fixPrompt, pagePrompt } from '../../prompts/tasks.js';
import { runAgentTask } from '../agent.js';
import { activity, log, throwIfCancelled, type RunContext } from '../context.js';
import { logTail, runBuild } from './build.js';
import { shareBeforeShots, shootPage, startDevServer, stopDevServer } from './shots.js';

const REBUILD_WAIT_MS = 120_000;

/** Step 6: modernize the included pages one at a time. A broken page is rolled back, never the run. */
export async function pagesStep(ctx: RunContext): Promise<string> {
  let done = 0;
  let flagged = 0;
  let skipped = 0;

  // One dev server for all pages: it recompiles after every change.
  if (ctx.pages.length > 0) await startDevServer(ctx, 'to check each page after its changes');
  try {
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
  } finally {
    await stopDevServer(ctx);
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
  const compilesBefore = ctx.facts.devServer?.compileCount ?? 0;
  const shots = await shareBeforeShots(ctx, page);

  const task = { kind: 'page' as const, label: `${page.name} page`, files: page.files };
  const result = await runAgentTask(ctx, task, {
    scope: page.id,
    images: shots.absolute,
    strong: isComplex(ctx, page),
    prompt: pagePrompt({
      name: page.name,
      route: page.route,
      files: page.files,
      beforeShots: shots.relative,
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

  // Screenshots and the behavior check, once the dev server has picked up the change.
  const check = await checkPage(ctx, page, compilesBefore);
  if (check.apiDiff && apiChanged(check.apiDiff) && ctx.settings.onApiChange === 'rollback') {
    await resetHard(workspace, checkpoint);
    return flag(ctx, page, `The page's API calls changed (${describeDiff(check.apiDiff)}), so its changes were rolled back.`, { apiDiff: check.apiDiff });
  }

  const report = parsePageReport(result.text);
  const commit = await commitAll(workspace, `refit(ui): modernize ${page.name}`);
  if (commit) ctx.facts.pageCommits.set(page.id, commit);
  if (check.apiDiff && apiChanged(check.apiDiff)) {
    return flag(ctx, page, `The page's API calls changed (${describeDiff(check.apiDiff)}). A developer should check why before merging.`, {
      apiDiff: check.apiDiff,
      report,
      ...(check.newErrors.length ? { newConsoleErrors: check.newErrors } : {}),
    });
  }
  ctx.emit({
    type: 'page',
    pageId: page.id,
    status: 'done',
    ...(commit ? {} : { note: 'The agent made no changes to this page.' }),
    report,
    ...(check.apiDiff ? { apiDiff: check.apiDiff } : {}),
    ...(check.newErrors.length ? { newConsoleErrors: check.newErrors } : {}),
  });
  return 'done';
}

interface PageCheck {
  apiDiff: ApiDiff | null;
  newErrors: string[];
}

/** Takes the after screenshots and compares API calls and console errors with the before pass. */
async function checkPage(ctx: RunContext, page: PageConfig, compilesBefore: number): Promise<PageCheck> {
  const server = ctx.facts.devServer;
  if (!server) return { apiDiff: null, newErrors: [] };
  activity(ctx, `Taking after screenshots of the ${page.name} page`);
  const rebuilt = await server.waitForRebuild(compilesBefore, REBUILD_WAIT_MS);
  if (!rebuilt) log(ctx, 'info', 'refit', `The dev server did not report a rebuild for ${page.name}; taking the screenshots anyway.`);
  const after = await shootPage(ctx, page, 'after');
  throwIfCancelled(ctx);
  const before = ctx.facts.beforeApi.get(page.id);
  if (after.signInNeeded || ctx.facts.signInPages.has(page.id) || !before) return { apiDiff: null, newErrors: [] };
  const apiDiff = diffApiCalls(before, after.apiCalls);
  ctx.facts.apiDiffs.set(page.id, apiDiff);
  const newErrors = newConsoleErrors(ctx.facts.beforeErrors.get(page.id) ?? [], after.consoleErrors);
  if (newErrors.length > 0) log(ctx, 'warn', 'refit', `${page.name}: ${newErrors.length} new console ${newErrors.length === 1 ? 'error' : 'errors'}: ${newErrors[0]}`);
  return { apiDiff, newErrors };
}

/** Pages the agent review rated "high" may use the stronger model, when the run allows it. */
function isComplex(ctx: RunContext, page: PageConfig): boolean {
  if (!ctx.settings.strongModelForComplexPages) return false;
  return ctx.app.review?.pages.some((reviewed) => reviewed.route === page.route && reviewed.complexity === 'high') ?? false;
}

export function describeDiff(diff: ApiDiff): string {
  const parts: string[] = [];
  if (diff.added.length) parts.push(`new: ${diff.added.slice(0, 3).join(', ')}`);
  if (diff.removed.length) parts.push(`missing: ${diff.removed.slice(0, 3).join(', ')}`);
  return parts.join('; ');
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

function flag(ctx: RunContext, page: PageConfig, note: string, extra: { apiDiff?: ApiDiff; report?: ReturnType<typeof parsePageReport>; newConsoleErrors?: string[] } = {}): 'flagged' {
  log(ctx, 'warn', 'refit', `${page.name}: ${note}`);
  ctx.emit({ type: 'page', pageId: page.id, status: 'flagged', note, ...extra });
  return 'flagged';
}
