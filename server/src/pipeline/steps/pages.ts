import type { ApiDiff, PageConfig } from '@refit/shared';
import { apiChanged, diffApiCalls, newConsoleErrors } from '../../browser/api-calls.js';
import { changedSince, commitAll, headCommit, resetHard, squashSince } from '../../git/workspace.js';
import { succeeded } from '../../proc/run.js';
import { parsePageReport } from '../../prompts/report.js';
import { fixPrompt, pagePrompt, polishPrompt } from '../../prompts/tasks.js';
import { runAgentTask } from '../agent.js';
import { activity, log, throwIfCancelled, type RunContext } from '../context.js';
import { logTail, runBuild } from './build.js';
import { THEME_FOLDER } from './design-system.js';
import { runGuard } from './guard-run.js';
import { installedVersion } from './packages.js';
import { shareShots, shootPage, startDevServer, stopDevServer } from './shots.js';

const REBUILD_WAIT_MS = 120_000;

/** Step 6: modernize the included pages one at a time. A broken page is rolled back, never the run. */
export async function pagesStep(ctx: RunContext): Promise<string> {
  let done = 0;
  let flagged = 0;
  let skipped = 0;

  const designSystem = await describeDesignSystem(ctx);
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
      const outcome = await modernizePage(ctx, page, index, designSystem);
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

async function modernizePage(ctx: RunContext, page: PageConfig, index: number, designSystem: string): Promise<'done' | 'flagged'> {
  const { workspace } = ctx.paths;
  ctx.emit({ type: 'page', pageId: page.id, status: 'working' });
  activity(ctx, `Restyling the ${page.name} page (${index + 1} of ${ctx.pages.length})`);
  const checkpoint = await headCommit(workspace);
  const compilesBefore = ctx.facts.devServer?.compileCount ?? 0;
  const shots = await shareShots(ctx, page, 'before');

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
      designSystem,
    }),
  });
  throwIfCancelled(ctx);

  if (!result.ok && !result.limitReached) {
    await resetHard(workspace, checkpoint);
    return flag(ctx, page, `The agent could not finish (${result.error ?? 'unknown reason'}). Changes were rolled back.`);
  }

  await runGuard(ctx, checkpoint, page.id);

  let build = await runBuild(ctx, `The build after the ${page.name} page`);
  throwIfCancelled(ctx);
  if (!succeeded(build)) {
    log(ctx, 'warn', 'refit', `The build broke after the ${page.name} page. Asking the agent to fix it.`);
    activity(ctx, `Fixing the build after the ${page.name} page`);
    if (ctx.budget.canStart(page.id)) {
      const changed = await runGuard(ctx, checkpoint, page.id);
      await runAgentTask(ctx, { kind: 'fix', label: `${page.name} page`, files: page.files }, {
        scope: page.id,
        prompt: fixPrompt({ label: `${page.name} page`, buildCommand: ctx.commands.build, logTail: logTail(build), changedFiles: changed }),
      });
      throwIfCancelled(ctx);
      await runGuard(ctx, checkpoint, page.id);
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
  let commit = await commitAll(workspace, `refit(ui): modernize ${page.name}`);
  if (check.apiDiff && apiChanged(check.apiDiff)) {
    if (commit) ctx.facts.pageCommits.set(page.id, commit);
    return flag(ctx, page, `The page's API calls changed (${describeDiff(check.apiDiff)}). A developer should check why before merging.`, {
      apiDiff: check.apiDiff,
      report,
      ...(check.newErrors.length ? { newConsoleErrors: check.newErrors } : {}),
    });
  }

  // Design review rounds on top of the page's commit; then one commit per page again.
  let latest = check;
  if (commit && ctx.settings.polishRounds > 0) {
    const reviewed = await designReviews(ctx, page, designSystem, commit);
    if (reviewed.check) latest = reviewed.check;
    report.changes.push(...reviewed.changes);
    if (reviewed.commits > 0) commit = await squashSince(workspace, checkpoint, `refit(ui): modernize ${page.name}`);
  }
  if (commit) ctx.facts.pageCommits.set(page.id, commit);
  ctx.emit({
    type: 'page',
    pageId: page.id,
    status: 'done',
    ...(commit ? {} : { note: 'The agent made no changes to this page.' }),
    report,
    ...(latest.apiDiff ? { apiDiff: latest.apiDiff } : {}),
    ...(latest.newErrors.length ? { newConsoleErrors: latest.newErrors } : {}),
  });
  return 'done';
}

interface ReviewOutcome {
  /** The check after the last kept review round, or null when no round was kept. */
  check: PageCheck | null;
  /** What the reviewers changed, in plain words, for the page's report. */
  changes: string[];
  commits: number;
}

/**
 * Design review rounds: each one is a fresh agent that compares the after screenshots with the UI
 * checklist and fixes what is missing. A round that breaks the build or changes API calls is rolled
 * back on its own; the page's modernization stays.
 */
async function designReviews(ctx: RunContext, page: PageConfig, designSystem: string, pageCommit: string): Promise<ReviewOutcome> {
  const { workspace } = ctx.paths;
  const rounds = ctx.settings.polishRounds;
  const outcome: ReviewOutcome = { check: null, changes: [], commits: 0 };
  let lastGood = pageCommit;
  for (let round = 1; round <= rounds; round++) {
    throwIfCancelled(ctx);
    if (!ctx.budget.canStart(page.id)) {
      log(ctx, 'info', 'refit', `${page.name}: the page budget is used up, so design review ${round} was skipped.`);
      break;
    }
    ctx.emit({ type: 'page', pageId: page.id, status: 'reviewing' });
    activity(ctx, `Design review ${round} of ${rounds} for the ${page.name} page`);
    const after = await shareShots(ctx, page, 'after');
    const before = await shareShots(ctx, page, 'before');
    const compilesBefore = ctx.facts.devServer?.compileCount ?? 0;
    const result = await runAgentTask(ctx, { kind: 'polish', label: `${page.name} page`, files: page.files }, {
      scope: page.id,
      images: [...after.absolute, ...before.absolute],
      prompt: polishPrompt({
        name: page.name,
        route: page.route,
        files: page.files,
        round,
        rounds,
        afterShots: after.relative,
        beforeShots: before.relative,
        buildCommand: ctx.commands.build,
        designSystem,
      }),
    });
    throwIfCancelled(ctx);

    const undo = async (reason: string) => {
      const compiles = ctx.facts.devServer?.compileCount ?? 0;
      await resetHard(workspace, lastGood);
      log(ctx, 'warn', 'refit', `${page.name}: design review ${round} ${reason}, so its changes were rolled back.`);
      // The screenshots must show the page as it is on the branch.
      outcome.check = await checkPage(ctx, page, compiles);
    };

    if (!result.ok && !result.limitReached) {
      if ((await changedSince(workspace, lastGood)).length > 0) await undo('did not finish');
      break;
    }
    await runGuard(ctx, lastGood, page.id);
    if ((await changedSince(workspace, lastGood)).length === 0) {
      log(ctx, 'info', 'refit', `${page.name}: design review ${round} found nothing to change.`);
      break;
    }
    const build = await runBuild(ctx, `The build after design review ${round} of the ${page.name} page`);
    throwIfCancelled(ctx);
    if (!succeeded(build)) {
      await undo('broke the build');
      break;
    }
    const check = await checkPage(ctx, page, compilesBefore);
    if (check.apiDiff && apiChanged(check.apiDiff)) {
      await undo(`changed the page's API calls (${describeDiff(check.apiDiff)})`);
      break;
    }
    const reviewCommit = await commitAll(workspace, `refit(ui): design review ${round} for ${page.name}`);
    if (reviewCommit) {
      lastGood = reviewCommit;
      outcome.commits++;
    }
    outcome.check = check;
    outcome.changes.push(...parsePageReport(result.text).changes.map((change) => `Design review: ${change}`));
  }
  return outcome;
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

/** What the page prompt says about the design system: the installed PrimeNG and where the brand guide is. */
async function describeDesignSystem(ctx: RunContext): Promise<string> {
  const primeng = await installedVersion(ctx, 'primeng');
  const theme = `${ctx.app.scan?.angular?.sourceRoot ?? 'src'}/${THEME_FOLDER}`;
  return [
    `PrimeNG ${primeng ?? '(see node_modules/primeng/package.json)'} with the ${ctx.brand.name} brand.`,
    `Read ${theme}/BRAND.md first: it says which brand color is for what, which PrimeNG component to use for each need, and the layout classes in ${theme}/brand.css (.brand-page, .brand-card, .brand-toolbar, .brand-form-grid, ...).`,
  ].join(' ');
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

function flag(ctx: RunContext, page: PageConfig, note: string, extra: { apiDiff?: ApiDiff; report?: ReturnType<typeof parsePageReport>; newConsoleErrors?: string[] } = {}): 'flagged' {
  log(ctx, 'warn', 'refit', `${page.name}: ${note}`);
  ctx.emit({ type: 'page', pageId: page.id, status: 'flagged', note, ...extra });
  return 'flagged';
}
