import os from 'node:os';
import type { CanUseTool, HookCallback, Options, PreToolUseHookInput, query as sdkQuery, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ProviderStatus, ProviderTestResult } from '@refit/shared';
import { errorMessage } from '../util/errors.js';
import type { ProviderModule } from './registry.js';
import { decideTool, describeToolInput, type ToolPolicy } from './tool-policy.js';
import type { AgentProvider, AgentResult, AgentRunArgs } from './types.js';

type QueryFn = typeof sdkQuery;

const READ_TOOLS = ['Read', 'Glob', 'Grep'];
const WRITE_TOOLS = [...READ_TOOLS, 'Edit', 'Write', 'Bash'];
/** Never available: web access, subagents and anything outside the task. */
const DISALLOWED = ['WebFetch', 'WebSearch', 'Task', 'Agent', 'NotebookEdit', 'KillShell', 'BashOutput', 'SlashCommand', 'Skill'];

export interface ClaudeProviderOptions {
  /** Replaces the SDK's query function (tests feed scripted message streams). */
  queryFn?: QueryFn;
  version: string;
  effort: string;
  /**
   * Refit's own config folder for the agent. Keeps it away from the developer's ~/.claude, so it
   * can never pick up a personal claude.ai login, user hooks or memory files.
   */
  configDir?: string;
}

/** Credentials Claude Agent can use. Refit never uses a claude.ai login. */
export function claudeCredentials(env: NodeJS.ProcessEnv = process.env): { ok: boolean; via: string | null } {
  if (env['CLAUDE_CODE_USE_BEDROCK'] === '1' || env['CLAUDE_CODE_USE_BEDROCK'] === 'true') return { ok: true, via: 'Amazon Bedrock' };
  if (env['CLAUDE_CODE_USE_VERTEX'] === '1' || env['CLAUDE_CODE_USE_VERTEX'] === 'true') return { ok: true, via: 'Google Vertex AI' };
  if (env['CLAUDE_CODE_USE_FOUNDRY'] === '1' || env['CLAUDE_CODE_USE_FOUNDRY'] === 'true') return { ok: true, via: 'Microsoft Foundry' };
  const key = env['ANTHROPIC_API_KEY'] ?? '';
  if (key.trim().length > 20) return { ok: true, via: 'ANTHROPIC_API_KEY' };
  // A company LLM gateway: ANTHROPIC_BASE_URL plus a bearer token.
  if ((env['ANTHROPIC_AUTH_TOKEN'] ?? '').trim().length > 10) return { ok: true, via: 'ANTHROPIC_AUTH_TOKEN' };
  return { ok: false, via: null };
}

export async function claudeStatus(): Promise<ProviderStatus> {
  const credentials = claudeCredentials();
  let sdk = true;
  try {
    await import('@anthropic-ai/claude-agent-sdk');
  } catch {
    sdk = false;
  }
  const checks = [
    {
      label: 'Credentials',
      ok: credentials.ok,
      detail: credentials.ok ? `Using ${credentials.via}.` : 'No ANTHROPIC_API_KEY (or Bedrock, Vertex or Foundry setting) in .env.',
    },
    { label: 'Agent SDK', ok: sdk, detail: sdk ? 'Installed.' : 'The @anthropic-ai/claude-agent-sdk package is missing.' },
  ];
  const available = credentials.ok && sdk;
  return {
    id: 'claude',
    label: 'Claude Agent',
    available,
    ...(available ? {} : { reason: credentials.ok ? 'The Agent SDK is not installed.' : 'No Anthropic API key is set up.' }),
    checks,
    setup: available
      ? []
      : [
          'Create an API key at console.anthropic.com (or use your company\'s Bedrock, Vertex or Foundry access).',
          'Put it in the .env file in the Refit folder: ANTHROPIC_API_KEY=sk-ant-...',
          'Restart Refit.',
          ...(sdk ? [] : ['Run npm install in the Refit folder.']),
        ],
    costUnit: 'usd',
    ...(available ? { testCost: 'about $0.001' } : {}),
  };
}

