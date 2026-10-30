import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/** End-to-end tests of Refit's own UI. They start a real Refit with a throwaway data folder. */
const port = 4711;
const dataDir = path.join(os.tmpdir(), `refit-e2e-${process.pid}`);
process.env['REFIT_E2E_DATA_DIR'] = dataDir;

export default defineConfig({
  testDir: '.',
  outputDir: '../../test-results/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'node scripts/start.mjs',
    cwd: path.resolve(import.meta.dirname, '../..'),
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      REFIT_PORT: String(port),
      REFIT_DATA_DIR: dataDir,
      REFIT_WORKSPACES_DIR: path.join(dataDir, 'workspaces'),
      // Never real AI in end-to-end tests. Empty values also win over a developer's .env,
      // because loading .env does not replace variables that are already set.
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_AUTH_TOKEN: '',
      CLAUDE_CODE_USE_BEDROCK: '',
      CLAUDE_CODE_USE_VERTEX: '',
      CLAUDE_CODE_USE_FOUNDRY: '',
      COPILOT_GITHUB_TOKEN: '',
      GH_TOKEN: '',
      GITHUB_TOKEN: '',
    },
    stdout: 'pipe',
  },
});
