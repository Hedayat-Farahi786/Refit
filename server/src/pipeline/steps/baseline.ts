import { succeeded } from '../../proc/run.js';
import { activity, exec, log, StepFailure, throwIfCancelled, type RunContext } from '../context.js';
import { logTail, runBuild } from './build.js';
import { shootPage, SIGN_IN_FIX, startDevServer, stopDevServer } from './shots.js';

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

  if (ctx.pages.length > 0) {
    await startDevServer(ctx, 'to take before screenshots');
    try {
      for (const [index, page] of ctx.pages.entries()) {
        throwIfCancelled(ctx);
        activity(ctx, `Taking before screenshots (${index + 1} of ${ctx.pages.length}): ${page.name}`);
        const result = await shootPage(ctx, page, 'before');
        if (result.signInNeeded) ctx.facts.signInPages.add(page.id);
        ctx.facts.beforeApi.set(page.id, result.apiCalls);
        ctx.facts.beforeErrors.set(page.id, result.consoleErrors);
      }
    } finally {
      await stopDevServer(ctx);
    }
    if (ctx.facts.signInPages.size === ctx.pages.length) {
      throw new StepFailure('Microsoft sign-in is needed to see the app, and the saved session did not work.', SIGN_IN_FIX);
    }
    const calls = new Set([...ctx.facts.beforeApi.values()].flat()).size;
    parts.push(`${ctx.pages.length - ctx.facts.signInPages.size} pages photographed`, `${calls} API ${calls === 1 ? 'call' : 'calls'} recorded`);
    if (ctx.facts.signInPages.size > 0) {
      log(ctx, 'warn', 'refit', `${ctx.facts.signInPages.size} pages needed sign-in, so they have no before screenshots and their API calls cannot be compared.`);
    }
  }
  return parts.join(', ');
}
