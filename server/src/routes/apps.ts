import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isGitRepo } from '../git/git.js';
import { parseBody } from '../http/validate.js';
import type { AppService } from '../services/apps.js';
import { isDirectory, pathExists, readJsonIfExists } from '../util/fs.js';
import { UserError } from '../util/errors.js';

const port = z.number().int().min(1024, 'Use a port from 1024 to 65535').max(65535, 'Use a port from 1024 to 65535');

const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('local'), path: z.string().trim().min(1, 'Enter the folder path') }),
  z.object({ kind: z.literal('git'), url: z.string().trim().min(1, 'Enter the git URL'), subdir: z.string().optional() }),
]);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80),
  source: sourceSchema,
  port,
});

const pageSchema = z.object({
  id: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1, 'Every page needs a name').max(120),
  route: z.string().trim().startsWith('/', 'Routes start with /'),
  include: z.boolean(),
  params: z.record(z.string(), z.string()),
  files: z.array(z.string().trim().min(1)).max(50),
  componentFile: z.string().optional(),
  manual: z.boolean(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  port: port.optional(),
  pages: z.array(pageSchema).max(500).optional(),
  overrides: z
    .object({
      install: z.string().optional(),
      build: z.string().optional(),
      test: z.string().optional(),
      serve: z.string().optional(),
      env: z.record(z.string(), z.string()).optional(),
      nodeDir: z.string().optional(),
    })
    .optional(),
  subdir: z.string().optional(),
});

export function registerAppRoutes(app: FastifyInstance, apps: AppService, refitPort: number): void {
  app.post('/api/apps', async (request, reply) => {
    const body = parseBody(createSchema, request.body);
    if (body.port === refitPort) {
      throw new UserError(`Port ${refitPort} is used by Refit itself.`, 'Use the port the app normally runs on, usually 4200.');
    }
    const created = apps.create(body);
    return reply.code(201).send(created);
  });

  app.patch<{ Params: { id: string } }>('/api/apps/:id', async (request) => {
    const body = parseBody(patchSchema, request.body);
    if (body.port === refitPort) throw new UserError(`Port ${refitPort} is used by Refit itself.`, 'Use the port the app normally runs on.');
    const ids = new Set<string>();
    for (const page of body.pages ?? []) {
      if (ids.has(page.id)) throw new UserError(`Two pages have the ID "${page.id}".`, 'Give each page a different route.');
      ids.add(page.id);
    }
    return apps.update(request.params.id, body);
  });

  app.delete<{ Params: { id: string } }>('/api/apps/:id', async (request, reply) => {
    await apps.remove(request.params.id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/apps/:id/scan', async (request, reply) => {
    apps.get(request.params.id);
    apps.startScan(request.params.id);
    return reply.code(202).send(apps.get(request.params.id));
  });

  /** Live check of a folder in the "Add app" dialog. */
  app.get<{ Querystring: { path?: string } }>('/api/inspect-folder', async (request) => {
    const raw = (request.query.path ?? '').trim().replace(/^["']|["']$/g, '');
    if (!raw) return { ok: false, message: 'Enter the full path of the app folder.' };
    if (!path.isAbsolute(raw)) return { ok: false, message: 'Use the full path, starting from the drive or the root folder.' };
    if (!(await pathExists(raw))) return { ok: false, message: 'This folder does not exist.' };
    if (!(await isDirectory(raw))) return { ok: false, message: 'This is a file, not a folder.' };
    const pkg = await readJsonIfExists<{ name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(path.join(raw, 'package.json')).catch(() => null);
    const deps = { ...pkg?.devDependencies, ...pkg?.dependencies };
    const angular = deps['@angular/core'] ?? null;
    const git = await isGitRepo(raw);
    const suggestedName = pkg?.name ? titleFromPackageName(pkg.name) : titleFromPackageName(path.basename(raw));
    if (!pkg) return { ok: true, warning: 'No package.json here. Choose the folder of the Angular app.', git, angular, suggestedName };
    if (!angular) return { ok: true, warning: 'This folder has no Angular dependency.', git, angular, suggestedName };
    if (!git) return { ok: true, warning: 'This folder is not a git repository yet.', git, angular, suggestedName };
    return { ok: true, git, angular, suggestedName, message: `Angular ${angular.replace(/^[\^~]/, '')} app` };
  });
}

/** "@oerlikon/request-portal" -> "Request portal". */
export function titleFromPackageName(name: string): string {
  const base = name.replace(/^@[^/]+\//, '').replace(/[-_.]+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : name;
}
