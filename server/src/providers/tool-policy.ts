import { readFileSync } from 'node:fs';
import path from 'node:path';
import { firstMatchingGlob } from '@refit/shared';
import { isDataAccessCode } from '../guard/guard.js';

/**
 * What an agent may do with its tools, decided before a call runs (lock 1). Used by the Claude
 * Agent provider's PreToolUse hook and its canUseTool callback. The guard after each task (lock 2)
 * catches anything that slips through, for every provider.
 */

export interface ToolPolicy {
  /** The folder the agent works in (the app folder). Nothing outside it may be changed or read. */
  root: string;
  protectedPaths: readonly string[];
  /** Exact commands the agent may run (Refit's build, lint and test commands). */
  allowedCommands: readonly string[];
  /** True for read-only tasks (the agent review). */
  readOnly: boolean;
}

export type Decision = { allow: true } | { allow: false; reason: string };

const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS']);
const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
/** Safe, read-only commands that help an agent verify its work. */
const EXTRA_COMMANDS = ['npx ng build', 'npm run lint', 'npx ng lint', 'npx tsc --noEmit', 'npx tsc -p tsconfig.app.json --noEmit'];
const SHELL_CHAINING = /[;&|`<>]|\$\(|\r|\n/;

export function decideTool(policy: ToolPolicy, toolName: string, input: Record<string, unknown>): Decision {
  if (READ_TOOLS.has(toolName)) return decideRead(policy, input);
  if (WRITE_TOOLS.has(toolName)) {
    if (policy.readOnly) return { allow: false, reason: 'This is a read-only review. Do not change files; report what you found instead.' };
    return decideWrite(policy, toolName, input);
  }
  if (toolName === 'Bash') {
    if (policy.readOnly) return { allow: false, reason: 'This is a read-only review. Shell commands are not available.' };
    return decideCommand(policy, typeof input['command'] === 'string' ? input['command'] : '');
  }
  return { allow: false, reason: `The ${toolName} tool is not available in Refit. Use Read, Glob, Grep, Edit and Write, and run only the build, lint and test commands.` };
}

function decideRead(policy: ToolPolicy, input: Record<string, unknown>): Decision {
  const target = typeof input['file_path'] === 'string' ? input['file_path'] : typeof input['path'] === 'string' ? input['path'] : null;
  if (!target) return { allow: true };
  return inside(policy.root, target) ? { allow: true } : { allow: false, reason: `Only files inside the app folder (${policy.root}) can be read.` };
}

function decideWrite(policy: ToolPolicy, toolName: string, input: Record<string, unknown>): Decision {
  const target = typeof input['file_path'] === 'string' ? input['file_path'] : typeof input['notebook_path'] === 'string' ? input['notebook_path'] : null;
  if (!target) return { allow: false, reason: `${toolName} needs a file path.` };
  const absolute = path.resolve(policy.root, target);
  if (!inside(policy.root, absolute)) {
    return { allow: false, reason: `${target} is outside the app folder. Only the app's front-end files may change.` };
  }
  const relative = path.relative(policy.root, absolute).split(path.sep).join('/');
  const protectedBy = firstMatchingGlob(relative, policy.protectedPaths);
  if (protectedBy) {
    return {
      allow: false,
      reason: `${relative} is protected (it matches "${protectedBy}"): services, API calls, routing, auth, configuration and packages must not change. Keep the change in the page's component, template and styles, or mention the need in your report.`,
    };
  }
  let current: string | null;
  try {
    current = readFileSync(absolute, 'utf8');
  } catch {
    // A new file: only its content matters.
    current = null;
  }
  const next = typeof input['content'] === 'string' ? input['content'] : null;
  if (isDataAccessCode(relative, current) || isDataAccessCode(relative, next)) {
    return { allow: false, reason: `${relative} contains code that calls the backend, so it is protected. Do not change how or when data is loaded.` };
  }
  return { allow: true };
}

export function decideCommand(policy: ToolPolicy, command: string): Decision {
  const trimmed = command.trim().replace(/\s+/g, ' ');
  const allowed = [...policy.allowedCommands, ...EXTRA_COMMANDS].map((entry) => entry.trim().replace(/\s+/g, ' '));
  const list = allowed.slice(0, 4).join(', ');
  if (SHELL_CHAINING.test(trimmed)) {
    return { allow: false, reason: `Run one command at a time without ; & | > or $( ). Allowed commands: ${list}.` };
  }
  const ok = allowed.some((entry) => trimmed === entry || trimmed.startsWith(`${entry} `));
  return ok ? { allow: true } : { allow: false, reason: `Only the build, lint and test commands may run here (${list}). Git, package installs and other commands are blocked to keep the app safe.` };
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(root, target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** A short description of a tool call for the live log: the file or the command. */
export function describeToolInput(toolName: string, input: Record<string, unknown>, root: string): string {
  const value = input['file_path'] ?? input['notebook_path'] ?? input['command'] ?? input['pattern'] ?? input['path'];
  if (typeof value !== 'string') return '';
  if (toolName === 'Bash' || toolName === 'Grep' || toolName === 'Glob') return value.slice(0, 200);
  const relative = path.relative(root, path.resolve(root, value)).split(path.sep).join('/');
  return relative.startsWith('..') ? value : relative;
}
