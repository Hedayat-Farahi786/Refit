import { promises as fs } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiError } from '@refit/shared';
import { BrowserManager } from './browser/session.js';
import type { ServerContext } from './context.js';
import { registerLocalOnlyGuard } from './http/security.js';
import { createProviderRegistry } from './providers/registry.js';
import type { ProviderRegistry } from './providers/types.js';
import { registerAppRoutes } from './routes/apps.js';
import { registerBrowserRoutes } from './routes/browser.js';
import { registerRunRoutes } from './routes/runs.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { AppService } from './services/apps.js';
import { RunService } from './services/runs.js';
import { UserError } from './util/errors.js';
import { pathExists } from './util/fs.js';

export interface Services {
  apps: AppService;
  runs: RunService;
  providers: ProviderRegistry;
  browser: BrowserManager;
}

export interface ServerOptions {
  /** Replaces the provider registry (tests use a fast dry run). */
  providers?: ProviderRegistry;
  /** Extra hosts that count as a sign-in page (tests use a mock identity provider). */
  signInHosts?: readonly string[];
}

export const DEV_WEB_PORT = 4701;

export async function createServer(ctx: ServerContext, options: ServerOptions = {}): Promise<{ app: FastifyInstance; services: Services }> {
  const app = Fastify({ logger: false, bodyLimit: 5 * 1024 * 1024 });
  // Only JSON bodies: a cross-site form cannot send application/json without a CORS preflight.
  app.removeContentTypeParser('text/plain');

  const config = ctx.getConfig();
  registerLocalOnlyGuard(app, { port: config.port, devPorts: ctx.dev ? [DEV_WEB_PORT] : [] });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof UserError) {
      const body: ApiError = { error: error.message, ...(error.fix ? { fix: error.fix } : {}) };
      return reply.code(error.status).send(body);
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: (error as Error).message } satisfies ApiError);
    }
    console.error('Refit: unexpected error while handling a request:', error);
    return reply.code(500).send({
      error: 'Something went wrong inside Refit.',
      fix: 'Try again. If it keeps happening, check the terminal where Refit runs for details.',
    } satisfies ApiError);
  });

  const apps = new AppService(ctx);
  const providers = options.providers ?? createProviderRegistry({});
  const browser = new BrowserManager(path.join(ctx.paths.data, 'browser-profile'), path.join(ctx.paths.data, 'browser-session.json'), ctx.getConfig, (status, message) => {
    ctx.bus.emit({ type: 'sign-in', status, ...(message ? { message } : {}) });
    if (status === 'saved' || status === 'closed') {
      void browser.lastSavedAt().then((savedAt) => {
        if (savedAt) ctx.store.update((state) => (state.settings.lastSignInAt = savedAt));
        ctx.bus.changed('sign-in');
      });
    } else {
      ctx.bus.changed('sign-in');
    }
  });
  const runs = new RunService(ctx, providers, apps, browser, options.signInHosts);
  const services: Services = { apps, runs, providers, browser };
  app.addHook('onClose', async () => browser.shutdown());

  app.get('/api/health', async () => ({ ok: true, version: ctx.version }));
  registerSettingsRoutes(app, ctx, { activeRunId: () => runs.activeRunId(), signInOpen: () => browser.signInOpen });
  registerBrowserRoutes(app, browser, () => runs.activeRunId() !== null);
  registerAppRoutes(app, services.apps, config.port);
  registerRunRoutes(app, runs, providers);

  await registerFiles(app, ctx);
  await registerWeb(app, ctx);
  return { app, services };
}

/** Screenshots and other run files under /files/runs/... (read-only, no folder listings). */
async function registerFiles(app: FastifyInstance, ctx: ServerContext): Promise<void> {
  await fs.mkdir(ctx.paths.runs, { recursive: true });
  await app.register(fastifyStatic, {
    root: ctx.paths.runs,
    prefix: '/files/runs/',
    decorateReply: false,
    index: false,
    list: false,
    dotfiles: 'deny',
    cacheControl: true,
    maxAge: 60_000,
  });
}

async function registerWeb(app: FastifyInstance, ctx: ServerContext): Promise<void> {
  const indexFile = path.join(ctx.paths.webDist, 'index.html');
  const built = await pathExists(indexFile);
  if (built) {
    await app.register(fastifyStatic, { root: ctx.paths.webDist, prefix: '/', wildcard: false, index: ['index.html'] });
  }
  app.setNotFoundHandler(async (request, reply) => {
    if (request.method !== 'GET' || request.url.startsWith('/api/') || request.url.startsWith('/files/')) {
      return reply.code(404).send({ error: 'Not found.' } satisfies ApiError);
    }
    if (!built) {
      return reply
        .code(503)
        .type('text/html; charset=utf-8')
        .send(
          '<!doctype html><meta charset="utf-8"><title>Refit</title><body style="font-family:system-ui;padding:40px;max-width:640px">' +
            '<h1>Refit is running, but its web UI is not built yet</h1>' +
            '<p>Stop Refit and start it with <code>npm start</code> (which builds the UI first), or use <code>npm run dev</code> while developing.</p></body>',
        );
    }
    // Single-page app: every other GET serves index.html and the Angular router takes over.
    return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(await fs.readFile(indexFile));
  });
}
