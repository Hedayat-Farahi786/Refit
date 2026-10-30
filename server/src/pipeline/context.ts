import path from 'node:path';
import type { ApiDiff, AppRecord, LogLevel, LogSource, ModernizeStepId, PageConfig, RunEventBody, RunRecord, RunSettings, StepStatus } from '@refit/shared';
import type { DevServer } from '../browser/devserver.js';
import type { BrowserManager, CaptureSession } from '../browser/session.js';
import type { RefitConfig } from '../config/config.js';
import type { GuardPolicy } from '../guard/guard.js';
import { childEnv } from '../proc/env.js';
import { describeExit, runProcess, succeeded, type ProcessResult } from '../proc/run.js';
import type { AgentProvider } from '../providers/types.js';
import { duration } from '../util/time.js';
import type { BudgetLedger } from './budget.js';
import type { EffectiveCommands } from './commands.js';

/** Everything a pipeline step needs. One per run. */
export interface RunContext {
  runId: string;
  app: AppRecord;
  /** Pages to modernize, in order. */
  pages: PageConfig[];
  settings: RunSettings;
  config: RefitConfig;
  provider: AgentProvider;
  playbook: string;
  budget: BudgetLedger;
  commands: EffectiveCommands;
  /** Environment for the app's commands (Node folder, extra variables, quiet flags). */
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  paths: {
    /** data/runs/<runId> */
    runDir: string;
    /** The run's clone (repo root). */
    workspace: string;
    /** The app folder inside the clone. */
    appFolder: string;
  };
  /** The app's folder relative to the repo root ("" for the whole repo). */
  appDir: string;
  guardPolicy: GuardPolicy;
  browser: BrowserManager;
  /** Extra hosts that count as a sign-in page (tests use a mock identity provider). */
  signInHosts?: readonly string[];
  /** Facts collected along the way, used by later steps and the report. */
  facts: RunFacts;
  emit(body: RunEventBody): void;
  /** The run summary as the event reducer sees it right now. */
  record(): RunRecord;
}

export interface RunFacts {
  branch?: string;
  baseBranch?: string;
  baseCommit?: string;
  baselineTests?: 'passed' | 'failed';
  finalBuild?: 'passed' | 'failed';
  finalTests?: 'passed' | 'failed' | 'regressions' | 'no-regressions';
  protectedReverts: Array<{ file: string; reason: string; pageId?: string }>;
  sensitiveChanges: Set<string>;
  pageCommits: Map<string, string>;
  /** API calls and console errors recorded with the before screenshots, per page. */
  beforeApi: Map<string, string[]>;
  beforeErrors: Map<string, string[]>;
  /** Pages whose before screenshots could not be taken because sign-in was needed. */
  signInPages: Set<string>;
  /** Final API comparison per page. */
  apiDiffs: Map<string, ApiDiff>;
  devServer?: DevServer;
  capture?: CaptureSession;
}

export function newFacts(): RunFacts {
  return {
    protectedReverts: [],
    sensitiveChanges: new Set(),
    pageCommits: new Map(),
    beforeApi: new Map(),
    beforeErrors: new Map(),
    signInPages: new Set(),
    apiDiffs: new Map(),
  };
}

export function log(ctx: RunContext, level: LogLevel, source: LogSource, text: string): void {
  ctx.emit({ type: 'log', level, source, text });
}

export function step(ctx: RunContext, id: ModernizeStepId, status: StepStatus, detail?: string): void {
  ctx.emit({ type: 'step', step: id, status, ...(detail !== undefined ? { detail } : {}) });
}

export function activity(ctx: RunContext, text: string): void {
  ctx.emit({ type: 'activity', text });
}

export interface ExecOptions {
  timeoutMin: number;
  cwd?: string;
  env?: Record<string, string>;
  /** Do not stream every output line into the log (for very chatty commands). */
  quiet?: boolean;
}

/** Runs one of the app's shell commands in the app folder, logging the command, its output and its result. */
export async function exec(ctx: RunContext, command: string, options: ExecOptions): Promise<ProcessResult> {
  const cwd = options.cwd ?? ctx.paths.appFolder;
  ctx.emit({ type: 'log', level: 'cmd', source: 'shell', text: `${relativeCwd(ctx, cwd)}$ ${command}` });
  const result = await runProcess({
    command,
    shell: true,
    cwd,
    env: options.env ? { ...ctx.env, ...options.env } : ctx.env,
    timeoutMs: options.timeoutMin * 60_000,
    signal: ctx.signal,
    tailLines: 200,
    ...(options.quiet ? {} : { onLine: (line: string) => ctx.emit({ type: 'log', level: 'out', source: 'shell', text: line }) }),
  });
  const ok = succeeded(result);
  ctx.emit({
    type: 'log',
    level: ok ? 'info' : 'error',
    source: 'shell',
    text: ok ? `Finished in ${duration(result.durationMs)}.` : `${command.split(' ').slice(0, 3).join(' ')} ${describeExit(result)} after ${duration(result.durationMs)}.`,
    ...(result.code !== null ? { exitCode: result.code } : {}),
  });
  return result;
}

function relativeCwd(ctx: RunContext, cwd: string): string {
  const relative = path.relative(ctx.paths.workspace, cwd).split(path.sep).join('/');
  return relative ? `${relative} ` : '';
}

/** Environment for an app's commands: quiet defaults, the scan's env, the user's env and Node folder. */
export function appEnv(commands: EffectiveCommands, nodeDir: string | undefined): NodeJS.ProcessEnv {
  return childEnv({ CI: '1', ...commands.env }, nodeDir);
}

/** Thrown by a step to stop the run with a plain explanation. */
export class StepFailure extends Error {
  constructor(
    message: string,
    readonly fix?: string,
  ) {
    super(message);
    this.name = 'StepFailure';
  }
}

export function throwIfCancelled(ctx: RunContext): void {
  if (ctx.signal.aborted) throw new CancelledError();
}

export class CancelledError extends Error {
  constructor() {
    super('The run was cancelled.');
    this.name = 'CancelledError';
  }
}
