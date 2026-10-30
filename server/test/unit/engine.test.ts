import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AppRecord, RunRecord } from '@refit/shared';
import { applyRunEvent, estimateMaxCost, MODERNIZE_STEPS } from '@refit/shared';
import { BudgetLedger } from '../../src/pipeline/budget.js';
import { effectiveCommands } from '../../src/pipeline/commands.js';
import { parsePageReport, parseReview } from '../../src/prompts/report.js';
import { fixPrompt, pagePrompt } from '../../src/prompts/tasks.js';
import { loadPlaybook } from '../../src/prompts/playbook.js';
import { RunEventLog } from '../../src/runs/event-log.js';
import { REPO_ROOT, tempDir } from '../helpers/repos.js';

describe('parsePageReport', () => {
  it('reads the last JSON block and keeps the text before it as the summary', () => {
    const text = [
      'I restyled the page.',
      '```json',
      '{ "status": "draft" }',
      '```',
      'Final report:',
      '```json',
      '{ "status": "done", "inventory": ["Table", 3], "changes": ["Uses p-table"], "componentsUsed": ["p-table"], "concerns": [], }',
      '```',
    ].join('\n');
    expect(parsePageReport(text)).toEqual({
      status: 'done',
      summary: 'I restyled the page.\n```json\n{ "status": "draft" }\n```\nFinal report:',
      inventory: ['Table'],
      changes: ['Uses p-table'],
      componentsUsed: ['p-table'],
      concerns: [],
      structured: true,
    });
  });

  it('keeps plain text when there is no valid JSON and marks the report unstructured', () => {
    expect(parsePageReport('All done, nothing to report.')).toMatchObject({ summary: 'All done, nothing to report.', structured: false, status: 'partial' });
    expect(parsePageReport('```json\n{ not json\n```')).toMatchObject({ structured: false });
    expect(parsePageReport('')).toMatchObject({ summary: 'The agent did not write a report.' });
  });

  it('reads agent reviews', () => {
    const review = parseReview('```json\n{"summary":"Small app","uiStack":["Bootstrap"],"layout":"Top bar","sharedComponents":[{"name":"Header","files":["a.ts"],"why":"everywhere"}],"risks":[{"title":"Inline styles","files":[],"detail":"many"}],"pages":[{"route":"/","purpose":"Overview","complexity":"HIGH"},{"route":"/x","purpose":"?","complexity":"weird"}],"recommendations":["Start with the header"]}\n```');
    expect(review.structured).toBe(true);
    expect(review.pages.map((page) => page.complexity)).toEqual(['high', 'medium']);
    expect(review.sharedComponents[0]).toEqual({ name: 'Header', files: ['a.ts'], why: 'everywhere' });
  });
});

describe('prompts', () => {
  it('builds the system prompt from the playbook, identical every time', async () => {
    const first = await loadPlaybook(path.join(REPO_ROOT, 'playbook'));
    const second = await loadPlaybook(path.join(REPO_ROOT, 'playbook'));
    expect(first).toBe(second);
    expect(first.indexOf('# Refit modernization rules')).toBeLessThan(first.indexOf('# Page procedure'));
    expect(first.indexOf('# Page procedure')).toBeLessThan(first.indexOf('# UI checklist'));
  });

  it('keeps task prompts short and specific', () => {
    const page = pagePrompt({ name: 'Requests', route: '/requests', files: ['a.ts', 'a.html'], beforeShots: ['.refit/shots/requests-before-desktop.jpg'], buildCommand: 'npm run build', designSystem: 'PrimeNG 21' });
    expect(page).toContain('"Requests" page (route /requests)');
    expect(page).toContain('- .refit/shots/requests-before-desktop.jpg');
    const fix = fixPrompt({ label: 'Requests page', buildCommand: 'npm run build', logTail: ['error TS2339'], changedFiles: ['a.html'] });
    expect(fix).toContain('error TS2339');
    expect(fix).toContain('- a.html');
  });
});

describe('BudgetLedger', () => {
  it('caps a page by its own budget and by what is left of the run', () => {
    const ledger = new BudgetLedger(2, 1.5, 'usd');
    expect(ledger.remainingFor('home')).toBe(1.5);
    ledger.record('home', 1.2, 0);
    expect(ledger.remainingFor('home')).toBeCloseTo(0.3);
    expect(ledger.remainingFor('list')).toBeCloseTo(0.8);
    ledger.record('list', 0.79, 0);
    expect(ledger.canStart('detail')).toBe(false);
    expect(ledger.totalUsd).toBeCloseTo(1.99);
  });

  it('never blocks providers that count requests', () => {
    const ledger = new BudgetLedger(0, 0, 'requests');
    ledger.record('home', 0, 3);
    expect(ledger.canStart('list')).toBe(true);
    expect(ledger.totalRequests).toBe(3);
  });

  it('estimates the maximum cost before a run', () => {
    expect(estimateMaxCost({ pages: 4, perPageUsd: 1.5, perRunUsd: 25, foundationUsd: 3 })).toBe(9);
    expect(estimateMaxCost({ pages: 40, perPageUsd: 1.5, perRunUsd: 25, foundationUsd: 3 })).toBe(25);
  });
});

