import { succeeded } from '../../proc/run.js';
import { activity, exec, log, throwIfCancelled, type RunContext } from '../context.js';
import { runBuild } from './build.js';

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
  }
  return { detail: parts.join(', '), ok: ctx.facts.finalBuild === 'passed' && ctx.facts.finalTests !== 'regressions' };
}
