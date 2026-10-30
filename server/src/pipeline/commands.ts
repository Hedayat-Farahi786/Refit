import type { AppRecord, CommandSet } from '@refit/shared';
import { UserError } from '../util/errors.js';

export interface EffectiveCommands extends CommandSet {
  /** The serve command with {port} filled in. */
  serve: string;
}

/** The commands a run uses: what the scan found, with the user's Advanced overrides on top. */
export function effectiveCommands(app: AppRecord): EffectiveCommands {
  const detected = app.scan?.commands;
  if (!detected) throw new UserError('This app has not been scanned yet.', 'Scan the app first.');
  const overrides = app.overrides;
  const install = overrides.install ?? detected.install;
  const installRetry = overrides.install
    ? /^npm (ci|install|i)\b/.test(overrides.install) && !overrides.install.includes('--legacy-peer-deps')
      ? `${overrides.install} --legacy-peer-deps`
      : undefined
    : detected.installRetry;
  const test = overrides.test ?? detected.test;
  return {
    install,
    ...(installRetry ? { installRetry } : {}),
    build: overrides.build ?? detected.build,
    ...(test ? { test } : {}),
    serve: (overrides.serve ?? detected.serve).replaceAll('{port}', String(app.port)),
    env: { ...detected.env, ...(overrides.env ?? {}) },
  };
}
