import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Refit can clone repos, run commands and push branches, so it must only obey the person at
 * this computer. It listens on 127.0.0.1 only, and this hook rejects:
 * - requests whose Host is not localhost (blocks DNS-rebinding attacks from websites), and
 * - state-changing requests sent by another website (blocks cross-site form posts).
 */
export function registerLocalOnlyGuard(app: FastifyInstance, options: { port: number; devPorts: number[] }): void {
  const ports = [options.port, ...options.devPorts];
  const hosts = new Set<string>();
  const origins = new Set<string>();
  for (const port of ports) {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      hosts.add(`${host}:${port}`);
      origins.add(`http://${host}:${port}`);
    }
  }

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const host = (request.headers.host ?? '').toLowerCase();
    if (!hosts.has(host)) {
      return reply.code(403).send({ error: 'Refit only answers requests sent to localhost.', fix: `Open http://localhost:${options.port} in your browser.` });
    }
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const origin = request.headers.origin;
    const site = request.headers['sec-fetch-site'];
    if ((origin && !origins.has(origin.toLowerCase())) || site === 'cross-site') {
      return reply.code(403).send({ error: 'Refit refused a request sent by another website.', fix: 'Use Refit from its own page at localhost.' });
    }
    return;
  });
}
