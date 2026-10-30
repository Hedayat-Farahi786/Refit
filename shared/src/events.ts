/** Live run events, streamed over SSE and stored as JSON lines in data/runs/<runId>/events.jsonl. */
import type {
  ChangedFile,
  PageReport,
  PageStatus,
  RunResult,
  RunStatus,
  ShotPhase,
  StepId,
  StepStatus,
  Viewport,
} from './api.js';

export type LogLevel = 'info' | 'warn' | 'error' | 'cmd' | 'out';
export type LogSource = 'refit' | 'shell' | 'agent' | 'guard';

export type RunEventBody =
  | { type: 'status'; status: RunStatus; message?: string }
  | { type: 'step'; step: StepId; status: StepStatus; detail?: string }
  | { type: 'activity'; text: string }
  | { type: 'log'; level: LogLevel; source: LogSource; text: string; exitCode?: number }
  | { type: 'agent'; kind: 'thought' | 'tool'; text?: string; tool?: string; target?: string; task?: string }
  | { type: 'page'; pageId: string; status: PageStatus; note?: string; report?: PageReport }
  | { type: 'shot'; pageId: string; phase: ShotPhase; viewport: Viewport; url: string }
  | { type: 'files'; changed: ChangedFile[]; pageId?: string }
  | { type: 'cost'; usd: number; requests: number }
  | { type: 'meta'; branch?: string; baseBranch?: string; baseCommit?: string; workspace?: string }
  | { type: 'result'; result: RunResult };

export type RunEvent = RunEventBody & {
  /** Position in the run's event log, starting at 1. Used as the SSE event id. */
  seq: number;
  ts: string;
};

export type RunEventType = RunEvent['type'];

/** Events on the global stream that tell the UI to refresh its state. */
export type StateEvent =
  | { type: 'state-changed'; reason: string; appId?: string; runId?: string }
  | { type: 'sign-in'; status: 'open' | 'saved' | 'closed' | 'failed'; message?: string };
