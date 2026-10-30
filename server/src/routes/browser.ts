import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { BrowserManager } from '../browser/session.js';
import { parseBody } from '../http/validate.js';
import { UserError } from '../util/errors.js';

export function registerBrowserRoutes(app: FastifyInstance, browser: BrowserManager, runActive: () => boolean): void {
  app.get('/api/browser', async () => ({ signInOpen: browser.signInOpen, lastSignInAt: await browser.lastSavedAt() }));

  /** Opens the visible "Sign in once" window. */
  app.post('/api/browser/sign-in', async (request, reply) => {
    const body = parseBody(z.object({ url: z.string().url().startsWith('http').optional() }), request.body);
    if (runActive()) throw new UserError('A run is using the browser right now.', 'Wait for the run to finish, then sign in.', 409);
    await browser.openSignIn(body.url ? { url: body.url } : {});
    return reply.code(202).send({ signInOpen: true });
  });

  /** Saves the session and closes the window. */
  app.post('/api/browser/sign-in/done', async () => ({ lastSignInAt: await browser.finishSignIn() }));
}
