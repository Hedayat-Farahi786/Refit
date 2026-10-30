import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Brand } from '@refit/shared';
import { normalizeBrand, validateBrand } from '@refit/shared';
import type { ServerContext } from '../context.js';
import { parseBody } from '../http/validate.js';
import { UserError } from '../util/errors.js';

const hex = z.string().max(16);

const brandSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().max(80),
  status: z.enum(['draft', 'approved']),
  note: z.string().max(2000).default(''),
  primary: hex,
  surface: z.enum(['slate', 'zinc', 'neutral', 'stone']),
  colors: z.object({ success: hex, info: hex, warn: hex, danger: hex }).partial().optional(),
  fontFamily: z.string().max(300),
  headingFontFamily: z.string().max(300).optional(),
  fontImport: z.string().max(500).default(''),
  radius: z.number(),
  density: z.enum(['comfortable', 'compact']).optional(),
});

/** Turns a name into a brand ID: "Oerlikon Metco" -> "oerlikon-metco". */
export function brandIdFrom(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'brand';
}

function checked(brand: Brand): Brand {
  const issues = validateBrand(brand);
  if (issues.length > 0) throw new UserError(issues.map((issue) => issue.message).join(' '), 'Correct the brand values and save again.');
  return brand;
}

export function registerBrandRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/api/brands', async () => ctx.store.get((state) => state.brands));

  /** Creates a brand: a new one, a duplicate or an import. The ID comes from the name and is made unique. */
  app.post('/api/brands', async (request, reply) => {
    const body = parseBody(brandSchema, request.body);
    const taken = new Set(ctx.store.get((state) => state.brands.map((brand) => brand.id)));
    const base = brandIdFrom(body.id || body.name);
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    const brand = checked(normalizeBrand({ ...body, id }));
    const saved = ctx.store.update((state) => {
      const next = { ...brand, updatedAt: new Date().toISOString() };
      state.brands.push(next);
      return next;
    });
    ctx.bus.changed('brand-saved');
    return reply.code(201).send(saved);
  });

  app.put<{ Params: { id: string } }>('/api/brands/:id', async (request) => {
    const brand = checked(normalizeBrand({ ...parseBody(brandSchema, request.body), id: request.params.id }));
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
}