describe('effectiveCommands', () => {
  const app = (overrides: AppRecord['overrides']): AppRecord =>
    ({
      port: 4300,
      overrides,
      scan: { commands: { install: 'npm ci', installRetry: 'npm ci --legacy-peer-deps', build: 'npm run build', serve: 'npx ng serve --port {port}', env: { A: '1' } } },
    }) as unknown as AppRecord;

  it('uses detected commands and fills in the port', () => {
    expect(effectiveCommands(app({}))).toEqual({ install: 'npm ci', installRetry: 'npm ci --legacy-peer-deps', build: 'npm run build', serve: 'npx ng serve --port 4300', env: { A: '1' } });
  });

  it('applies overrides and derives a retry for npm installs', () => {
    expect(effectiveCommands(app({ install: 'npm install', build: 'npx ng build -c dev', env: { B: '2' } }))).toMatchObject({
      install: 'npm install',
      installRetry: 'npm install --legacy-peer-deps',
      build: 'npx ng build -c dev',
      env: { A: '1', B: '2' },
    });
    expect(effectiveCommands(app({ install: 'yarn install' })).installRetry).toBeUndefined();
  });
});

describe('run events', () => {
  const blank = (): RunRecord => ({
    id: 'r1',
    appId: 'a1',
    appName: 'App',
    kind: 'modernize',
    status: 'running',
    startedAt: '2026-10-30T00:00:00.000Z',
    steps: MODERNIZE_STEPS.map((step) => ({ id: step.id, label: step.label, status: 'pending' })),
    pages: [{ pageId: 'home', name: 'Home', route: '/', status: 'queued', costUsd: 0, shots: { before: {}, after: {} } }],
    cost: { usd: 0, requests: 0, unit: 'usd' },
    lastSeq: 0,
  });

  it('applies events idempotently, so replays are safe', () => {
    const events = [
      { type: 'step', step: 'prepare', status: 'active', seq: 1, ts: '2026-10-30T00:00:01.000Z' },
      { type: 'step', step: 'prepare', status: 'done', detail: 'Branch x', seq: 2, ts: '2026-10-30T00:00:05.000Z' },
      { type: 'page', pageId: 'home', status: 'done', note: 'ok', seq: 3, ts: '' },
      { type: 'shot', pageId: 'home', phase: 'after', viewport: 'desktop', url: '/files/runs/r1/shots/x.jpg', seq: 4, ts: '' },
      { type: 'cost', usd: 0.5, requests: 0, seq: 5, ts: '' },
      { type: 'meta', branch: 'refit/x', seq: 6, ts: '' },
      { type: 'status', status: 'done', seq: 7, ts: '2026-10-30T00:01:00.000Z' },
    ] as const;
    const once = blank();
    for (const event of events) applyRunEvent(once, event);
    const twice = structuredClone(once);
    for (const event of events) applyRunEvent(twice, event);
    expect(twice).toEqual(once);
    expect(once.steps[0]).toMatchObject({ status: 'done', detail: 'Branch x', startedAt: '2026-10-30T00:00:01.000Z', finishedAt: '2026-10-30T00:00:05.000Z' });
    expect(once.pages[0]).toMatchObject({ status: 'done', note: 'ok', shots: { after: { desktop: '/files/runs/r1/shots/x.jpg' } } });
    expect(once).toMatchObject({ status: 'done', finishedAt: '2026-10-30T00:01:00.000Z', branch: 'refit/x', cost: { usd: 0.5 }, lastSeq: 7 });
  });

  it('writes, replays and re-reads the event log', async () => {
    const dir = await tempDir();
    const log = await RunEventLog.create(dir);
    const seen: number[] = [];
    log.subscribe((event) => seen.push(event.seq));
    log.emit({ type: 'status', status: 'running' });
    log.emit({ type: 'log', level: 'out', source: 'shell', text: 'x'.repeat(10_000) });
    log.emit({ type: 'activity', text: 'Working' });
    expect(seen).toEqual([1, 2, 3]);
    expect(log.since(1).map((event) => event.seq)).toEqual([2, 3]);
    await log.close();
    const read = await RunEventLog.read(dir);
    expect(read.map((event) => event.type)).toEqual(['status', 'log', 'activity']);
    expect((read[1] as { text: string }).text.length).toBeLessThan(8_100);
  });
});
