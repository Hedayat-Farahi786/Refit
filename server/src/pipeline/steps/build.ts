import { succeeded, type ProcessResult } from '../../proc/run.js';
import { exec, log, type RunContext } from '../context.js';

const LEGACY_OPENSSL = '--openssl-legacy-provider';

/**
 * Runs the app's build. If it fails with Node's "ERR_OSSL_EVP_UNSUPPORTED" (webpack 4 on Node 17+),
 * retries once with the legacy OpenSSL provider and keeps that setting for the rest of the run.
 */
export async function runBuild(ctx: RunContext, label = 'Build'): Promise<ProcessResult> {
  const timeoutMin = ctx.config.timeouts.buildMin;
  const result = await exec(ctx, ctx.commands.build, { timeoutMin });
  if (succeeded(result) || ctx.signal.aborted) return result;
  const legacyAlreadyOn = (ctx.env['NODE_OPTIONS'] ?? '').includes(LEGACY_OPENSSL);
  if (!legacyAlreadyOn && result.tail.some((line) => line.includes('ERR_OSSL_EVP_UNSUPPORTED'))) {
    log(ctx, 'warn', 'refit', `${label} hit ERR_OSSL_EVP_UNSUPPORTED. Retrying with NODE_OPTIONS=${LEGACY_OPENSSL}.`);
    ctx.env['NODE_OPTIONS'] = `${ctx.env['NODE_OPTIONS'] ?? ''} ${LEGACY_OPENSSL}`.trim();
    return exec(ctx, ctx.commands.build, { timeoutMin });
  }
  return result;
}

/** The last lines of a failed command, for reports and fix prompts. */
export function logTail(result: ProcessResult, lines = 120): string[] {
  return result.tail.slice(-lines);
}
