import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import crossSpawn from 'cross-spawn';
import { redact } from '../util/redact.js';
import { IS_WINDOWS } from './env.js';

export interface ProcessOptions {
  /** Executable name, or a full command line when `shell` is true. */
  command: string;
  args?: string[];
  /**
   * Run through the system shell. Use this for commands a person can edit (install, build, serve),
   * so they behave exactly as when typed in a terminal.
   */
  shell?: boolean;
  cwd: string;
  env?: NodeJS.ProcessEnv;
  /** Kills the whole process tree after this many milliseconds. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called for every output line (ANSI colors removed, secrets redacted). */
  onLine?: (line: string, stream: 'stdout' | 'stderr') => void;
  input?: string;
  /** How many of the last output lines to keep in memory. */
  tailLines?: number;
}

export interface ProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  cancelled: boolean;
  /** The last output lines, redacted. */
  tail: string[];
  /** Complete stdout, capped at 4 MB, redacted. Useful for short commands like git. */
  stdout: string;
  durationMs: number;
  /** Set when the process could not start at all (for example the program is not installed). */
  spawnError?: string;
}

export interface RunningProcess {
  readonly pid: number | undefined;
  readonly done: Promise<ProcessResult>;
  /** Kills the process and everything it started. Resolves when the kill was sent. */
  kill(): Promise<void>;
}

const STDOUT_CAP = 4 * 1024 * 1024;
// eslint-disable-next-line no-control-regex -- matching terminal escape sequences is the point
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

const live = new Set<RunningProcess>();

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '');
}

/** Starts a process. Use `runProcess` when you only need the result. */
export function startProcess(options: ProcessOptions): RunningProcess {
  const started = Date.now();
  const tailLimit = options.tailLines ?? 400;
  const tail: string[] = [];
  let stdout = '';
  let timedOut = false;
  let cancelled = false;
  let child: ChildProcess;

  const spawnOptions = {
    cwd: options.cwd,
    env: options.env ?? process.env,
    windowsHide: true,
    // A process group on macOS/Linux lets us kill the whole tree (npm -> ng -> esbuild).
    detached: !IS_WINDOWS,
    stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] as ('ignore' | 'pipe')[],
  };

  try {
    child = options.shell
      ? nodeSpawn(options.command, { ...spawnOptions, shell: true })
      : crossSpawn(options.command, options.args ?? [], spawnOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failedToStart(message, started);
  }

  const handle: RunningProcess = {
    pid: child.pid,
    done: new Promise<ProcessResult>((resolve) => {
      let spawnError: string | undefined;
      const pending: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };

      const emit = (raw: string, stream: 'stdout' | 'stderr') => {
        const line = redact(stripAnsi(raw)).replace(/\s+$/, '');
        if (line === '') return;
        tail.push(line);
        if (tail.length > tailLimit) tail.shift();
        options.onLine?.(line, stream);
      };

      const onData = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        if (stream === 'stdout' && stdout.length < STDOUT_CAP) stdout += text;
        const parts = (pending[stream] + text).split(/\r\n|\n|\r/);
        pending[stream] = parts.pop() ?? '';
        for (const part of parts) emit(part, stream);
      };

      child.stdout?.on('data', onData('stdout'));
      child.stderr?.on('data', onData('stderr'));
      child.on('error', (error) => {
        spawnError = error.message;
        // A process that never started emits no "close"; finish here instead.
        if (child.pid === undefined) finish(null, null);
      });
      child.stdin?.on('error', () => undefined);
      if (options.input !== undefined) child.stdin?.end(options.input);

      const timer = options.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            void killTree(child);
          }, options.timeoutMs)
        : undefined;
      const onAbort = () => {
        cancelled = true;
        void killTree(child);
      };
      if (options.signal?.aborted) onAbort();
      else options.signal?.addEventListener('abort', onAbort, { once: true });

      let finished = false;
      function finish(code: number | null, signal: NodeJS.Signals | null): void {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        emit(pending.stdout, 'stdout');
        emit(pending.stderr, 'stderr');
        live.delete(handle);
        resolve({
          code,
          signal,
          timedOut,
          cancelled,
          tail: [...tail],
          stdout: redact(stripAnsi(stdout)),
          durationMs: Date.now() - started,
          ...(spawnError ? { spawnError } : {}),
        });
      }
      child.on('close', (code, signal) => finish(code, signal));
    }),
    kill: () => killTree(child),
  };
  live.add(handle);
  return handle;
}

export function runProcess(options: ProcessOptions): Promise<ProcessResult> {
  return startProcess(options).done;
}

/** Kills every child process Refit started. Called when the server shuts down. */
export async function killAllProcesses(): Promise<void> {
  await Promise.all([...live].map((p) => p.kill()));
}

async function killTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
  if (IS_WINDOWS) {
    // taskkill /T ends the whole tree; /F forces it (npm.cmd -> node -> esbuild children).
    await new Promise<void>((resolve) => {
      const killer = nodeSpawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      killer.on('close', () => resolve());
      killer.on('error', () => resolve());
    });
    return;
  }
  const signalGroup = (signal: NodeJS.Signals) => {
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // already gone
      }
    }
  };
  signalGroup('SIGTERM');
  await new Promise<void>((resolve) => {
    const force = setTimeout(() => {
      signalGroup('SIGKILL');
      resolve();
    }, 3000);
    child.once('close', () => {
      clearTimeout(force);
      // Grandchildren may outlive the group leader; make sure they go too.
      signalGroup('SIGKILL');
      resolve();
    });
  });
}

function failedToStart(message: string, started: number): RunningProcess {
  const result: ProcessResult = {
    code: null,
    signal: null,
    timedOut: false,
    cancelled: false,
    tail: [],
    stdout: '',
    durationMs: Date.now() - started,
    spawnError: message,
  };
  return { pid: undefined, done: Promise.resolve(result), kill: async () => undefined };
}

/** One-line description of how a process ended, for logs and error messages. */
export function describeExit(result: ProcessResult): string {
  if (result.spawnError) return `could not start (${result.spawnError})`;
  if (result.cancelled) return 'cancelled';
  if (result.timedOut) return 'stopped after the time limit';
  if (result.signal) return `stopped by ${result.signal}`;
  return `exit code ${result.code}`;
}

export function succeeded(result: ProcessResult): boolean {
  return result.code === 0 && !result.timedOut && !result.cancelled && !result.spawnError;
}
