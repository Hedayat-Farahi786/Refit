import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeAgentProvider, claudeCredentials, friendlyError } from '../../src/providers/claude.js';
import { decideCommand, decideTool, describeToolInput, type ToolPolicy } from '../../src/providers/tool-policy.js';
import type { AgentEvent, AgentRunArgs } from '../../src/providers/types.js';
import { tempDir } from '../helpers/repos.js';

const PROTECTED = ['**/*.service.ts', '**/services/**', 'package.json', '.env*', '**/*.routes.ts'];

async function policyFor(readOnly = false): Promise<ToolPolicy> {
  const root = await tempDir();
  await fs.mkdir(path.join(root, 'src/app'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/app/user-api.ts'), 'export class UserApi { http = inject(HttpClient); }');
  await fs.writeFile(path.join(root, 'src/app/home.component.html'), '<h1>Home</h1>');
  return { root, protectedPaths: PROTECTED, allowedCommands: ['npm run build', 'npm test -- --ci'], readOnly };
}

describe('tool policy', () => {
  it('allows reads inside the app folder only', async () => {
    const policy = await policyFor();
    expect(decideTool(policy, 'Read', { file_path: path.join(policy.root, 'src/app/home.component.html') })).toEqual({ allow: true });
    expect(decideTool(policy, 'Grep', { pattern: 'x', path: 'src' })).toEqual({ allow: true });
    expect(decideTool(policy, 'Read', { file_path: '/etc/passwd' })).toMatchObject({ allow: false });
    expect(decideTool(policy, 'Glob', { pattern: '*', path: '../..' })).toMatchObject({ allow: false });
  });

  it('allows edits to front-end files and blocks protected ones with a reason the model understands', async () => {
    const policy = await policyFor();
    expect(decideTool(policy, 'Edit', { file_path: path.join(policy.root, 'src/app/home.component.html') })).toEqual({ allow: true });
    expect(decideTool(policy, 'Write', { file_path: 'src/app/new-card.component.ts', content: '@Component({}) export class NewCard {}' })).toEqual({ allow: true });
    const service = decideTool(policy, 'Edit', { file_path: 'src/app/core/user.service.ts' });
    expect(service).toMatchObject({ allow: false });
    expect(!service.allow && service.reason).toContain('protected (it matches "**/*.service.ts")');
    expect(decideTool(policy, 'Write', { file_path: 'package.json', content: '{}' })).toMatchObject({ allow: false });
    expect(decideTool(policy, 'Edit', { file_path: '../other-app/src/x.ts' })).toMatchObject({ allow: false });
    expect(decideTool(policy, 'Edit', { file_path: 'src/app/user-api.ts' })).toMatchObject({ allow: false });
    expect(decideTool(policy, 'Write', { file_path: 'src/app/data.ts', content: 'export const load = () => fetch("/api/x");' })).toMatchObject({ allow: false });
  });

  it('allows only the build, lint and test commands, one at a time', async () => {
    const policy = await policyFor();
    expect(decideCommand(policy, 'npm run build')).toEqual({ allow: true });
    expect(decideCommand(policy, 'npm   run build -- --configuration development')).toEqual({ allow: true });
    expect(decideCommand(policy, 'npm test -- --ci')).toEqual({ allow: true });
    expect(decideCommand(policy, 'npx tsc --noEmit')).toEqual({ allow: true });
    for (const command of ['git push', 'npm install primeng', 'rm -rf src', 'curl https://example.com', 'npm run build && git commit -am x', 'npm run build; rm x', 'npm run build | tee x', 'npm run build > out', 'echo $(whoami)']) {
      expect(decideCommand(policy, command), command).toMatchObject({ allow: false });
    }
  });

  it('blocks writes and commands in read-only reviews, and unknown tools always', async () => {
    const policy = await policyFor(true);
    expect(decideTool(policy, 'Read', { file_path: 'src/app/home.component.html' })).toEqual({ allow: true });
    expect(decideTool(policy, 'Edit', { file_path: 'src/app/home.component.html' })).toMatchObject({ allow: false });
    expect(decideTool(policy, 'Bash', { command: 'npm run build' })).toMatchObject({ allow: false });
    expect(decideTool(await policyFor(), 'WebFetch', { url: 'https://example.com' })).toMatchObject({ allow: false });
  });

  it('describes tool calls briefly for the log', () => {
    expect(describeToolInput('Edit', { file_path: '/repo/app/src/a.html' }, '/repo/app')).toBe('src/a.html');
    expect(describeToolInput('Bash', { command: 'npm run build' }, '/repo/app')).toBe('npm run build');
  });
});

describe('ClaudeAgentProvider', () => {
  function scripted(messages: unknown[], inspect?: (options: Options) => Promise<void>) {
    let seen: Options | undefined;
    const queryFn = ((params: { prompt: string; options: Options }) => {
      seen = params.options;
      return (async function* () {
        await inspect?.(params.options);
        for (const message of messages) yield message as SDKMessage;
      })();
    }) as never;
    return { queryFn, options: () => seen! };
  }

  async function runWith(messages: unknown[], overrides: Partial<AgentRunArgs> = {}, inspect?: (options: Options) => Promise<void>) {
    const policy = await policyFor();
    const events: AgentEvent[] = [];
    const fake = scripted(messages, inspect);
    const provider = new ClaudeAgentProvider({ queryFn: fake.queryFn, version: '9.9.9', effort: 'medium' });
    const result = await provider.run({
      cwd: policy.root,
      task: { kind: 'page', label: 'Home page', files: ['src/app/home.component.html'] },
      system: 'PLAYBOOK',
      prompt: 'Modernize the home page',
      mode: 'write',
      model: 'sonnet',
      budgetUsd: 1.2,
      maxTurns: 45,
      signal: new AbortController().signal,
      onEvent: (event) => events.push(event),
      protectedPaths: PROTECTED,
      allowedCommands: ['npm run build'],
      ...overrides,
    });
    return { result, events, options: fake.options(), root: policy.root };
  }

  const assistant = (content: unknown[]) => ({ type: 'assistant', message: { content }, parent_tool_use_id: null, uuid: 'u', session_id: 's' });

  it('streams thoughts and tool actions, and reads cost and text from the result', async () => {
    const { result, events, options, root } = await runWith([
      { type: 'system', subtype: 'init', apiKeySource: 'ANTHROPIC_API_KEY', model: 'claude-sonnet-5-5' },
      assistant([{ type: 'text', text: 'Taking an inventory of the page.' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'src/app/home.component.html' } }]),
      assistant([{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'npm run build' } }]),
      { type: 'result', subtype: 'success', result: 'Done.\n```json\n{"status":"done"}\n```', total_cost_usd: 0.42, is_error: false },
    ]);
    expect(result).toEqual({ ok: true, text: 'Done.\n```json\n{"status":"done"}\n```', costUsd: 0.42, requests: 0 });
    expect(events).toEqual([
      { kind: 'thought', text: 'Taking an inventory of the page.' },
      { kind: 'tool', tool: 'Read', target: 'src/app/home.component.html' },
      { kind: 'tool', tool: 'Bash', target: 'npm run build' },
    ]);

    // The options that keep the agent inside Refit's rules.
    expect(options).toMatchObject({
      cwd: root,
      model: 'sonnet',
      effort: 'medium',
      maxTurns: 45,
      maxBudgetUsd: 1.2,
      persistSession: false,
      settingSources: [],
      permissionMode: 'default',
      systemPrompt: { type: 'preset', preset: 'claude_code', append: 'PLAYBOOK' },
      tools: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash'],
    });
    expect(options.allowedTools).toBeUndefined();
    expect(options.disallowedTools).toEqual(expect.arrayContaining(['WebFetch', 'WebSearch', 'Task']));
    expect(options.env?.['CLAUDE_AGENT_SDK_CLIENT_APP']).toBe('refit/9.9.9');
    expect(options.env?.['CLAUDE_CODE_OAUTH_TOKEN']).toBeUndefined();
  });

  it('denies protected writes and other commands through the hook and canUseTool', async () => {
    let hookOutput: unknown;
    let canUse: unknown;
    const { events } = await runWith([{ type: 'result', subtype: 'success', result: 'ok', total_cost_usd: 0 }], {}, async (options) => {
      const hook = options.hooks!.PreToolUse![0]!.hooks[0]!;
      hookOutput = await hook({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'src/app/core/auth.service.ts' }, tool_use_id: 'x', session_id: 's', transcript_path: '', cwd: options.cwd! } as never, 'x', { signal: new AbortController().signal });
      canUse = await options.canUseTool!('Bash', { command: 'git push' }, { signal: new AbortController().signal, toolUseID: 'y' } as never);
      expect(await hook({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: 'src/app/home.component.html' } } as never, 'z', { signal: new AbortController().signal })).toEqual({});
    });
    expect(hookOutput).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } });
    expect((hookOutput as { hookSpecificOutput: { permissionDecisionReason: string } }).hookSpecificOutput.permissionDecisionReason).toMatch(/protected/);
    expect(canUse).toMatchObject({ behavior: 'deny' });
    expect(events.some((event) => event.kind === 'guard' && /Blocked Edit/.test(event.text ?? ''))).toBe(true);
  });

  it('uses only read tools for reviews', async () => {
    const { options } = await runWith([{ type: 'result', subtype: 'success', result: '{}', total_cost_usd: 0.05 }], { mode: 'read' });
    expect(options.tools).toEqual(['Read', 'Glob', 'Grep']);
  });

  it('reports budget and turn limits as limits, and keeps the last text', async () => {
    const { result } = await runWith([assistant([{ type: 'text', text: 'Halfway there.' }]), { type: 'result', subtype: 'error_max_budget_usd', total_cost_usd: 1.21, errors: [] }]);
    expect(result).toMatchObject({ ok: false, limitReached: true, costUsd: 1.21, text: 'Halfway there.', error: 'it reached the budget for this task' });
    const turns = await runWith([{ type: 'result', subtype: 'error_max_turns', total_cost_usd: 0.3, errors: [] }]);
    expect(turns.result).toMatchObject({ limitReached: true, error: 'it reached the turn limit' });
  });

  it('tests the connection with one small request: no tools, the smallest model and a cost cap', async () => {
    const fake = scripted([
      { type: 'assistant', message: { model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'OK' }] }, parent_tool_use_id: null, uuid: 'u', session_id: 's' },
      { type: 'result', subtype: 'success', result: 'OK', total_cost_usd: 0.0004, errors: [] },
    ]);
    const provider = new ClaudeAgentProvider({ queryFn: fake.queryFn, version: '9.9.9', effort: 'medium', configDir: '/refit/data/claude-config' });
    const result = await provider.test();
    expect(result).toMatchObject({ ok: true, detail: 'Claude answered "OK".', model: 'claude-haiku-5-5', costUsd: 0.0004 });
    expect(fake.options()).toMatchObject({ model: 'haiku', maxTurns: 1, maxBudgetUsd: 0.05, tools: [], settingSources: [], persistSession: false });
    expect(fake.options().env).toMatchObject({ CLAUDE_CONFIG_DIR: '/refit/data/claude-config', CLAUDE_CODE_OAUTH_TOKEN: undefined });

    const failing = scripted([{ type: 'result', subtype: 'error_during_execution', total_cost_usd: 0, errors: ['401 authentication_error: invalid x-api-key'] }]);
    const failed = await new ClaudeAgentProvider({ queryFn: failing.queryFn, version: '9.9.9', effort: 'medium' }).test();
    expect(failed).toMatchObject({ ok: false, detail: 'Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env and restart Refit.' });
  });

  it('explains authentication and network errors', async () => {
    const failing = new ClaudeAgentProvider({
      queryFn: (() =>
        ({
          [Symbol.asyncIterator]: () => ({
            next: () => Promise.reject(new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')),
          }),
        })) as never,
      version: '1',
      effort: 'medium',
    });
    const result = await failing.run({ cwd: '/tmp', task: { kind: 'page', label: 'x', files: [] }, system: '', prompt: '', mode: 'write', signal: new AbortController().signal, onEvent: () => undefined });
    expect(result.error).toBe('Anthropic rejected the API key. Check ANTHROPIC_API_KEY in .env and restart Refit.');
    expect(friendlyError('getaddrinfo ENOTFOUND api.anthropic.com')).toMatch(/Could not reach the Anthropic API/);
  });

  it('accepts an API key or a cloud provider, never a claude.ai login', () => {
    expect(claudeCredentials({ ANTHROPIC_API_KEY: 'sk-ant-api03-0123456789abcdefghij' })).toEqual({ ok: true, via: 'ANTHROPIC_API_KEY' });
    expect(claudeCredentials({ CLAUDE_CODE_USE_BEDROCK: '1' })).toEqual({ ok: true, via: 'Amazon Bedrock' });
    expect(claudeCredentials({ ANTHROPIC_BASE_URL: 'https://llm.example.com', ANTHROPIC_AUTH_TOKEN: 'gateway-token-123' })).toEqual({ ok: true, via: 'ANTHROPIC_AUTH_TOKEN' });
    expect(claudeCredentials({ CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-xxxxxxxxxxxxxxxxxxxx' })).toEqual({ ok: false, via: null });
    expect(claudeCredentials({})).toEqual({ ok: false, via: null });
  });
});
