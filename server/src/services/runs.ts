import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppRecord, ChangedFile, RunEvent, RunEventBody, RunRecord, RunSettings } from '@refit/shared';
import { applyRunEvent, MODERNIZE_STEPS, shortId } from '@refit/shared';
import type { ServerContext } from '../context.js';
import { classifyPath, type GuardPolicy } from '../guard/guard.js';
import { changedSince, fileDiff } from '../git/workspace.js';
import { BudgetLedger } from '../pipeline/budget.js';
import { effectiveCommands } from '../pipeline/commands.js';
import { appEnv, newFacts, type RunContext } from '../pipeline/context.js';
import { runPipeline } from '../pipeline/pipeline.js';
import { loadPlaybook } from '../prompts/playbook.js';
import type { ProviderRegistry } from '../providers/types.js';
import { RunEventLog } from '../runs/event-log.js';
import { UserError } from '../util/errors.js';
import { isDirectory, removeTree } from '../util/fs.js';
import type { AppService } from './apps.js';

interface ActiveRun {
  runId: string;
  controller: AbortController;
  done: Promise<void>;
}

/** Events that change what the UI shows outside the log, so the state stream should announce them. */
const ANNOUNCED: ReadonlySet<RunEventBody['type']> = new Set(['status', 'step', 'page', 'cost', 'result', 'meta']);
const KEEP_LOGS = 4;

/** Starts, tracks and cancels runs. One modernize run at a time. */
export class RunService {
  private active: ActiveRun | null = null;
  /** Event logs of recent runs, newest last, for fast replays. */
  private readonly logs = new Map<string, RunEventLog>();

  constructor(
    private readonly ctx: ServerContext,
    private readonly providers: ProviderRegistry,
    private readonly apps: AppService,
  ) {
    this.recoverInterrupted();
  }

  activeRunId(): string | null {
    return this.active?.runId ?? null;
  }

  get(runId: string): RunRecord {
    const run = this.ctx.store.get((state) => state.runs.find((candidate) => candidate.id === runId));
    if (!run) throw new UserError('That run does not exist any more.', 'Open the app\'s History tab for its runs.', 404);
    return run;
  }

  async start(appId: string, input: Partial<RunSettings>): Promise<RunRecord> {
    if (this.active) {
      const busy = this.get(this.active.runId);
      throw new UserError(`Another run is in progress (${busy.appName}).`, 'Wait for it to finish or cancel it first. Refit runs one modernization at a time.', 409);
    }
    const app = this.apps.get(appId);
    if (app.scanState.status === 'scanning') throw new UserError('The app is still being scanned.', 'Wait a few seconds and try again.', 409);
    if (!app.scan) throw new UserError('Scan the app before modernizing it.', 'Open the Overview tab and choose Scan again.');
    const blocking = app.findings.filter((finding) => finding.severity === 'block');
    if (blocking.length > 0) {
      throw new UserError(`The app cannot be modernized yet: ${blocking.map((finding) => finding.title).join('; ')}.`, 'Fix the blocking items listed on the Overview tab, then scan again.');
    }
    const pages = app.pages.filter((page) => page.include);
    const missing = pages.filter((page) => Object.entries(page.params).some(([, value]) => !value.trim()));
    if (missing.length > 0) {
      throw new UserError(`${missing.map((page) => page.name).join(', ')} need sample values for their route parameters.`, 'Fill them in on the Overview tab, or exclude those pages.');
    }

    const settings = this.settingsFor(app, input);
    const provider = await this.providers.get(settings.provider);
    const config = this.ctx.getConfig();
    const playbook = await loadPlaybook(this.ctx.paths.playbook);
    const commands = effectiveCommands(app);

    const runId = shortId();
    const runDir = path.join(this.ctx.paths.runs, runId);
    const workspace = path.join(this.ctx.paths.workspaces, runId);
    const appDir = app.scan.appDir;
    const record: RunRecord = {
      id: runId,
      appId: app.id,
      appName: app.name,
      kind: 'modernize',
      status: 'running',
      startedAt: new Date().toISOString(),
      settings,
      workspace,
      steps: MODERNIZE_STEPS.map((step) => ({ id: step.id, label: step.label, status: 'pending' })),
      pages: pages.map((page) => ({ pageId: page.id, name: page.name, route: page.route, status: 'queued', costUsd: 0, shots: { before: {}, after: {} } })),
      cost: { usd: 0, requests: 0, unit: provider.costUnit },
      activity: 'Starting',
      lastSeq: 0,
    };
    this.ctx.store.update((state) => state.runs.push(record));

    const log = await RunEventLog.create(runDir);
    this.remember(runId, log);
    const controller = new AbortController();
    const policy: GuardPolicy = { appDir, protectedPaths: config.protectedPaths, sensitivePaths: config.sensitivePaths };
    const runCtx: RunContext = {
      runId,
      app,
      pages,
      settings,
      config,
      provider,
      playbook,
      budget: new BudgetLedger(settings.perRunUsd, settings.perPageUsd, provider.costUnit),
      commands,
      env: appEnv(commands, app.overrides.nodeDir),
      signal: controller.signal,
      paths: { runDir, workspace, appFolder: appDir ? path.join(workspace, ...appDir.split('/')) : workspace },
      appDir,
      guardPolicy: policy,
      facts: newFacts(),
      emit: (body) => this.record(runId, log, body),
    };

    const done = runPipeline(runCtx, { record: () => this.get(runId), version: this.ctx.version })
      .catch((error: unknown) => console.error(`Refit: run ${runId} crashed:`, error))
      .finally(async () => {
        await log.close();
        if (this.active?.runId === runId) this.active = null;
        this.ctx.bus.changed('run-finished', { runId, appId: app.id });
      });
    this.active = { runId, controller, done };
    this.ctx.bus.changed('run-started', { runId, appId: app.id });
    return this.get(runId);
  }

