import path from 'node:path';

export const IS_WINDOWS = process.platform === 'win32';

/**
 * Finds the PATH key in an environment object. Windows spells it "Path", and copying
 * process.env into a plain object makes the key case-sensitive.
 */
export function pathKey(env: NodeJS.ProcessEnv): string {
  if (!IS_WINDOWS) return 'PATH';
  return Object.keys(env).find((key) => key.toUpperCase() === 'PATH') ?? 'Path';
}

/** Environment for child processes: quiet, non-interactive, no colors, nothing that waits for a person. */
export function childEnv(extra: Record<string, string | undefined> = {}, nodeDir?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    NG_CLI_ANALYTICS: 'false',
    NG_FORCE_TTY: 'false',
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_AUDIT: 'false',
    DISABLE_OPENCOLLECTIVE: '1',
    ADBLOCK: '1',
  };
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  if (nodeDir) {
    const key = pathKey(env);
    env[key] = `${nodeDir}${path.delimiter}${env[key] ?? ''}`;
  }
  return env;
}
