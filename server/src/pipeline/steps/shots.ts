import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PageConfig, ShotPhase, Viewport } from '@refit/shared';
import { capturePage, type CaptureResult } from '../../browser/capture.js';
import { DevServer } from '../../browser/devserver.js';
import { pageUrl } from '../../browser/page-url.js';
import { DESKTOP, MOBILE } from '../../browser/session.js';
import { UserError } from '../../util/errors.js';
import { activity, log, StepFailure, type RunContext } from '../context.js';

const VIEWPORTS: ReadonlyArray<[Viewport, { width: number; height: number }]> = [
  ['desktop', DESKTOP],
  ['mobile', MOBILE],
];

/** Starts the app's dev server on its configured port and keeps it in the run's facts. */
export async function startDevServer(ctx: RunContext, purpose: string): Promise<DevServer> {
  activity(ctx, `Starting the app ${purpose}`);
  log(ctx, 'cmd', 'shell', `$ ${ctx.commands.serve}`);
  try {
    const server = await DevServer.start({
      command: ctx.commands.serve,
      cwd: ctx.paths.appFolder,
      env: ctx.env,
      port: ctx.app.port,
      timeoutMs: ctx.config.timeouts.serveMin * 60_000,
      signal: ctx.signal,
      onLine: (line) => ctx.emit({ type: 'log', level: 'out', source: 'shell', text: `dev server │ ${line}` }),
    });
    ctx.facts.devServer = server;
    log(ctx, 'info', 'refit', `The app is running at http://localhost:${ctx.app.port}.`);
    return server;
  } catch (error) {
    if (error instanceof UserError) throw new StepFailure(error.message, error.fix);
    throw error;
  }
}

export async function stopDevServer(ctx: RunContext): Promise<void> {
  const server = ctx.facts.devServer;
  ctx.facts.devServer = undefined;
  if (server) await server.stop();
}

/** The run's headless browser, opened on first use and released when the run ends. */
async function captureSession(ctx: RunContext) {
  if (!ctx.facts.capture) {
    try {
      ctx.facts.capture = await ctx.browser.acquireForCapture();
    } catch (error) {
      if (error instanceof UserError) throw new StepFailure(error.message, error.fix);
      throw error;
    }
  }
  return ctx.facts.capture;
}

export function shotFileName(pageId: string, phase: ShotPhase, viewport: Viewport): string {
  return `${pageId}-${phase}-${viewport}.jpg`;
}

export function shotPath(ctx: RunContext, pageId: string, phase: ShotPhase, viewport: Viewport): string {
  return path.join(ctx.paths.runDir, 'shots', shotFileName(pageId, phase, viewport));
}

/**
 * Takes desktop and mobile screenshots of a page and reports the desktop pass's API calls and
 * console errors. Emits a "shot" event for every image so the UI fills in live.
 */
export async function shootPage(ctx: RunContext, page: PageConfig, phase: ShotPhase): Promise<CaptureResult> {
  const session = await captureSession(ctx);
  const url = pageUrl({
    port: ctx.app.port,
    route: page.route,
    params: page.params,
    hashRouting: ctx.app.scan?.angular?.hashRouting ?? false,
    baseHref: ctx.app.scan?.angular?.baseHref ?? null,
  });
  let desktop: CaptureResult | null = null;
  for (const [viewport, size] of VIEWPORTS) {
    const file = shotPath(ctx, page.id, phase, viewport);
    const result = await capturePage(session.context, {
      url,
      file,
      viewport: size,
      record: viewport === 'desktop',
      appOrigin: `http://localhost:${ctx.app.port}`,
      settleCapMs: ctx.config.browser.settleCapSec * 1000,
      ...(ctx.signInHosts ? { signInHosts: ctx.signInHosts } : {}),
    });
    if (viewport === 'desktop') desktop = result;
    if (result.ok) {
      ctx.emit({ type: 'shot', pageId: page.id, phase, viewport, url: `/files/runs/${ctx.runId}/shots/${path.basename(file)}?v=${Date.now()}` });
    } else if (result.signInNeeded) {
      log(ctx, 'warn', 'refit', `${page.name}: the page went to the Microsoft sign-in page instead of showing the app.`);
      break;
    } else {
      log(ctx, 'warn', 'refit', `${page.name}: could not take the ${viewport} screenshot (${result.error ?? 'unknown error'}).`);
    }
  }
  return desktop!;
}

/** Puts a page's screenshots where the agent can open them (.refit/shots, ignored by git). */
export async function shareShots(ctx: RunContext, page: PageConfig, phase: ShotPhase = 'before'): Promise<{ relative: string[]; absolute: string[] }> {
  const folder = path.join(ctx.paths.appFolder, '.refit', 'shots');
  await fs.mkdir(folder, { recursive: true });
  const relative: string[] = [];
  const absolute: string[] = [];
  for (const [viewport] of VIEWPORTS) {
    const source = shotPath(ctx, page.id, phase, viewport);
    const name = shotFileName(page.id, phase, viewport);
    try {
      await fs.copyFile(source, path.join(folder, name));
      relative.push(`.refit/shots/${name}`);
      absolute.push(path.join(folder, name));
    } catch {
      // No before screenshot for this viewport (for example sign-in was needed).
    }
  }
  return { relative, absolute };
}

export const SIGN_IN_FIX =
  'Open Settings, choose "Sign in once" and sign in with a test account. Choose "Stay signed in? Yes" when Microsoft asks. Then start the run again.';
