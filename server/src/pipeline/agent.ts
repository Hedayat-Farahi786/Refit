import type { AgentTaskKind } from '@refit/shared';
import type { AgentResult, AgentTask } from '../providers/types.js';
import { errorMessage } from '../util/errors.js';
import { log, type RunContext } from './context.js';

export interface AgentTaskOptions {
  /** Budget scope, usually the page id ("foundation" for the foundation task). */
  scope: string;
  /** Total budget for the scope (defaults to the per-page budget). */
  scopeBudgetUsd?: number;
  prompt: string;
  /** Screenshots for the agent to look at (absolute paths). */
  images?: string[];
  /** Use the stronger model (pages the agent review rated "high"). */
  strong?: boolean;
}

/** Runs one agent task with the right model, budget and turn limit, and records its cost. */
export async function runAgentTask(ctx: RunContext, task: AgentTask, options: AgentTaskOptions): Promise<AgentResult> {
  const budgetUsd = ctx.budget.remainingFor(options.scope, options.scopeBudgetUsd);
  const model = modelFor(ctx, task.kind, options.strong ?? false);
  log(ctx, 'info', 'agent', `${ctx.provider.label}: ${taskVerb(task.kind)} ${task.label}${model ? ` with ${model}` : ''}${ctx.budget.unit === 'usd' && ctx.provider.id !== 'dryrun' ? ` (budget $${budgetUsd.toFixed(2)})` : ''}.`);
  let result: AgentResult;
  try {
    result = await ctx.provider.run({
      cwd: ctx.paths.appFolder,
      task,
      system: ctx.playbook,
      prompt: options.prompt,
      mode: task.kind === 'review' ? 'read' : 'write',
      ...(model ? { model } : {}),
      ...(ctx.budget.unit === 'usd' ? { budgetUsd } : {}),
      maxTurns: ctx.config.maxTurns[task.kind],
      signal: ctx.signal,
      ...(options.images && options.images.length > 0 ? { images: options.images } : {}),
      protectedPaths: ctx.config.protectedPaths,
      allowedCommands: [ctx.commands.build, ...(ctx.commands.test ? [ctx.commands.test] : [])],
      onEvent: (event) => {
        if (event.kind === 'thought' || event.kind === 'tool') {
          ctx.emit({
            type: 'agent',
            kind: event.kind,
            task: task.label,
            ...(event.text ? { text: event.text } : {}),
            ...(event.tool ? { tool: event.tool } : {}),
            ...(event.target ? { target: event.target } : {}),
          });
        } else {
          log(ctx, event.kind === 'guard' ? 'warn' : 'info', event.kind === 'guard' ? 'guard' : 'agent', event.text ?? '');
        }
      },
    });
  } catch (error) {
    result = { ok: false, text: '', costUsd: 0, requests: 0, error: errorMessage(error) };
  }
  ctx.budget.record(options.scope, result.costUsd, result.requests);
  ctx.emit({ type: 'cost', usd: ctx.budget.totalUsd, requests: ctx.budget.totalRequests });
  if (!result.ok && !ctx.signal.aborted) {
    log(ctx, 'warn', 'agent', `${ctx.provider.label} stopped early on ${task.label}: ${result.error ?? 'no reason given'}.`);
  }
  return result;
}

function modelFor(ctx: RunContext, kind: AgentTaskKind, strong: boolean): string | undefined {
  if (ctx.provider.id === 'claude') return strong ? ctx.config.claude.strongModel : ctx.config.claude.models[kind];
  if (ctx.provider.id === 'copilot') return ctx.config.copilot.model || undefined;
  return undefined;
}

function taskVerb(kind: AgentTaskKind): string {
  switch (kind) {
    case 'review':
      return 'reviewing';
    case 'foundation':
      return 'setting up';
    case 'page':
      return 'modernizing';
    case 'polish':
      return 'reviewing the design of';
    case 'fix':
      return 'fixing the build after';
  }
}
