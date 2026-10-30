import path from 'node:path';
import type { AppRecord, ReviewResult, RunEventBody } from '@refit/shared';
import type { RefitConfig } from '../config/config.js';
import { parseReview } from '../prompts/report.js';
import { reviewPrompt } from '../prompts/tasks.js';
import type { AgentProvider } from '../providers/types.js';
import { errorMessage } from '../util/errors.js';
import { pathExists } from '../util/fs.js';

export interface ReviewContext {
  runId: string;
  app: AppRecord;
  /** The app folder inside the scan snapshot (read-only, never the user's folder). */
  folder: string;
  provider: AgentProvider;
  playbook: string;
  config: RefitConfig;
  signal: AbortSignal;
  emit(body: RunEventBody): void;
}

/** Files to read first: the app shell, global styles and a sample of page components. */
export async function reviewStartFiles(app: AppRecord, folder: string): Promise<string[]> {
  const sourceRoot = app.scan?.angular?.sourceRoot ?? 'src';
  const candidates = [
    `${sourceRoot}/app/app.component.html`,
    `${sourceRoot}/app/app.component.ts`,
    `${sourceRoot}/app/app.html`,
    `${sourceRoot}/app/app.ts`,
    `${sourceRoot}/styles.scss`,
    `${sourceRoot}/styles.css`,
    ...app.pages.slice(0, 6).flatMap((page) => page.files.filter((file) => !file.endsWith('.ts') || page.files.length === 1)),
  ];
  const existing: string[] = [];
  for (const file of candidates) {
    if (!existing.includes(file) && (await pathExists(path.join(folder, ...file.split('/'))))) existing.push(file);
  }
  return existing.slice(0, 14);
}

/** The read-only agent review. Emits the same events as a run and returns the parsed review. */
export async function runReview(ctx: ReviewContext): Promise<ReviewResult | null> {
  const { app, provider } = ctx;
  ctx.emit({ type: 'status', status: 'running' });
  ctx.emit({ type: 'step', step: 'review', status: 'active' });
  ctx.emit({ type: 'activity', text: 'Reading the app shell, shared components and a sample of pages' });
  try {
    const startFiles = await reviewStartFiles(app, ctx.folder);
    const angular = app.scan?.angular;
    const result = await provider.run({
      cwd: ctx.folder,
      task: { kind: 'review', label: 'app review', files: startFiles },
      system: ctx.playbook,
      prompt: reviewPrompt({
        angular: angular?.version ?? 'unknown',
        bootstrap: angular?.bootstrap === 'standalone' ? 'standalone components' : angular?.bootstrap === 'ngmodule' ? 'NgModules' : 'unknown bootstrap',
        routing: angular?.hashRouting ? 'hash routing' : 'path routing',
        uiLibraries: app.scan?.uiLibraries ?? [],
        msal: app.scan?.msal ?? false,
        pages: app.pages.map((page) => ({ route: page.route, ...(page.componentFile ? { file: page.componentFile } : {}) })),
        startFiles,
      }),
      mode: 'read',
      ...(provider.id === 'claude' ? { model: ctx.config.claude.models.review, effort: ctx.config.claude.effort } : {}),
      ...(provider.id === 'copilot' && ctx.config.copilot.model ? { model: ctx.config.copilot.model } : {}),
      budgetUsd: ctx.config.budget.reviewUsd,
      maxTurns: ctx.config.maxTurns.review,
      signal: ctx.signal,
      protectedPaths: ctx.config.protectedPaths,
      allowedCommands: [],
      onEvent: (event) => {
        if (event.kind === 'thought' || event.kind === 'tool') {
          ctx.emit({ type: 'agent', kind: event.kind, task: 'app review', ...(event.text ? { text: event.text } : {}), ...(event.tool ? { tool: event.tool } : {}), ...(event.target ? { target: event.target } : {}) });
        } else {
          ctx.emit({ type: 'log', level: event.kind === 'guard' ? 'warn' : 'info', source: event.kind === 'guard' ? 'guard' : 'agent', text: event.text ?? '' });
        }
      },
    });
    ctx.emit({ type: 'cost', usd: result.costUsd, requests: result.requests });
    if (ctx.signal.aborted) {
      ctx.emit({ type: 'step', step: 'review', status: 'skipped', detail: 'Cancelled' });
      ctx.emit({ type: 'status', status: 'cancelled', message: 'Cancelled.' });
      return null;
    }
    if (!result.ok && !result.text) {
      throw new Error(result.error ?? 'The agent stopped without an answer.');
    }
    const review: ReviewResult = {
      ...parseReview(result.text),
      runId: ctx.runId,
      createdAt: new Date().toISOString(),
      provider: provider.id,
      costUsd: result.costUsd,
    };
    ctx.emit({ type: 'step', step: 'review', status: review.structured ? 'done' : 'warn', detail: review.structured ? 'Review ready' : 'The agent did not return the structured review' });
    ctx.emit({ type: 'status', status: 'done', message: 'Review ready.' });
    return review;
  } catch (error) {
    ctx.emit({ type: 'step', step: 'review', status: 'failed', detail: errorMessage(error) });
    ctx.emit({ type: 'status', status: 'failed', message: errorMessage(error) });
    return null;
  }
}
