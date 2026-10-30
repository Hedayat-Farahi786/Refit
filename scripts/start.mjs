// `npm start`: build whatever changed, then run Refit at http://localhost:4700.
import { buildIfNeeded } from './build.mjs';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12) || major === 23) {
  console.error(`Refit needs Node 22.12 or newer (or Node 24). You have ${process.version}. Install Node 22 or 24 LTS from https://nodejs.org and try again.`);
  process.exit(1);
}

buildIfNeeded();
await import('../server/dist/main.js');