/**
 * Claude Agent through the Anthropic Claude Agent SDK. Safety: only the task's tools exist, every
 * edit and command goes through Refit's policy (a PreToolUse hook and canUseTool), no settings
 * or hooks from the target repository are loaded, and web access is off.
 */
export class ClaudeAgentProvider implements AgentProvider {
  readonly id = 'claude' as const;
  readonly label = 'Claude Agent';
  readonly costUnit = 'usd' as const;

  constructor(private readonly options: ClaudeProviderOptions) {}

  async run(args: AgentRunArgs): Promise<AgentResult> {
    const query = this.options.queryFn ?? (await import('@anthropic-ai/claude-agent-sdk')).query;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (args.signal.aborted) abort();
    else args.signal.addEventListener('abort', abort, { once: true });

    const policy: ToolPolicy = {
      root: args.cwd,
      protectedPaths: args.protectedPaths ?? [],
      allowedCommands: args.allowedCommands ?? [],
      readOnly: args.mode === 'read',
    };

    const preToolUse: HookCallback = async (input) => {
      const hook = input as PreToolUseHookInput;
      const decision = decideTool(policy, hook.tool_name, (hook.tool_input ?? {}) as Record<string, unknown>);
      if (decision.allow) return {};
      args.onEvent({ kind: 'guard', text: `Blocked ${hook.tool_name}: ${decision.reason}` });
      return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: decision.reason } };
    };

    const canUseTool: CanUseTool = async (toolName, input) => {
      const decision = decideTool(policy, toolName, input);
      if (decision.allow) return { behavior: 'allow', updatedInput: input };
      return { behavior: 'deny', message: decision.reason };
    };

    const options: Options = {
      cwd: args.cwd,
      ...(args.model ? { model: args.model } : {}),
      effort: (args.effort ?? this.options.effort) as Options['effort'],
      ...(args.maxTurns ? { maxTurns: args.maxTurns } : {}),
      ...(args.budgetUsd !== undefined ? { maxBudgetUsd: Math.max(0.01, args.budgetUsd) } : {}),
      abortController: controller,
      persistSession: false,
      // No settings from disk: a target repo's .claude/settings.json could allow commands or run hooks.
      settingSources: [],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: args.system },
      tools: args.mode === 'read' ? READ_TOOLS : WRITE_TOOLS,
      // No allowedTools: every call, reads included, goes through the hook and canUseTool.
      disallowedTools: DISALLOWED,
      // 'default' so every edit and command reaches canUseTool ('acceptEdits' would auto-approve rm, mv, sed).
      permissionMode: 'default',
      canUseTool,
      hooks: { PreToolUse: [{ hooks: [preToolUse] }] },
      env: this.env(),
    };

    let lastText = '';
    let finalText = '';
    let costUsd = 0;
    let outcome: Pick<AgentResult, 'ok' | 'error' | 'limitReached'> = { ok: false, error: 'The agent ended without a result.' };

    try {
      for await (const message of query({ prompt: args.prompt, options }) as AsyncIterable<SDKMessage>) {
        if (message.type === 'assistant') {
          for (const block of message.message.content) {
            if (block.type === 'text' && block.text.trim()) {
              lastText = block.text;
              args.onEvent({ kind: 'thought', text: block.text.trim().slice(0, 2000) });
            } else if (block.type === 'tool_use') {
              args.onEvent({ kind: 'tool', tool: block.name, target: describeToolInput(block.name, (block.input ?? {}) as Record<string, unknown>, args.cwd) });
            }
          }
        } else if (message.type === 'result') {
          costUsd = message.total_cost_usd ?? 0;
          if (message.subtype === 'success') {
            finalText = message.result;
            outcome = { ok: true };
          } else if (message.subtype === 'error_max_turns' || message.subtype === 'error_max_budget_usd') {
            outcome = {
              ok: false,
              limitReached: true,
              error: message.subtype === 'error_max_turns' ? 'it reached the turn limit' : 'it reached the budget for this task',
            };
          } else {
            outcome = { ok: false, error: friendlyError(message.errors.join(' ') || message.subtype) };
          }
        }
      }
    } catch (error) {
      if (args.signal.aborted) return { ok: false, text: lastText, costUsd, requests: 0, error: 'Cancelled.' };
      return { ok: false, text: lastText, costUsd, requests: 0, error: friendlyError(errorMessage(error)) };
    } finally {
      args.signal.removeEventListener('abort', abort);
    }
    return { ...outcome, text: finalText || lastText, costUsd, requests: 0 };
  }

  /** "Test connection": one short question to the smallest model, with no tools and a 5 cent cap. */
  async test(): Promise<ProviderTestResult> {
    const query = this.options.queryFn ?? (await import('@anthropic-ai/claude-agent-sdk')).query;
    const started = Date.now();
    const options: Options = {
      cwd: os.tmpdir(),
      model: 'haiku',
      maxTurns: 1,
      maxBudgetUsd: 0.05,
      persistSession: false,
      settingSources: [],
      tools: [],
      permissionMode: 'default',
      canUseTool: async () => ({ behavior: 'deny', message: 'No tools in a connection test.' }),
      systemPrompt: 'This is a connection check. Reply with the single word OK.',
      env: this.env(),
    };
    let reply = '';
    let model: string | undefined;
    let costUsd = 0;
    let error: string | undefined;
    try {
      for await (const message of query({ prompt: 'Connection check: reply with OK.', options }) as AsyncIterable<SDKMessage>) {
        if (message.type === 'assistant') {
          model = message.message.model;
          for (const block of message.message.content) if (block.type === 'text') reply += block.text;
        } else if (message.type === 'result') {
          costUsd = message.total_cost_usd ?? 0;
          if (message.subtype === 'success') reply = message.result || reply;
          else error = friendlyError(message.errors.join(' ') || message.subtype);
        }
      }
    } catch (caught) {
      error = friendlyError(errorMessage(caught));
    }
    const durationMs = Date.now() - started;
    if (error) return { ok: false, detail: error, durationMs, costUsd };
    return { ok: true, detail: `Claude answered "${reply.trim().slice(0, 80) || '(empty)'}".`, durationMs, costUsd, ...(model ? { model } : {}) };
  }

  /** The agent's environment: Refit's own config folder and never a claude.ai login. */
  private env(): Record<string, string | undefined> {
    return {
      ...process.env,
      CLAUDE_AGENT_SDK_CLIENT_APP: `refit/${this.options.version}`,
      CLAUDE_CODE_OAUTH_TOKEN: undefined,
      ...(this.options.configDir ? { CLAUDE_CONFIG_DIR: this.options.configDir } : {}),
    };
  }
}

/** Turns common SDK and API errors into something a person can act on. */
export function friendlyError(message: string): string {
  if (/invalid x-api-key|authentication_error|invalid api key|401/i.test(message)) {
    return 'Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env and restart Refit.';
  }
  if (/credit balance|billing/i.test(message)) return 'The Anthropic account has no credit left. Add credit in console.anthropic.com.';
  if (/rate.?limit|429|overloaded/i.test(message)) return 'Anthropic is busy or the rate limit was reached. Wait a minute and run again.';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|proxy/i.test(message)) {
    return 'Could not reach the Anthropic API. Check the network and proxy settings (HTTPS_PROXY) and try again.';
  }
  return message.slice(0, 500);
}

export function claudeModule(options: ClaudeProviderOptions): ProviderModule {
  return { status: claudeStatus, create: () => new ClaudeAgentProvider(options), test: () => new ClaudeAgentProvider(options).test() };
}
