import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { openSse } from '../http/sse.js';
import { parseBody } from '../http/validate.js';
import type { ProviderRegistry } from '../providers/types.js';
import type { RunService } from '../services/runs.js';

const settingsSchema = z.object({
  provider: z.enum(['claude', 'copilot', 'dryrun']).optional(),
  brandId: z.string().optional(),
  targetAngularMajor: z.union([z.number().int().min(18).max(30), z.literal('keep')]).optional(),
  polishRounds: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  runTests: z.boolean().optional(),
  perPageUsd: z.number().min(0).max(1000).optional(),
  perRunUsd: z.number().min(0).max(1000).optional(),
  onApiChange: z.enum(['flag', 'rollback']).optional(),
  strongModelForComplexPages: z.boolean().optional(),
});

export function registerRunRoutes(app: FastifyInstance, runs: RunService, providers: ProviderRegistry): void {
  app.get('/api/providers', async () => providers.statuses());

  app.post<{ Params: { id: string } }>('/api/apps/:id/runs', async (request, reply) => {
    const settings = parseBody(settingsSchema, request.body);
    const clean = Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined));
    return reply.code(201).send(await runs.start(request.params.id, clean));
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id', async (request) => runs.get(request.params.id));

  app.post<{ Params: { id: string } }>('/api/runs/:id/cancel', async (request, reply) => {
    runs.cancel(request.params.id);
    return reply.code(202).send({ ok: true });
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id/changes', async (request) => runs.changes(request.params.id));

  app.get<{ Params: { id: string }; Querystring: { file?: string } }>('/api/runs/:id/diff', async (request) => {
    const file = request.query.file ?? '';
    return { file, diff: await runs.diff(request.params.id, file) };
  });

  app.get<{ Params: { id: string } }>('/api/runs/:id/report', async (request, reply) => {
    return reply.type('text/markdown; charset=utf-8').send(await runs.report(request.params.id));
  });

  app.delete<{ Params: { id: string } }>('/api/runs/:id/workspace', async (request, reply) => {
    await runs.removeWorkspace(request.params.id);
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/runs/:id', async (request, reply) => {
    await runs.remove(request.params.id);
    return reply.code(204).send();
  });

  /**
   * Replays a run's events, then streams new ones while it runs. Resumes after the
   * Last-Event-ID header (automatic browser reconnects) or the ?after= query parameter.
   */
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>('/api/runs/:id/events', async (request, reply) => {
    const runId = request.params.id;
    runs.get(runId);
    const header = request.headers['last-event-id'];
    const after = Number((Array.isArray(header) ? header[0] : header) ?? request.query.after ?? 0) || 0;
    const stream = openSse(request, reply);
    let lastSent = after;
    const send = (event: { seq: number }) => {
      if (event.seq <= lastSent) return;
      lastSent = event.seq;
      stream.send(event, event.seq);
    };
    // Subscribe first, then replay, so nothing that happens in between is lost.
    const pending: Array<{ seq: number }> = [];
    let replaying = true;
    const unsubscribe = runs.subscribe(runId, (event) => (replaying ? pending.push(event) : send(event)));
    for (const event of await runs.events(runId, after)) send(event);
    for (const event of pending) send(event);
    replaying = false;
    if (unsubscribe) {
      stream.onClose(unsubscribe);
    } else {
      // The run is finished: tell the browser there is nothing more, so it stops reconnecting.
      stream.send({ type: 'stream-end' });
    }
  });
}
