import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Cookie } from 'playwright';
import type { RefitConfig } from '../config/config.js';
import { UserError } from '../util/errors.js';
import { readJsonIfExists, writeFileAtomic } from '../util/fs.js';

export const DEFAULT_SIGN_IN_URL = 'https://login.microsoftonline.com/';
export const DESKTOP = { width: 1440, height: 900 } as const;
export const MOBILE = { width: 390, height: 844 } as const;

interface SavedSession {
  savedAt: string;
  cookies: Cookie[];
}

export type SignInStatus = 'open' | 'saved' | 'closed' | 'failed';

/** A headless browser that a run holds while it takes screenshots. */
export interface CaptureSession {
  context: BrowserContext;
  release(): Promise<void>;
}

/**
 * Owns Refit's browser profile (data/browser-profile). The "Sign in once" window and headless
 * screenshots share it, so MSAL signs in silently later, like a browser that remembers you.
 * Chromium locks a profile while it is open, so only one of the two can use it at a time.
 */
export class BrowserManager {
  private holder: 'sign-in' | 'capture' | null = null;
  private signInContext: BrowserContext | null = null;
  private poll: NodeJS.Timeout | null = null;

  constructor(
    private readonly profileDir: string,
    private readonly sessionFile: string,
    private readonly config: () => RefitConfig,
    private readonly onSignIn: (status: SignInStatus, message?: string) => void,
  ) {}

  get signInOpen(): boolean {
    return this.holder === 'sign-in';
  }

  get busyCapturing(): boolean {
    return this.holder === 'capture';
  }

  async lastSavedAt(): Promise<string | null> {
    return (await this.readSession())?.savedAt ?? null;
  }

  /** Opens the profile in a visible window so a person can sign in (with MFA and popups). */
  async openSignIn(options: { url?: string; headless?: boolean } = {}): Promise<void> {
    if (this.holder === 'sign-in') throw new UserError('The sign-in window is already open.', 'Look for it on your screen, finish signing in, then choose "I\'m signed in".', 409);
    if (this.holder === 'capture') throw new UserError('A run is using the browser right now.', 'Wait for the run to finish, then sign in.', 409);
    this.holder = 'sign-in';
    try {
      const context = await this.launch(options.headless ?? false);
      this.signInContext = context;
      context.on('close', () => void this.closedByUser());
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(options.url ?? DEFAULT_SIGN_IN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => undefined);
      // Save cookies every few seconds: then closing the window also keeps the session.
      this.poll = setInterval(() => void this.saveCookies(context).catch(() => undefined), 3000);
      this.onSignIn('open');
    } catch (error) {
      this.holder = null;
      this.signInContext = null;
      throw error;
    }
  }

  /** Saves the session (including session cookies) and closes the window. Returns the time saved. */
  async finishSignIn(): Promise<string> {
    const context = this.signInContext;
    if (!context || this.holder !== 'sign-in') throw new UserError('The sign-in window is not open.', 'Choose "Sign in once" first.', 409);
    const savedAt = await this.saveCookies(context);
    this.stopPolling();
    this.signInContext = null;
    await context.close().catch(() => undefined);
    this.holder = null;
    this.onSignIn('saved');
    return savedAt;
  }

  private async closedByUser(): Promise<void> {
    if (this.holder !== 'sign-in' || !this.signInContext) return;
    this.stopPolling();
    this.signInContext = null;
    this.holder = null;
    this.onSignIn('closed', 'The sign-in window was closed. The session from the last few seconds was saved.');
  }

  private stopPolling(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  private async saveCookies(context: BrowserContext): Promise<string> {
    const cookies = await context.cookies();
    const session: SavedSession = { savedAt: new Date().toISOString(), cookies };
    await writeFileAtomic(this.sessionFile, JSON.stringify(session));
    await fs.chmod(this.sessionFile, 0o600).catch(() => undefined);
    return session.savedAt;
  }

  private async readSession(): Promise<SavedSession | null> {
    try {
      return await readJsonIfExists<SavedSession>(this.sessionFile);
    } catch {
      return null;
    }
  }

  /** A headless browser for screenshots, with the saved session restored. */
  async acquireForCapture(): Promise<CaptureSession> {
    if (this.holder === 'sign-in') {
      throw new UserError('The sign-in window is open, and it shares the browser profile with runs.', 'Finish signing in (choose "I\'m signed in" in Settings) or close the window, then start the run again.', 409);
    }
    if (this.holder === 'capture') throw new UserError('Another run is using the browser.', 'Wait for it to finish.', 409);
    this.holder = 'capture';
    try {
      const context = await this.launch(true);
      const session = await this.readSession();
      if (session?.cookies.length) {
        // Session cookies (like Entra's ESTSAUTH) are not kept in the profile when the window closes.
        await context.addCookies(session.cookies.filter((cookie) => cookie.expires === -1 || cookie.expires > Date.now() / 1000)).catch(() => undefined);
      }
      return {
        context,
        release: async () => {
          await context.close().catch(() => undefined);
          this.holder = null;
        },
      };
    } catch (error) {
      this.holder = null;
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.stopPolling();
    await this.signInContext?.close().catch(() => undefined);
  }

  private async launch(headless: boolean): Promise<BrowserContext> {
    const { channel, executablePath } = this.config().browser;
    await fs.mkdir(this.profileDir, { recursive: true });
    try {
      return await chromium.launchPersistentContext(this.profileDir, {
        headless,
        channel,
        ...(executablePath ? { executablePath } : {}),
        viewport: { ...DESKTOP },
        ignoreHTTPSErrors: true,
        acceptDownloads: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/Executable doesn't exist|browserType\.launch.*not found|Failed to launch/i.test(message)) {
        throw new UserError(
          channel === 'chromium' ? 'The Chromium browser that Refit uses is not installed.' : `The ${channel === 'msedge' ? 'Microsoft Edge' : 'Chrome'} browser could not be started.`,
          channel === 'chromium' ? 'Run "npm run setup:browser" in the Refit folder, then try again.' : 'Check that it is installed, or set browser.channel to "chromium" in refit.config.json and run "npm run setup:browser".',
        );
      }
      if (/ProcessSingleton|SingletonLock|profile.*in use/i.test(message)) {
        throw new UserError('The browser profile is in use by another window.', `Close any Chromium window that uses ${path.basename(this.profileDir)} and try again.`);
      }
      throw error;
    }
  }
}
