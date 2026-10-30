import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer, type Services } from '../../src/app.js';
import { loadConfig, type RefitConfig } from '../../src/config/config.js';
import type { ServerContext } from '../../src/context.js';
import { StateBus } from '../../src/events/bus.js';
import { resolvePaths } from '../../src/paths.js';
import { StateStore } from '../../src/store/store.js';
import { REPO_ROOT, tempDir } from './repos.js';

export interface TestServer {
  app: FastifyInstance;
  services: Services;
  ctx: ServerContext;
  /** Sends a request the way the Refit web page would (localhost host and origin). */
  call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<{ status: number; json: unknown }>;
}

export async function startTestServer(): Promise<TestServer> {
  const dataDir = await tempDir('refit-data-');
  const paths = resolvePaths({ root: REPO_ROOT, dataDir, workspacesDir: path.join(dataDir, 'workspaces') });
  let config: RefitConfig = await loadConfig({ defaultsFile: paths.configDefaults, localFile: paths.configLocal });
  const ctx: ServerContext = {
    paths,
    store: await StateStore.open(paths.state, paths.brands),
    bus: new StateBus(),
    version: 'test',
    dev: false,
    getConfig: () => config,
    setConfig: (next) => {
      config = next;
    },
  };
  const { app, services } = await createServer(ctx);
  await app.ready();
  return {
    app,
    services,
    ctx,
    async call(method, url, body) {
      const response = await app.inject({
        method,
        url,
        headers: { host: 'localhost:4700', origin: 'http://localhost:4700', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
      });
      return { status: response.statusCode, json: response.body ? safeJson(response.body) : null };
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
