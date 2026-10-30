/**
 * Applies run events to a run summary. The server uses it to keep state.json up to date and the
 * web UI uses it to render live, so both always agree. Every event sets values (never adds), so
 * applying the same event twice is harmless; that makes SSE replays safe.
 */
import type { PageRunState, RunRecord } from './api.js';
import type { RunEvent, RunEventBody } from './events.js';

export function applyRunEvent(run: RunRecord, event: RunEvent | (RunEventBody & { seq?: number; ts?: string })): RunRecord {
  if (event.seq !== undefined && event.seq > run.lastSeq) run.lastSeq = event.seq;
  switch (event.type) {
    case 'status':
      run.status = event.status;
      if (event.message !== undefined) run.message = event.message;
      if (event.status !== 'running' && event.ts && !run.finishedAt) run.finishedAt = event.ts;
      break;
    case 'step': {
      const step = run.steps.find((candidate) => candidate.id === event.step);
      if (!step) break;
      step.status = event.status;
      if (event.detail !== undefined) step.detail = event.detail;
      if (event.status === 'active' && event.ts) {
        step.startedAt = event.ts;
        delete step.finishedAt;
      }
      if (['done', 'warn', 'failed', 'skipped'].includes(event.status) && event.ts) step.finishedAt = event.ts;
      break;
    }
    case 'activity':
      run.activity = event.text;
      break;
    case 'page': {
      const page = findPage(run, event.pageId);
      if (!page) break;
      page.status = event.status;
      if (event.note !== undefined) page.note = event.note;
      if (event.report !== undefined) page.report = event.report;
      if (event.apiDiff !== undefined) page.apiDiff = event.apiDiff;
      if (event.newConsoleErrors !== undefined) page.newConsoleErrors = event.newConsoleErrors;
      break;
    }
    case 'shot': {
      const page = findPage(run, event.pageId);
      if (page) page.shots[event.phase][event.viewport] = event.url;
      break;
    }
    case 'files': {
      if (!event.pageId) break;
      const page = findPage(run, event.pageId);
      if (page) page.changedFiles = event.changed.filter((file) => !file.reverted).map((file) => file.file);
      break;
    }
    case 'cost':
      run.cost = { ...run.cost, usd: event.usd, requests: event.requests };
      break;
    case 'meta':
      if (event.branch !== undefined) run.branch = event.branch;
      if (event.baseBranch !== undefined) run.baseBranch = event.baseBranch;
      if (event.baseCommit !== undefined) run.baseCommit = event.baseCommit;
      if (event.workspace !== undefined) run.workspace = event.workspace;
      break;
    case 'result':
      run.result = event.result;
      break;
    case 'log':
    case 'agent':
      break;
  }
  return run;
}

function findPage(run: RunRecord, pageId: string): PageRunState | undefined {
  return run.pages.find((page) => page.pageId === pageId);
}

/** Highest possible AI spend for a run, shown before Start: capped by the run budget. */
export function estimateMaxCost(input: { pages: number; perPageUsd: number; perRunUsd: number; foundationUsd: number }): number {
  const uncapped = input.foundationUsd + input.pages * input.perPageUsd;
  return Math.min(input.perRunUsd, uncapped);
}
