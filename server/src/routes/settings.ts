import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { StateResponse } from '@refit/shared';
import { editablePart, saveLocalConfig } from '../config/config.js';
import type { ServerContext } from '../context.js';
import { openSse } from '../http/sse.js';
import { parseBody } from '../http/validate.js';
import { UserError } from '../util/errors.js';

export function registerSettingsRoutes(app: FastifyInstance, ctx: ServerContext, live: { activeRunId: () => string | null; signInOpen: () => boolean }): void {
  app.get('/api/state', async (): Promise<StateResponse> => {
    const state = ctx.store.snapshot();
    const config = ctx.getConfig();
    return {
      version: ctx.version,
      apps: state.apps,
      runs: [...state.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      brands: state.brands,
      settings: state.settings,
      config: { ...editablePart(config), targetAngularMajor: config.targetAngularMajor, port: config.port },
      activeRunId: live.activeRunId(),
      signInOpen: live.signInOpen(),
      platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux',
    };
  });

  app.put('/api/settings', async (request) => {
    const body = parseBody(z.object({ defaultBrandId: z.string() }), request.body);
    if (!ctx.store.get((state) => state.brands.some((brand) => brand.id === body.defaultBrandId))) {
      throw new UserError('That brand does not exist.', 'Choose one of the brands in the list.');
    }
    const settings = ctx.store.update((state) => {
      state.settings.defaultBrandId = body.defaultBrandId;
      return state.settings;
    });
    ctx.bus.changed('settings-saved');
    return settings;
  });

  app.get('/api/config', async () => editablePart(ctx.getConfig()));

  app.put('/api/config', async (request) => {
    const config = await saveLocalConfig({ defaultsFile: ctx.paths.configDefaults, localFile: ctx.paths.configLocal }, request.body);
    ctx.setConfig(config);
    ctx.bus.changed('config-saved');
    return editablePart(config);
  });

  app.get('/api/events', async (request, reply) => {
    const stream = openSse(request, reply);
    stream.send({ type: 'state-changed', reason: 'connected' });
    const unsubscribe = ctx.bus.subscribe((event) => stream.send(event));
    stream.onClose(unsubscribe);
  });
}
