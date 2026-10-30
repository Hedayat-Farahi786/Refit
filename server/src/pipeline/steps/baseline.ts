import { succeeded } from '../../proc/run.js';
import { activity, exec, log, StepFailure, throwIfCancelled, type RunContext } from '../context.js';
import { logTail, runBuild } from './build.js';

/** Step 3: prove the app builds (and record tests) before anything changes. */
export async function baselineStep(ctx: RunContext): Promise<string> {
  activity(ctx, 'Checking that the app builds as it is today');
  const build = await runBuild(ctx, 'The first build');
  throwIfCancelled(ctx);
  if (!succeeded(build)) {
    const tail = logTail(build, 8).join('\n');
    throw new StepFailure(
      'The app does not build before any change, so Refit cannot prove it did not break anything.',
      `Run "${ctx.commands.build}" in the app folder and fix the error first, or set the right build command under Advanced.${tail ? `\nLast lines:\n${tail}` : ''}`,
    );
  }
  const parts = ['Build passed'];

  if (ctx.settings.runTests) {
    if (!ctx.commands.test) {
      log(ctx, 'info', 'refit', 'Tests are turned on, but the app has no test command. Skipping tests.');
    } else {
      activity(ctx, 'Running the unit tests as they are today');
      const tests = await exec(ctx, ctx.commands.test, { timeoutMin: ctx.config.timeouts.testMin });
      throwIfCancelled(ctx);
      ctx.facts.baselineTests = succeeded(tests) ? 'passed' : 'failed';
      parts.push(ctx.facts.baselineTests === 'passed' ? 'tests pass' : 'tests already fail');
      if (ctx.facts.baselineTests === 'failed') {
        log(ctx, 'warn', 'refit', 'Some tests fail before any change. Refit will only report new failures.');
      }
    }
  }
  return parts.join(', ');
}
