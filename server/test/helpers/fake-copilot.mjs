// A stand-in for the GitHub Copilot CLI in tests: `node fake-copilot.mjs <copilot args>`.
// It records how it was called, then plays back the scenario in FAKE_COPILOT_SCENARIO (a JSON file):
// { "version": "1.0.105", "stdout": ["..."], "stderr": ["..."], "exitCode": 0, "delayMs": 0,
//   "writeFiles": { "relative/path": "content" }, "usage": { ... }, "hang": false }
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const scenario = process.env.FAKE_COPILOT_SCENARIO ? JSON.parse(readFileSync(process.env.FAKE_COPILOT_SCENARIO, 'utf8')) : {};

if (args.includes('--version')) {
  process.stdout.write(`${scenario.versionOutput ?? `GitHub Copilot CLI ${scenario.version ?? '1.0.105'}`}\n`);
  process.exit(scenario.versionExitCode ?? 0);
}

if (process.env.FAKE_COPILOT_CALLS) {
  const call = {
    args,
    cwd: process.cwd(),
    task: readOptional(path.join(process.cwd(), '.refit', 'task.md')),
    env: Object.fromEntries(
      ['COPILOT_HOME', 'COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN', 'COPILOT_ALLOW_ALL', 'COPILOT_AUTO_UPDATE', 'NO_COLOR'].map((name) => [name, process.env[name] ?? null]),
    ),
  };
  writeFileSync(process.env.FAKE_COPILOT_CALLS, `${JSON.stringify(call)}\n`, { flag: 'a' });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (const [file, content] of Object.entries(scenario.writeFiles ?? {})) {
  const target = path.join(process.cwd(), file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
for (const line of scenario.stdout ?? []) {
  process.stdout.write(`${line}\n`);
  if (scenario.delayMs) await delay(scenario.delayMs);
}
for (const line of scenario.stderr ?? []) process.stderr.write(`${line}\n`);

const usageIndex = args.indexOf('--usage-output-file');
const usageFile = usageIndex >= 0 ? args[usageIndex + 1] : args.find((arg) => arg.startsWith('--usage-output-file='))?.split('=')[1];
if (usageFile && scenario.usage) writeFileSync(usageFile, JSON.stringify(scenario.usage));

if (scenario.hang) await delay(10 * 60_000);
process.exit(scenario.exitCode ?? 0);

function readOptional(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}
