import type { AgentTaskKind, CostUnit, ProviderId, ProviderStatus, ProviderTestResult } from '@refit/shared';

/** One unit of AI work: review, foundation, page, polish or fix. */
export interface AgentTask {
  kind: AgentTaskKind;
  /** For people: "Requests page". */
  label: string;
  /** Files in scope, relative to the task's working folder. */
  files: string[];
}

export interface AgentEvent {
  kind: 'thought' | 'tool' | 'guard' | 'log';
  text?: string;
  tool?: string;
  target?: string;
}

export interface AgentRunArgs {
  /** The app folder inside the run's workspace (or the scan snapshot for reviews). */
  cwd: string;
  task: AgentTask;
  /** The playbook: identical for every call so providers can cache it. */
  system: string;
  prompt: string;
  mode: 'read' | 'write';
  model?: string;
  /** How hard the model thinks (Claude: low, medium, high, xhigh, max). */
  effort?: string;
  budgetUsd?: number;
  maxTurns?: number;
  signal: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  /** Screenshots the agent should look at (absolute paths). */
  images?: string[];
  /** Protected and sensitive path rules, for providers that can block writes before they happen. */
  protectedPaths?: readonly string[];
  /** Commands the agent may run (build, lint, test), exactly as Refit runs them. */
  allowedCommands?: readonly string[];
}

export interface AgentResult {
  ok: boolean;
  /** The agent's final message (summary plus JSON report). */
  text: string;
  costUsd: number;
  /** Requests or AI credits used (Copilot); 0 for providers billed in dollars. */
  requests: number;
  error?: string;
  /** True when the provider stopped because its budget or turn limit ran out. */
  limitReached?: boolean;
}

export interface AgentProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly costUnit: CostUnit;
  run(args: AgentRunArgs): Promise<AgentResult>;
}

export interface ProviderRegistry {
  statuses(): Promise<ProviderStatus[]>;
  /** Throws a UserError explaining why when the provider cannot be used. */
  get(id: ProviderId): Promise<AgentProvider>;
  /** Sends one tiny real request ("Test connection"). Throws a UserError when it cannot. */
  test(id: ProviderId): Promise<ProviderTestResult>;
}
