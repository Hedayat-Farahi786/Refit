import os from 'node:os';
import path from 'node:path';

export interface CopilotProviderOptions {
  /** The CLI program: "copilot" on the PATH, or a full path. */
  command: string;
  /** Arguments that go before Refit's own (tests run a fake CLI as `node fake-copilot.mjs`). */
  commandArgs?: readonly string[];
  /**
   * Refit's own Copilot folder (COPILOT_HOME), used when a token is set in .env: then no personal
   * settings, hooks, MCP servers or plugins can reach Refit's runs.
   */
  homeDir: string;
  /** 0 means no limit. Copilot's smallest limit is 30. */
  maxAiCreditsPerTask: number;
  /** The whole task is stopped after this long. */
  timeoutMin: number;
  /** Replaces process.env (tests). */
  env?: NodeJS.ProcessEnv;
}

/** Copilot's own floor for --max-ai-credits. */
export const MIN_AI_CREDITS = 30;

/** Token variables Copilot reads, in its order of precedence. */
const TOKEN_VARS = ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'] as const;

export interface CopilotToken {
  variable: (typeof TOKEN_VARS)[number];
  kind: 'fine-grained' | 'oauth' | 'classic' | 'other';
}

/** The token Copilot will use from the environment, if any. Classic tokens (ghp_) do not work with Copilot. */
export function copilotToken(env: NodeJS.ProcessEnv): CopilotToken | null {
  for (const variable of TOKEN_VARS) {
    const value = (env[variable] ?? '').trim();
    if (!value) continue;
    const kind = value.startsWith('github_pat_') ? 'fine-grained' : /^gh[ou]_/.test(value) ? 'oauth' : value.startsWith('ghp_') ? 'classic' : 'other';
    return { variable, kind };
  }
  return null;
}

/** Folder where `copilot login` keeps its settings (COPILOT_HOME or ~/.copilot). */
export function personalCopilotHome(env: NodeJS.ProcessEnv): string {
  return env['COPILOT_HOME']?.trim() || path.join(os.homedir(), '.copilot');
}

/** One line of `--output-format json`, reduced to what Refit shows and keeps. */
export type CopilotLine =
  | { kind: 'thought'; text: string }
  | { kind: 'tool'; tool: string; target: string }
  | { kind: 'message'; text: string }
  | { kind: 'usage'; model?: string; requests?: number }
  | { kind: 'error'; text: string }
  | { kind: 'ignore' }
  | { kind: 'text'; text: string };
