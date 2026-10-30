import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ModernizeStepId, RunRecord, RunResult } from '@refit/shared';
import { apiChanged } from '../browser/api-calls.js';
import { commitAll } from '../git/workspace.js';
import { buildReport } from '../report/report.js';
import { errorMessage } from '../util/errors.js';
import { CancelledError, log, step, StepFailure, type RunContext } from './context.js';
import { baselineStep } from './steps/baseline.js';
import { finalStep } from './steps/final.js';
import { installStep } from './steps/install.js';
import { designSystemStep } from './steps/design-system.js';
import { pagesStep } from './steps/pages.js';
import { prepareStep } from './steps/prepare.js';
import { upgradeStep } from './steps/upgrade.js';

export interface PipelineHooks {
  version: string;
}

/**
 * Runs the modernize pipeline. Failures stop the run with a plain explanation; cancelled and
 * failed runs keep their branch and workspace. Always ends with a report and a result event.
 */
export async function runPipeline(ctx: RunContext, hooks: PipelineHooks): Promise<void> {
  const started = Date.now();
  let current: ModernizeStepId | null = null;
  const run = async (id: ModernizeStepId, work: () => Promise<{ status: 'done' | 'warn' | 'skipped' | 'failed'; detail: string }>) => {
    current = id;
    step(ctx, id, 'active');
    const outcome = await work();
    step(ctx, id, outcome.status, outcome.detail);
    current = null;
  };
  const done = (detail: string) => ({ status: 'done' as const, detail });

  ctx.emit({ type: 'status', status: 'running' });
  try {
    await run('prepare', async () => done(await prepareStep(ctx)));
    await run('install', async () => done(await installStep(ctx)));
    await run('baseline', async () => done(await baselineStep(ctx)));
    await run('upgrade', () => upgradeStep(ctx));
    await run('design-system', () => designSystemStep(ctx));
    await run('pages', async () => {
      const detail = await pagesStep(ctx);
      const pages = ctx.record().pages;
      return { status: pages.some((page) => page.status === 'flagged' || page.status === 'skipped') ? 'warn' : 'done', detail };
    });
    await run('final', async () => {
      const outcome = await finalStep(ctx);
      return { status: ctx.facts.finalBuild === 'failed' ? 'failed' : outcome.ok ? 'done' : 'warn', detail: outcome.detail };
    });
    await run('ready', async () => {
      const commit = await commitAll(ctx.paths.workspace, 'refit: final touches');
      if (commit) log(ctx, 'info', 'refit', 'Committed the remaining changes.');
      return done('Report written. Nothing was pushed.');
    });
    ctx.emit({ type: 'status', status: 'done', message: 'Ready for review.' });
  } catch (error) {
    const cancelled = error instanceof CancelledError || ctx.signal.aborted;
    if (current) step(ctx, current, cancelled ? 'skipped' : 'failed', cancelled ? 'Cancelled' : errorMessage(error));
    skipRemaining(ctx, ctx.record(), cancelled ? 'Cancelled' : 'Not started: the run stopped');
    if (cancelled) {
      log(ctx, 'warn', 'refit', 'The run was cancelled. The branch and workspace are kept so you can look at them.');
      ctx.emit({ type: 'status', status: 'cancelled', message: 'Cancelled. The branch and workspace are kept.' });
    } else {
      const fix = error instanceof StepFailure ? error.fix : undefined;
      if (!(error instanceof StepFailure)) console.error(`Refit: run ${ctx.runId} failed unexpectedly:`, error);
      log(ctx, 'error', 'refit', `${errorMessage(error)}${fix ? `\n${fix}` : ''}`);
      ctx.emit({ type: 'status', status: 'failed', message: `${errorMessage(error)}${fix ? ` ${fix}` : ''}` });
    }
  } finally {
    await releaseResources(ctx);
    await finish(ctx, hooks, Date.now() - started);
  }
}

/** Stops the dev server and closes the browser, whatever happened. */
async function releaseResources(ctx: RunContext): Promise<void> {
  await ctx.facts.devServer?.stop().catch(() => undefined);
  ctx.facts.devServer = undefined;
  await ctx.facts.capture?.release().catch(() => undefined);
  ctx.facts.capture = undefined;
}

function skipRemaining(ctx: RunContext, record: RunRecord, note: string): void {
  for (const item of record.steps) {
    if (item.status === 'pending') step(ctx, item.id as ModernizeStepId, 'skipped');
  }
  for (const page of record.pages) {
    if (page.status === 'queued' || page.status === 'working' || page.status === 'reviewing') {
      ctx.emit({ type: 'page', pageId: page.pageId, status: 'skipped', note });
    }
  }
}

async function finish(ctx: RunContext, hooks: PipelineHooks, durationMs: number): Promise<void> {
  const record = ctx.record();
  const result: RunResult = {
    pagesDone: record.pages.filter((page) => page.status === 'done').length,
    pagesFlagged: record.pages.filter((page) => page.status === 'flagged').length,
    pagesSkipped: record.pages.filter((page) => page.status === 'skipped' || page.status === 'queued').length,
    build: ctx.facts.finalBuild ?? 'not-run',
    tests: ctx.facts.finalTests ?? (ctx.facts.baselineTests === 'failed' ? 'failed' : 'not-run'),
    apiUnchanged: ctx.facts.apiDiffs.size === 0 ? null : [...ctx.facts.apiDiffs.values()].every((diff) => !apiChanged(diff)),
    protectedReverts: ctx.facts.protectedReverts.length,
    sensitiveChanges: [...ctx.facts.sensitiveChanges].sort(),
    costUsd: ctx.budget.totalUsd,
    requests: ctx.budget.totalRequests,
    durationMs,
    ...(ctx.facts.branch ? { branch: ctx.facts.branch } : {}),
    workspace: ctx.paths.workspace,
  };
  if (ctx.facts.branch) {
    try {
      const reportPath = path.join(ctx.paths.runDir, 'report.md');
      const report = buildReport({ run: record, result, providerLabel: ctx.provider.label, reverts: ctx.facts.protectedReverts, version: hooks.version });
      await fs.writeFile(reportPath, report);
      result.reportPath = reportPath;
    } catch (error) {
      log(ctx, 'error', 'refit', `Could not write the report: ${errorMessage(error)}`);
    }
  }
  ctx.emit({ type: 'result', result });
}
