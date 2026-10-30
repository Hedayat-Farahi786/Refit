import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { capturePage } from '../../src/browser/capture.js';
import { BrowserManager, DESKTOP, MOBILE } from '../../src/browser/session.js';
import { loadConfig, type RefitConfig } from '../../src/config/config.js';
import { REPO_ROOT, tempDir } from '../helpers/repos.js';
import { startMockIdp, startStaticSite, type MockServer } from '../helpers/mock-servers.js';

/** Real Chromium against small local pages: recording, popups and the sign-in session. */
let idp: MockServer;
let site: MockServer;
let config: RefitConfig;

beforeAll(async () => {
  config = await loadConfig({ defaultsFile: path.join(REPO_ROOT, 'refit.config.json'), localFile: path.join(REPO_ROOT, 'no-local.json') });
  config = { ...config, browser: { ...config.browser, settleCapSec: 4 } };
  idp = await startMockIdp();
  site = await startStaticSite({
    '/dashboard': `<!doctype html><title>Dashboard</title><body><h1>Dashboard</h1><div style="height:1400px"></div>
      <script>
        fetch('/api/requests?page=1'); fetch('/api/requests/7'); fetch('/assets/i18n/en.json');
        console.error('Widget failed at http://x/main.js:1:2');
      </script></body>`,
    '/guarded': `<!doctype html><title>Guarded</title><body><p id="state">Signing in…</p>
      <script>
        window.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'mock-token') {
            document.getElementById('state').textContent = 'Welcome, test user';
            fetch('/api/profile/42');
          }
        });
        window.open('${idp.url}/authorize', 'signin', 'width=420,height=520');
      </script></body>`,
  });
});

afterAll(async () => {
  await site.close();
  await idp.close();
});

function manager(dataDir: string): BrowserManager {
  return new BrowserManager(path.join(dataDir, 'browser-profile'), path.join(dataDir, 'browser-session.json'), () => config, () => undefined);
}

describe('capturePage', () => {
  it('takes desktop and mobile JPEGs and records normalized API calls and console errors', async () => {
    const dir = await tempDir();
    const browser = manager(dir);
    const session = await browser.acquireForCapture();
    try {
      const request = { url: `${site.url}/dashboard`, appOrigin: site.url, settleCapMs: 3000 };
      const desktop = await capturePage(session.context, { ...request, file: path.join(dir, 'dash-desktop.jpg'), viewport: DESKTOP, record: true });
      const mobile = await capturePage(session.context, { ...request, file: path.join(dir, 'dash-mobile.jpg'), viewport: MOBILE, record: false });
      expect(desktop.ok, desktop.error).toBe(true);
      expect(desktop.apiCalls).toEqual([`GET ${new URL(site.url).host}/api/requests`, `GET ${new URL(site.url).host}/api/requests/:id`]);
      expect(desktop.consoleErrors.join(' ')).toContain('Widget failed');
      expect(mobile.ok).toBe(true);
      expect(mobile.apiCalls).toEqual([]);
      const jpeg = await fs.readFile(path.join(dir, 'dash-desktop.jpg'));
      expect(jpeg.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
      expect(jpeg.length).toBeGreaterThan(1000);
    } finally {
      await session.release();
    }
  });

  it('reports "sign-in needed" when the sign-in popup stays open', async () => {
    const dir = await tempDir();
    const session = await manager(dir).acquireForCapture();
    try {
      const result = await capturePage(session.context, {
        url: `${site.url}/guarded`,
        file: path.join(dir, 'guarded.jpg'),
        viewport: DESKTOP,
        record: true,
        appOrigin: site.url,
        settleCapMs: 2500,
        signInHosts: [new URL(idp.url).host],
      });
      expect(result.signInNeeded).toBe(true);
      expect(result.ok).toBe(false);
    } finally {
      await session.release();
    }
  });
});

describe('sign in once, then headless runs', () => {
  it.each(['persistent', 'session'])('reuses a %s sign-in cookie in later headless captures', async (kind) => {
    const dir = await tempDir();
    const browser = manager(dir);
    await browser.openSignIn({ url: `${idp.url}/authorize?autologin=${kind}`, headless: true });
    expect(browser.signInOpen).toBe(true);
    await expect(browser.acquireForCapture()).rejects.toThrow(/sign-in window is open/);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const savedAt = await browser.finishSignIn();
    expect(new Date(savedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(browser.signInOpen).toBe(false);

    const session = await browser.acquireForCapture();
    try {
      const file = path.join(dir, 'guarded.jpg');
      const result = await capturePage(session.context, {
        url: `${site.url}/guarded`,
        file,
        viewport: DESKTOP,
        record: true,
        appOrigin: site.url,
        settleCapMs: 4000,
        signInHosts: [new URL(idp.url).host],
      });
      expect(result.signInNeeded).toBe(false);
      expect(result.ok, result.error).toBe(true);
      expect(result.apiCalls).toContain(`GET ${new URL(site.url).host}/api/profile/:id`);
    } finally {
      await session.release();
    }
  });
});
