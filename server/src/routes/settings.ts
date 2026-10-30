import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Brand, StateResponse } from '@refit/shared';
import { validateBrand } from '@refit/shared';
import { editablePart, saveLocalConfig } from '../config/config.js';
import type { ServerContext } from '../context.js';
import { openSse } from '../http/sse.js';
import { parseBody } from '../http/validate.js';
import { UserError } from '../util/errors.js';

const brandSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  status: z.enum(['draft', 'approved']),
  note: z.string().max(2000),
  primary: z.string(),
  surface: z.enum(['slate', 'zinc', 'neutral', 'stone']),
  fontFamily: z.string().max(300),
  fontImport: z.string().max(500),
  radius: z.number(),
});

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

  app.get('/api/brands', async () => ctx.store.get((state) => state.brands));

  app.put<{ Params: { id: string } }>('/api/brands/:id', async (request) => {
    const brand: Brand = { ...parseBody(brandSchema, request.body), id: request.params.id };
    const issues = validateBrand(brand);
    if (issues.length > 0) throw new UserError(issues.map((issue) => issue.message).join(' '), 'Correct the brand values and save again.');
    const saved = ctx.store.update((state) => {
      const next = { ...brand, updatedAt: new Date().toISOString() };
      const index = state.brands.findIndex((existing) => existing.id === brand.id);
      if (index === -1) state.brands.push(next);
      else state.brands[index] = next;
      return next;
    });
    ctx.bus.changed('brand-saved');
    return saved;
  });

  app.delete<{ Params: { id: string } }>('/api/brands/:id', async (request, reply) => {
    const { brands } = ctx.store.snapshot();
    if (!brands.some((brand) => brand.id === request.params.id)) throw new UserError('That brand does not exist any more.', 'Reload the page.', 404);
    if (brands.length === 1) throw new UserError('Refit needs at least one brand.', 'Create another brand before deleting this one.', 409);
    ctx.store.update((state) => {
      state.brands = state.brands.filter((brand) => brand.id !== request.params.id);
      if (state.settings.defaultBrandId === request.params.id) state.settings.defaultBrandId = state.brands[0]!.id;
    });
    ctx.bus.changed('brand-deleted');
    return reply.code(204).send();
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
