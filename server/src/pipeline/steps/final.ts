import { apiChanged, diffApiCalls, newConsoleErrors } from '../../browser/api-calls.js';
import { succeeded } from '../../proc/run.js';
import { activity, exec, log, throwIfCancelled, type RunContext } from '../context.js';
import { runBuild } from './build.js';
import { describeDiff } from './pages.js';
import { shootPage, startDevServer, stopDevServer } from './shots.js';

export interface FinalOutcome {
  detail: string;
  ok: boolean;
}

/** Step 7: full build and, if enabled, tests compared with the baseline (only regressions count). */
export async function finalStep(ctx: RunContext): Promise<FinalOutcome> {
  activity(ctx, 'Running the final checks');
  const build = await runBuild(ctx, 'The final build');
  throwIfCancelled(ctx);
  ctx.facts.finalBuild = succeeded(build) ? 'passed' : 'failed';
  const parts = [ctx.facts.finalBuild === 'passed' ? 'Build passed' : 'Build failed'];

  if (ctx.settings.runTests && ctx.commands.test) {
    activity(ctx, 'Running the unit tests again');
    const tests = await exec(ctx, ctx.commands.test, { timeoutMin: ctx.config.timeouts.testMin });
    throwIfCancelled(ctx);
    const passed = succeeded(tests);
    if (ctx.facts.baselineTests === 'failed') {
      ctx.facts.finalTests = passed ? 'passed' : 'no-regressions';
      if (!passed) log(ctx, 'warn', 'refit', 'Tests failed before and after the changes. Compare the failures in the log; Refit cannot tell old failures from new ones yet.');
    } else {
      ctx.facts.finalTests = passed ? 'passed' : 'regressions';
    }
    parts.push(ctx.facts.finalTests === 'regressions' ? 'tests regressed' : 'no test regressions');
  }

  if (ctx.facts.finalBuild === 'failed') {
    log(ctx, 'error', 'refit', 'The final build failed even though every page built on its own. A developer needs to look at the branch.');
  } else if (ctx.pages.length > 0) {
    const changedPages = await finalScreenshots(ctx);
    parts.push(changedPages === 0 ? 'API calls unchanged' : `API calls changed on ${changedPages} ${changedPages === 1 ? 'page' : 'pages'}`);
  }
  const apiOk = [...ctx.facts.apiDiffs.values()].every((diff) => !apiChanged(diff));
  return { detail: parts.join(', '), ok: ctx.facts.finalBuild === 'passed' && ctx.facts.finalTests !== 'regressions' && apiOk };
}

/**
 * After screenshots of every page on the final code, compared with the before pass. A later page
 * can change shared code, so every page is checked again, not only the one that was edited.
 */
async function finalScreenshots(ctx: RunContext): Promise<number> {
  await startDevServer(ctx, 'for the final screenshots');
  let changedPages = 0;
  try {
    for (const [index, page] of ctx.pages.entries()) {
      throwIfCancelled(ctx);
      activity(ctx, `Taking the final screenshots (${index + 1} of ${ctx.pages.length}): ${page.name}`);
      const after = await shootPage(ctx, page, 'after');
      const before = ctx.facts.beforeApi.get(page.id);
      if (!before || after.signInNeeded || ctx.facts.signInPages.has(page.id)) continue;
      const diff = diffApiCalls(before, after.apiCalls);
      ctx.facts.apiDiffs.set(page.id, diff);
      const errors = newConsoleErrors(ctx.facts.beforeErrors.get(page.id) ?? [], after.consoleErrors);
      const current = ctx.record().pages.find((candidate) => candidate.pageId === page.id);
      if (!current) continue;
      if (apiChanged(diff)) {
        changedPages++;
        log(ctx, 'warn', 'refit', `${page.name}: API calls differ from before (${describeDiff(diff)}).`);
        ctx.emit({
          type: 'page',
          pageId: page.id,
          status: current.status === 'done' ? 'flagged' : current.status,
          note: current.status === 'done' ? `API calls changed on the final code (${describeDiff(diff)}). Check which later change caused it.` : (current.note ?? ''),
          apiDiff: diff,
          newConsoleErrors: errors,
        });
      } else {
        ctx.emit({ type: 'page', pageId: page.id, status: current.status, apiDiff: diff, newConsoleErrors: errors });
      }
    }
  } finally {
    await stopDevServer(ctx);
  }
  return changedPages;
}
