// Builds Refit's three packages (shared, server, web) when their sources changed since the last
// build. `node scripts/build.mjs --force` rebuilds everything.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const packages = [
  { name: 'shared', sources: ['shared/src', 'shared/tsconfig.json'], output: 'shared/dist', command: 'npm run build -w @refit/shared' },
  { name: 'server', sources: ['server/src', 'server/tsconfig.json', 'shared/src'], output: 'server/dist', command: 'npm run build -w @refit/server' },
  {
    name: 'web',
    sources: ['web/src', 'web/public', 'web/angular.json', 'web/tsconfig.json', 'web/tsconfig.app.json', 'shared/src'],
    output: 'web/dist/web/browser',
    command: 'npm run build -w @refit/web',
  },
];

function newestMtime(target) {
  const full = path.join(root, target);
  if (!existsSync(full)) return 0;
  const stat = statSync(full);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = 0;
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    newest = Math.max(newest, newestMtime(path.join(target, entry.name)));
  }
  return newest;
}

export function buildIfNeeded({ force = false } = {}) {
  for (const pkg of packages) {
    const stampFile = path.join(root, pkg.output, '.refit-build-stamp');
    const stamp = existsSync(stampFile) ? Number(readFileSync(stampFile, 'utf8')) : 0;
    const newest = Math.max(...pkg.sources.map(newestMtime));
    if (!force && stamp >= newest) continue;
    console.log(`Refit: building ${pkg.name}...`);
    const result = spawnSync(pkg.command, { cwd: root, stdio: 'inherit', shell: true });
    if (result.status !== 0) {
      console.error(`\nRefit: building ${pkg.name} failed. Fix the error above, or run "npm install" if dependencies are missing.`);
      process.exit(result.status ?? 1);
    }
    writeFileSync(stampFile, String(Date.now()));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildIfNeeded({ force: process.argv.includes('--force') });
}