  cancel(runId: string): void {
    const run = this.get(runId);
    if (this.active?.runId !== runId || run.status !== 'running') {
      throw new UserError('This run is not running.', 'Nothing to cancel.', 409);
    }
    this.active.controller.abort();
  }

  /** Resolves when the given run (if active) has finished. */
  async waitFor(runId: string): Promise<void> {
    if (this.active?.runId === runId) await this.active.done;
  }

  async events(runId: string, afterSeq: number): Promise<RunEvent[]> {
    this.get(runId);
    const log = this.logs.get(runId);
    if (log) return log.since(afterSeq);
    const all = await RunEventLog.read(path.join(this.ctx.paths.runs, runId));
    return afterSeq > 0 ? all.filter((event) => event.seq > afterSeq) : all;
  }

  /** Live events of the active run; null when the run is not running. */
  subscribe(runId: string, listener: (event: RunEvent) => void): (() => void) | null {
    if (this.active?.runId !== runId) return null;
    return this.logs.get(runId)?.subscribe(listener) ?? null;
  }

  /** Files that differ from the base commit, with their protected and sensitive flags. */
  async changes(runId: string): Promise<ChangedFile[]> {
    const run = this.get(runId);
    if (!run.workspace || !run.baseCommit || run.workspaceRemoved || !(await isDirectory(run.workspace))) return [];
    const app = this.ctx.store.get((state) => state.apps.find((candidate) => candidate.id === run.appId));
    const config = this.ctx.getConfig();
    const policy: GuardPolicy = { appDir: app?.scan?.appDir ?? '', protectedPaths: config.protectedPaths, sensitivePaths: config.sensitivePaths };
    return (await changedSince(run.workspace, run.baseCommit)).map((change) => {
      const classification = classifyPath(change.file, policy);
      return { file: change.file, status: change.status, protected: classification.protected, sensitive: classification.sensitive };
    });
  }

  async diff(runId: string, file: string): Promise<string> {
    const run = this.get(runId);
    if (!run.workspace || !run.baseCommit || run.workspaceRemoved) throw new UserError('The workspace of this run was removed.', 'Diffs are only available while the workspace exists.', 410);
    const changed = await this.changes(runId);
    if (!changed.some((change) => change.file === file)) throw new UserError('That file did not change in this run.', 'Choose a file from the list.', 404);
    return fileDiff(run.workspace, run.baseCommit, file);
  }

  async report(runId: string): Promise<string> {
    const run = this.get(runId);
    const file = run.result?.reportPath ?? path.join(this.ctx.paths.runs, runId, 'report.md');
    try {
      return await fs.readFile(file, 'utf8');
    } catch {
      throw new UserError('This run has no report yet.', run.status === 'running' ? 'The report is written when the run ends.' : 'The run stopped before it could write one.', 404);
    }
  }

