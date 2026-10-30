import { setTimeout as delay } from 'node:timers/promises';
import { startProcess, type RunningProcess } from '../proc/run.js';
import { UserError } from '../util/errors.js';
import { isPortInUse, portInUseFix } from './port.js';

/** Lines Angular's dev server prints when a (re)build finished, for webpack and esbuild builders. */
const COMPILED = /Compiled successfully|compiled successfully|Application bundle generation complete|Compiled with warnings|Page reload sent to client|Component update sent to client/;
const FAILED = /Failed to compile|Application bundle generation failed|✘ \[ERROR\]|ERROR in /;

export interface DevServerOptions {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  port: number;
  timeoutMs: number;
  signal: AbortSignal;
  onLine?: (line: string) => void;
}

/**
 * The app's dev server (ng serve). Started once per phase; it recompiles on every change, and
 * Refit watches its output to know when a change is live before taking screenshots.
 */
export class DevServer {
  private compiles = 0;
  private lastFailed = false;
  private exited = false;
  private readonly tail: string[] = [];

  private constructor(
    private readonly process: RunningProcess,
    readonly port: number,
  ) {}

  static async start(options: DevServerOptions): Promise<DevServer> {
    if (await isPortInUse(options.port)) {
      throw new UserError(`Port ${options.port} is already in use, so the app's dev server cannot start.`, portInUseFix(options.port));
    }
    let server: DevServer | null = null;
    const process = startProcess({
      command: options.command,
      shell: true,
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
      tailLines: 80,
      onLine: (line) => {
        options.onLine?.(line);
        server?.observe(line);
      },
    });
    server = new DevServer(process, options.port);
    void process.done.then(() => {
      if (server) server.exited = true;
    });
    await server.waitUntilReady(options.timeoutMs, options.signal);
    return server;
  }

  /** How many builds the dev server has finished so far. */
  get compileCount(): number {
    return this.compiles;
  }

  /** True when the last rebuild failed. */
  get failed(): boolean {
    return this.lastFailed;
  }

  private observe(line: string): void {
    this.tail.push(line);
    if (this.tail.length > 40) this.tail.shift();
    if (FAILED.test(line)) this.lastFailed = true;
    if (COMPILED.test(line)) {
      this.lastFailed = false;
      this.compiles++;
    }
  }

  private async waitUntilReady(timeoutMs: number, signal: AbortSignal): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (signal.aborted) throw new UserError('Cancelled.');
      if (this.exited) {
        throw new UserError(
          'The app\'s dev server stopped right after starting.',
          `Run the serve command in the app folder to see why. Last lines:\n${this.tail.slice(-8).join('\n')}`,
        );
      }
      if (this.compiles > 0 && (await isPortInUse(this.port))) return;
      await delay(500);
    }
    await this.stop();
    throw new UserError(
      `The app's dev server did not start within ${Math.round(timeoutMs / 60_000)} minutes.`,
      `Check the serve command under Advanced (it must use port ${this.port}). Last lines:\n${this.tail.slice(-8).join('\n')}`,
    );
  }

  /**
   * Waits until the dev server finished a build after `since` (its compile count before a change).
   * Returns false when no rebuild happened in time, for example when the change did not affect it.
   */
  async waitForRebuild(since: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !this.exited) {
      if (this.compiles > since) {
        await delay(400);
        return true;
      }
      await delay(250);
    }
    return false;
  }

  async stop(): Promise<void> {
    await this.process.kill();
    await this.process.done;
  }
}
