import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { AgentProvider, AgentResult, AgentRunArgs } from './types.js';

export interface DryRunOptions {
  /** Pause between fake agent events, so the live view looks like real work. */
  delayMs?: number;
  /** Test hook: also change this protected file during page tasks, to exercise the guard. */
  touchFile?: string;
  /** Test hook: break the build on the page with this label, to exercise fix and rollback. */
  breakBuildOnPage?: string;
}

/**
 * The free "Dry run" provider. No AI: it emits realistic events, marks each page's template with
 * a comment so diffs, commits, screenshots and the guard get exercised, and returns a valid report.
 */
export class DryRunProvider implements AgentProvider {
  readonly id = 'dryrun' as const;
  readonly label = 'Dry run';
  readonly costUnit = 'usd' as const;

  constructor(private readonly options: DryRunOptions = {}) {}

  async run(args: AgentRunArgs): Promise<AgentResult> {
    const wait = () => delay(this.options.delayMs ?? 120, undefined, { signal: args.signal });
    try {
      switch (args.task.kind) {
        case 'review':
          return await this.review(args, wait);
        case 'fix':
          args.onEvent({ kind: 'thought', text: 'Reading the build errors to see what broke.' });
          await wait();
          args.onEvent({ kind: 'thought', text: 'Dry run: no fix applied.' });
          return { ok: true, text: 'Dry run: no changes were made.', costUsd: 0, requests: 0 };
        case 'polish':
          args.onEvent({ kind: 'thought', text: 'Comparing the after screenshots with the UI checklist.' });
          await wait();
          return { ok: true, text: report(args.task.label, 'Everything already meets the checklist.', []), costUsd: 0, requests: 0 };
        default:
          return await this.edit(args, wait);
      }
    } catch (error) {
      if (args.signal.aborted) return { ok: false, text: '', costUsd: 0, requests: 0, error: 'Cancelled.' };
      throw error;
    }
  }

  private async edit(args: AgentRunArgs, wait: () => Promise<void>): Promise<AgentResult> {
    const { task } = args;
    args.onEvent({ kind: 'thought', text: `Taking an inventory of the ${task.label}: sections, fields, actions and conditions.` });
    await wait();
    for (const file of task.files.slice(0, 3)) {
      args.onEvent({ kind: 'tool', tool: 'Read', target: file });
      await wait();
    }
    const target = task.files.find((file) => file.endsWith('.html')) ?? task.files.find((file) => file.endsWith('.ts'));
    const changes: string[] = [];
    if (target) {
      const full = path.join(args.cwd, ...target.split('/'));
      const original = await fs.readFile(full, 'utf8');
      const marker = target.endsWith('.html') ? `<!-- Refit dry run: ${task.label} -->\n` : `// Refit dry run: ${task.label}\n`;
      let next = original.startsWith(marker) ? original : marker + original;
      // A binding to a property that does not exist fails Angular's strict template check.
      if (this.options.breakBuildOnPage === task.label && target.endsWith('.html')) next += '\n<p>{{ refitDryRunBrokenBinding }}</p>\n';
      args.onEvent({ kind: 'tool', tool: 'Edit', target });
      await fs.writeFile(full, next);
      changes.push(`Marked ${target} with a dry-run comment.`);
      await wait();
    }
    if (this.options.touchFile) {
      const full = path.join(args.cwd, ...this.options.touchFile.split('/'));
      args.onEvent({ kind: 'tool', tool: 'Edit', target: this.options.touchFile });
      await fs.appendFile(full, '\n// Refit dry run touched a protected file\n').catch(() => fs.writeFile(full, '// Refit dry run\n'));
    }
    for (const command of args.allowedCommands?.slice(0, 1) ?? []) {
      args.onEvent({ kind: 'tool', tool: 'Bash', target: command });
      await wait();
    }
    args.onEvent({ kind: 'thought', text: 'Checked the inventory: everything is still present and wired the same way.' });
    return { ok: true, text: report(task.label, 'Dry run: the page was marked so the pipeline can be tested without AI.', changes), costUsd: 0, requests: 0 };
  }

  private async review(args: AgentRunArgs, wait: () => Promise<void>): Promise<AgentResult> {
    args.onEvent({ kind: 'thought', text: 'Reading the app shell, shared components and global styles.' });
    await wait();
    for (const file of args.task.files.slice(0, 4)) {
      args.onEvent({ kind: 'tool', tool: 'Read', target: file });
      await wait();
    }
    const review = {
      summary: 'Dry run review: no AI was used. This is sample output in the real format.',
      uiStack: ['Sample UI stack'],
      layout: 'Top navigation with a content area (sample).',
      sharedComponents: [{ name: 'App shell', files: args.task.files.slice(0, 1), why: 'Every page uses it (sample).' }],
      risks: [{ title: 'Sample risk', files: [], detail: 'A real review lists what could break during the modernization (sample).' }],
      // The routes from the prompt's page list, so every part of the review UI has data.
      pages: [...args.prompt.matchAll(/^ {2}- (\/\S*)/gm)].slice(0, 20).map((match) => ({ route: match[1], purpose: 'Sample purpose (dry run)', complexity: 'low' })),
      recommendations: ['Run a real review with Claude Agent or GitHub Copilot for actual advice.'],
    };
    return { ok: true, text: `Here is the review.\n\n\`\`\`json\n${JSON.stringify(review, null, 2)}\n\`\`\``, costUsd: 0, requests: 0 };
  }
}

function report(label: string, summary: string, changes: string[]): string {
  const json = {
    status: 'done',
    inventory: [`Everything on the ${label} (dry run does not inspect pages).`],
    changes,
    componentsUsed: [],
    concerns: [],
  };
  return `${summary}\n\n\`\`\`json\n${JSON.stringify(json, null, 2)}\n\`\`\``;
}
