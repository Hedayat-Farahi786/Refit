// `npm run dev`: shared types, the server and the web UI with live reload.
// Open http://localhost:4701 (the Angular dev server proxies /api to the server on 4700).
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

spawnSync('npm run build -w @refit/shared', { cwd: root, stdio: 'inherit', shell: true });

const tasks = [
  { name: 'shared', color: 35, command: 'npm run watch -w @refit/shared' },
  { name: 'server', color: 36, command: 'npm run dev -w @refit/server', env: { REFIT_DEV: '1' } },
  { name: 'web', color: 33, command: 'npm start -w @refit/web' },
];

const children = tasks.map((task) => {
  const child = spawn(task.command, {
    cwd: root,
    shell: true,
    detached: !isWindows,
    env: { ...process.env, ...task.env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `\u001b[${task.color}m[${task.name}]\u001b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let pending = '';
    stream.on('data', (chunk) => {
      const lines = (pending + chunk.toString()).split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) process.stdout.write(`${prefix}${line}\n`);
    });
  }
  child.on('exit', (code) => {
    if (!stopping) console.log(`${prefix}stopped (exit code ${code}).`);
  });
  return child;
});

console.log('\nRefit dev mode: open http://localhost:4701 (web with live reload). Press Ctrl+C to stop.\n');

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.pid === undefined) continue;
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // already stopped
      }
    }
  }
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
