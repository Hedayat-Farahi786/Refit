import { promises as fs } from 'node:fs';
import { createServer } from './app.js';
import { loadConfig, type RefitConfig } from './config/config.js';
import type { ServerContext } from './context.js';
import { StateBus } from './events/bus.js';
import { resolvePaths } from './paths.js';
import { killAllProcesses } from './proc/run.js';
import { StateStore } from './store/store.js';
import { UserError } from './util/errors.js';
import { pathExists, readJsonIfExists } from './util/fs.js';
import { refreshSecretValues } from './util/redact.js';

async function main(): Promise<void> {
  const basePaths = resolvePaths();
  if (await pathExists(basePaths.env)) {
    process.loadEnvFile(basePaths.env);
    refreshSecretValues();
  }
  let config: RefitConfig = await loadConfig({ defaultsFile: basePaths.configDefaults, localFile: basePaths.configLocal });
  // REFIT_PORT (used by the end-to-end tests) overrides the configured port everywhere.
  if (process.env['REFIT_PORT']) config = { ...config, port: Number(process.env['REFIT_PORT']) };
  const paths = resolvePaths({ workspacesDir: config.workspacesDir });
  await fs.mkdir(paths.data, { recursive: true });

  const store = await StateStore.open(paths.state, paths.brands);
  const pkg = await readJsonIfExists<{ version?: string }>(`${paths.root}/package.json`);
  const ctx: ServerContext = {
    paths,
    store,
    bus: new StateBus(),
    version: pkg?.version ?? '0.0.0',
    dev: process.env['REFIT_DEV'] === '1',
    getConfig: () => config,
    setConfig: (next) => {
      config = process.env['REFIT_PORT'] ? { ...next, port: Number(process.env['REFIT_PORT']) } : next;
    },
  };

  const { app } = await createServer(ctx);
  const port = config.port;
  try {
    await app.listen({ host: '127.0.0.1', port });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new UserError(
        `Port ${port} is already in use, so Refit cannot start.`,
        `Another Refit may already be running: open http://localhost:${port}. Otherwise stop the program using the port, or change "port" in refit.config.json.`,
      );
    }
    throw error;
  }
  console.log(`\n  Refit ${ctx.version} is running at http://localhost:${port}\n  Press Ctrl+C to stop.\n`);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`\nRefit: stopping (${signal})...`);
    await killAllProcesses();
    await app.close();
    await store.flush();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('Ctrl+C'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  if (error instanceof UserError) {
    console.error(`\nRefit could not start: ${error.message}${error.fix ? `\n${error.fix}` : ''}\n`);
  } else {
    console.error('\nRefit could not start because of an unexpected error:\n', error);
  }
  process.exit(1);
});
