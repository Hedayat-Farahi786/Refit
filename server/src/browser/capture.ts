import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { errorMessage } from '../util/errors.js';
import { isSignInUrl, normalizeApiCall } from './api-calls.js';

export interface CaptureRequest {
  url: string;
  /** Absolute path of the JPEG to write. */
  file: string;
  viewport: { width: number; height: number };
  /** Record API calls and console errors (done on the desktop pass). */
  record: boolean;
  appOrigin: string;
  /** Longest wait for network idle and popups, in milliseconds. */
  settleCapMs: number;
  /** Extra sign-in hosts (used by tests with a mock identity provider). */
  signInHosts?: readonly string[];
}

export interface CaptureResult {
  ok: boolean;
  signInNeeded: boolean;
  finalUrl: string;
  apiCalls: string[];
  consoleErrors: string[];
  error?: string;
}

const MAX_HEIGHT = 9000;
const STILL_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}';

/**
 * Opens a page and takes a full-page JPEG after it has settled: network idle, MSAL popups closed,
 * animations and the caret turned off. Records API calls and console errors when asked.
 */
export async function capturePage(context: BrowserContext, request: CaptureRequest): Promise<CaptureResult> {
  const page = await context.newPage();
  const apiCalls: string[] = [];
  const consoleErrors: string[] = [];
  const popups = new Set<Page>();
  try {
    await page.setViewportSize(request.viewport);
    if (request.record) {
      page.on('request', (req) => {
        if (req.resourceType() !== 'xhr' && req.resourceType() !== 'fetch') return;
        const key = normalizeApiCall(req.method(), req.url(), request.appOrigin, request.signInHosts);
        if (key) apiCalls.push(key);
      });
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('pageerror', (error) => consoleErrors.push(error.message));
    }
    page.on('popup', (popup) => {
      popups.add(popup);
      popup.on('close', () => popups.delete(popup));
    });

    await page.goto(request.url, { waitUntil: 'load', timeout: 60_000 }).catch(() => undefined);
    await settle(page, request.settleCapMs);
    await waitForPopups(popups, request.settleCapMs);
    await settle(page, request.settleCapMs / 2);

    const stuckPopup = [...popups].find((popup) => isSignInUrl(popup.url(), request.signInHosts));
    if (isSignInUrl(page.url(), request.signInHosts) || stuckPopup) {
      return { ok: false, signInNeeded: true, finalUrl: page.url(), apiCalls, consoleErrors };
    }

    await page.addStyleTag({ content: STILL_CSS }).catch(() => undefined);
    await page.waitForTimeout(300);
    await fs.mkdir(path.dirname(request.file), { recursive: true });
    const height = Number(await page.evaluate('document.documentElement.scrollHeight').catch(() => request.viewport.height));
    await page.screenshot({
      path: request.file,
      type: 'jpeg',
      quality: 72,
      animations: 'disabled',
      caret: 'hide',
      ...(height > MAX_HEIGHT ? { clip: { x: 0, y: 0, width: request.viewport.width, height: MAX_HEIGHT } } : { fullPage: true }),
    });
    return { ok: true, signInNeeded: false, finalUrl: page.url(), apiCalls: [...new Set(apiCalls)].sort(), consoleErrors };
  } catch (error) {
    return { ok: false, signInNeeded: false, finalUrl: page.url(), apiCalls, consoleErrors, error: errorMessage(error) };
  } finally {
    for (const popup of popups) await popup.close().catch(() => undefined);
    await page.close().catch(() => undefined);
  }
}

async function settle(page: Page, capMs: number): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: Math.max(1000, capMs) }).catch(() => undefined);
}

/** MSAL sometimes signs in through a popup; wait for it to finish and close. */
async function waitForPopups(popups: Set<Page>, capMs: number): Promise<void> {
  const deadline = Date.now() + capMs;
  while (popups.size > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
