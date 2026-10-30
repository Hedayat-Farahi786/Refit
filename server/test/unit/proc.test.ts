import { describe, expect, it } from 'vitest';
import { childEnv, pathKey } from '../../src/proc/env.js';
import { describeExit, runProcess, startProcess, stripAnsi, succeeded } from '../../src/proc/run.js';

const node = process.execPath;

describe('runProcess', () => {
  it('captures output lines and the exit code', async () => {
    const lines: string[] = [];
    const result = await runProcess({
      command: node,
      args: ['-e', 'console.log("one"); console.error("two"); process.stdout.write("three\\r\\nfour"); process.exit(3)'],
      cwd: process.cwd(),
      onLine: (line) => lines.push(line),
    });
    expect(result.code).toBe(3);
    expect(lines).toEqual(expect.arrayContaining(['one', 'two', 'three', 'four']));
    expect(result.tail).toHaveLength(4);
    expect(succeeded(result)).toBe(false);
    expect(describeExit(result)).toBe('exit code 3');
  });

  it('runs shell commands', async () => {
    const result = await runProcess({ command: `"${node}" -e "console.log(40 + 2)"`, shell: true, cwd: process.cwd() });
    expect(succeeded(result)).toBe(true);
    expect(result.stdout.trim()).toBe('42');
  });

  it('kills the whole process tree on timeout', async () => {
    // The parent starts a child that would print after 5 s; both must be gone after the timeout.
    const script = `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', 'setTimeout(() => console.log("grandchild survived"), 5000)'], { stdio: 'inherit' });
      setInterval(() => {}, 1000);
    `;
    const started = Date.now();
    const result = await runProcess({ command: node, args: ['-e', script], cwd: process.cwd(), timeoutMs: 500 });
    expect(result.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(4500);
    expect(describeExit(result)).toBe('stopped after the time limit');
    await new Promise((resolve) => setTimeout(resolve, 5500));
    expect(result.tail.join('\n')).not.toContain('grandchild survived');
  }, 15_000);

  it('stops when the abort signal fires', async () => {
    const controller = new AbortController();
    const running = startProcess({ command: node, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: process.cwd(), signal: controller.signal });
    setTimeout(() => controller.abort(), 200);
    const result = await running.done;
    expect(result.cancelled).toBe(true);
    expect(describeExit(result)).toBe('cancelled');
  });

  it('explains programs that are not installed', async () => {
    const result = await runProcess({ command: 'refit-no-such-program-xyz', cwd: process.cwd() });
    expect(result.spawnError).toBeTruthy();
    expect(describeExit(result)).toMatch(/could not start/);
  });

  it('redacts secrets and strips colors', async () => {
    const result = await runProcess({
      command: node,
      args: ['-e', 'console.log("\\u001b[31mtoken=abcdef123456789\\u001b[0m and sk-ant-api03-ABCDEFGHIJKLMNOP")'],
      cwd: process.cwd(),
    });
    expect(result.tail[0]).toBe('token=*** and sk-ant-***');
  });
});

describe('child environment', () => {
  it('is non-interactive and colorless, and can put a Node folder first on PATH', () => {
    const env = childEnv({ EXTRA: '1', NO_COLOR: undefined }, '/opt/node18/bin');
    expect(env['GIT_TERMINAL_PROMPT']).toBe('0');
    expect(env['NG_CLI_ANALYTICS']).toBe('false');
    expect(env['EXTRA']).toBe('1');
    expect(env['NO_COLOR']).toBeUndefined();
    expect(env[pathKey(env)]?.startsWith('/opt/node18/bin')).toBe(true);
  });

  it('strips ANSI sequences', () => {
    expect(stripAnsi('\u001b[1m\u001b[32mok\u001b[0m')).toBe('ok');
  });
});
