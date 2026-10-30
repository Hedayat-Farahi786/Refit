import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Refit's project folder (the one with refit.config.json), from server/src or server/dist. */
export const REFIT_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export interface RefitPaths {
  root: string;
  data: string;
  state: string;
  runs: string;
  sources: string;
  browserProfile: string;
  workspaces: string;
  playbook: string;
  brands: string;
  fixtures: string;
  webDist: string;
  configDefaults: string;
  configLocal: string;
  env: string;
}

export function resolvePaths(options: { root?: string; dataDir?: string; workspacesDir?: string } = {}): RefitPaths {
  const root = path.resolve(options.root ?? process.env['REFIT_ROOT'] ?? REFIT_ROOT);
  const data = path.resolve(root, options.dataDir ?? process.env['REFIT_DATA_DIR'] ?? 'data');
  const workspaces = path.resolve(root, options.workspacesDir ?? process.env['REFIT_WORKSPACES_DIR'] ?? 'workspaces');
  return {
    root,
    data,
    state: path.join(data, 'state.json'),
    runs: path.join(data, 'runs'),
    sources: path.join(data, 'sources'),
    browserProfile: path.join(data, 'browser-profile'),
    workspaces,
    playbook: path.join(root, 'playbook'),
    brands: path.join(root, 'brand'),
    fixtures: path.join(root, 'fixtures'),
    webDist: path.join(root, 'web', 'dist', 'web', 'browser'),
    configDefaults: path.join(root, 'refit.config.json'),
    configLocal: path.join(data, 'config.local.json'),
    env: path.join(root, '.env'),
  };
}
