import { appRelative, enforceGuard } from '../../guard/guard.js';
import { log, type RunContext } from '../context.js';

/**
 * Runs the guard after an agent task: reverts protected changes, records them and the sensitive
 * ones, and reports the changed files. Returns the kept changes, relative to the app folder.
 */
export async function runGuard(ctx: RunContext, checkpoint: string, pageId?: string): Promise<string[]> {
  const result = await enforceGuard(ctx.paths.workspace, checkpoint, ctx.guardPolicy);
  for (const reverted of result.reverted) {
    ctx.facts.protectedReverts.push({ file: reverted.file, reason: reverted.reason, ...(pageId ? { pageId } : {}) });
    log(ctx, 'warn', 'guard', `Reverted ${reverted.file}: ${reverted.reason}. Agents may not change it.`);
  }
  for (const file of result.changed) if (file.sensitive && !file.reverted) ctx.facts.sensitiveChanges.add(file.file);
  ctx.emit({ type: 'files', changed: result.changed, ...(pageId ? { pageId } : {}) });
  return result.changed.filter((file) => !file.reverted).map((file) => appRelative(file.file, ctx.appDir) ?? file.file);
}

/** File paths (relative to the app folder) that a build log points at, for the fix prompt. */
export function filesInLog(lines: readonly string[]): string[] {
  const found = new Set<string>();
  for (const line of lines) {
    for (const match of line.matchAll(/((?:[\w.@-]+\/)+[\w.-]+\.(?:ts|html|scss|css|sass|less))(?=[:(\s]|$)/g)) {
      const file = match[1]!.replace(/^\.\//, '');
      if (!file.includes('node_modules/')) found.add(file);
    }
  }
  return [...found].slice(0, 20);
}