  /** Deletes the run's workspace (and with it the local branch). History and report stay. */
  async removeWorkspace(runId: string): Promise<void> {
    const run = this.get(runId);
    if (this.active?.runId === runId) throw new UserError('This run is still in progress.', 'Cancel it first.', 409);
    if (run.workspace) await removeTree(run.workspace);
    this.ctx.store.update((state) => {
      const target = state.runs.find((candidate) => candidate.id === runId);
      if (target) target.workspaceRemoved = true;
    });
    this.ctx.bus.changed('run-updated', { runId, appId: run.appId });
  }

  /** Deletes the run completely: workspace, screenshots, log and history entry. */
  async remove(runId: string): Promise<void> {
    const run = this.get(runId);
    if (this.active?.runId === runId) throw new UserError('This run is still in progress.', 'Cancel it first.', 409);
    if (run.workspace) await removeTree(run.workspace);
    await removeTree(path.join(this.ctx.paths.runs, runId));
    this.logs.delete(runId);
    this.ctx.store.update((state) => {
      state.runs = state.runs.filter((candidate) => candidate.id !== runId);
    });
    this.ctx.bus.changed('run-removed', { runId, appId: run.appId });
  }

  private record(runId: string, log: RunEventLog, body: RunEventBody): void {
    const event = log.emit(body);
    if (body.type === 'log' || body.type === 'agent') return;
    this.ctx.store.update((state) => {
      const run = state.runs.find((candidate) => candidate.id === runId);
      if (run) applyRunEvent(run, event);
    });
    if (ANNOUNCED.has(body.type)) {
      const appId = this.ctx.store.get((state) => state.runs.find((candidate) => candidate.id === runId)?.appId);
      this.ctx.bus.changed('run-updated', { runId, ...(appId ? { appId } : {}) });
    }
  }

  private remember(runId: string, log: RunEventLog): void {
    this.logs.set(runId, log);
    while (this.logs.size > KEEP_LOGS) {
      const oldest = this.logs.keys().next().value as string;
      if (oldest === this.active?.runId) break;
      this.logs.delete(oldest);
    }
  }

  private settingsFor(app: AppRecord, input: Partial<RunSettings>): RunSettings {
    const config = this.ctx.getConfig();
    const brands = this.ctx.store.get((state) => state.brands);
    const brandId = input.brandId ?? this.ctx.store.get((state) => state.settings.uiBrandId);
    if (!brands.some((brand) => brand.id === brandId)) throw new UserError('That brand does not exist.', 'Choose a brand from the list.');
    const major = app.scan?.angular?.major ?? null;
    let target = input.targetAngularMajor ?? (major !== null && major >= config.targetAngularMajor ? 'keep' : config.targetAngularMajor);
    if (target !== 'keep' && major !== null && target < major) {
      throw new UserError(`Refit never downgrades Angular (the app is on ${major}).`, 'Choose "Keep current version".');
    }
    if (target === 'keep' && major !== null && major < 18) {
      throw new UserError(`Angular ${major} is too old to keep: PrimeNG design tokens need Angular 18 or newer.`, `Choose Angular ${config.targetAngularMajor} as the target.`);
    }
    if (target !== 'keep' && !config.defaults.upgradeAngular && major !== null && major < target) target = 'keep';
    return {
      provider: input.provider ?? 'dryrun',
      brandId,
      targetAngularMajor: target,
      polishRounds: input.polishRounds ?? config.defaults.polishRounds,
      runTests: input.runTests ?? config.defaults.runTests,
      perPageUsd: input.perPageUsd ?? config.budget.perPageUsd,
      perRunUsd: input.perRunUsd ?? config.budget.perRunUsd,
      onApiChange: input.onApiChange ?? config.defaults.onApiChange,
      strongModelForComplexPages: input.strongModelForComplexPages ?? config.defaults.strongModelForComplexPages,
    };
  }

  /** After a restart, runs that were in progress can never finish: say so, keep their workspace. */
  private recoverInterrupted(): void {
    this.ctx.store.update((state) => {
      for (const run of state.runs) {
        if (run.status !== 'running') continue;
        run.status = 'interrupted';
        run.finishedAt = new Date().toISOString();
        run.message = `Refit stopped while this run was in progress.${run.workspace ? ` The branch and workspace are kept at ${run.workspace}.` : ''}`;
        for (const step of run.steps) {
          if (step.status === 'active') {
            step.status = 'failed';
            step.detail = 'Interrupted';
          } else if (step.status === 'pending') {
            step.status = 'skipped';
          }
        }
        for (const page of run.pages) {
          if (page.status === 'queued' || page.status === 'working' || page.status === 'reviewing') {
            page.status = 'skipped';
            page.note = 'Interrupted';
          }
        }
      }
    });
  }
}
