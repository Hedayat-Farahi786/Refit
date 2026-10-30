import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deepMerge, loadConfig, saveLocalConfig } from '../../src/config/config.js';
import { StateStore } from '../../src/store/store.js';
import { isInside, writeFileAtomic } from '../../src/util/fs.js';
import { redact } from '../../src/util/redact.js';
import { REPO_ROOT, tempDir } from '../helpers/repos.js';

describe('redact', () => {
  it.each([
    ['key sk-ant-api03-abcdefghijklmnop end', 'key sk-ant-*** end'],
    ['ghp_abcdefghijklmnopqrstuvwxyz0123', 'gh***'],
    ['github_pat_11ABCDEFG0123456789_abcdefghijk', 'gh***'],
    ['Authorization: Bearer abc.def-ghi_jkl', 'Authorization: Bearer ***'],
    ['https://user:p4ss@github.com/o/r.git', 'https://***@github.com/o/r.git'],
    ['password=hunter2hunter2', 'password=***'],
    ['"client_secret": "very-secret-value"', '"client_secret": "***"'],
    ['AKIAABCDEFGHIJKLMNOP', 'AKIA***'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', '<jwt redacted>'],
  ])('%s', (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it('leaves normal output alone', () => {
    expect(redact('Application bundle generation complete. [6.5 seconds]')).toBe('Application bundle generation complete. [6.5 seconds]');
  });
});

describe('config', () => {
  it('merges objects key by key and replaces arrays', () => {
    expect(deepMerge({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { c: 3 }, list: [9] })).toEqual({ a: { b: 1, c: 3 }, list: [9] });
  });

  it('loads the shipped defaults and applies local overrides', async () => {
    const dir = await tempDir();
    const files = { defaultsFile: path.join(REPO_ROOT, 'refit.config.json'), localFile: path.join(dir, 'config.local.json') };
    const defaults = await loadConfig(files);
    expect(defaults.port).toBe(4700);
    expect(defaults.targetAngularMajor).toBe(21);
    expect(defaults.protectedPaths).toContain('**/*.service.ts');

    const saved = await saveLocalConfig(files, { ...defaults, budget: { ...defaults.budget, perPageUsd: 2 }, protectedPaths: ['**/x/**'] });
    expect(saved.budget.perPageUsd).toBe(2);
    expect(saved.protectedPaths).toEqual(['**/x/**']);
    expect(saved.port).toBe(4700);
  });

  it('explains invalid values', async () => {
    const dir = await tempDir();
    const localFile = path.join(dir, 'config.local.json');
    await fs.writeFile(localFile, JSON.stringify({ budget: { perPageUsd: -1 } }));
    await expect(loadConfig({ defaultsFile: path.join(REPO_ROOT, 'refit.config.json'), localFile })).rejects.toThrow(/budget\.perPageUsd/);
    await fs.writeFile(localFile, '{ nope');
    await expect(loadConfig({ defaultsFile: path.join(REPO_ROOT, 'refit.config.json'), localFile })).rejects.toThrow(/not valid JSON/);
  });
});

describe('StateStore', () => {
  it('seeds the starter brand and persists updates', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'state.json');
    const store = await StateStore.open(file, path.join(REPO_ROOT, 'brand'));
    expect(store.snapshot().brands.map((brand) => brand.id)).toEqual(['oerlikon-draft']);
    expect(store.snapshot().settings.uiBrandId).toBe('oerlikon-draft');
    store.update((state) => state.settings.lastSignInAt = '2026-10-30T00:00:00.000Z');
    await store.flush();
    const reopened = await StateStore.open(file, path.join(REPO_ROOT, 'brand'));
    expect(reopened.snapshot().settings.lastSignInAt).toBe('2026-10-30T00:00:00.000Z');
  });

  it('keeps a corrupt state file instead of losing it', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'state.json');
    await fs.writeFile(file, '{ broken');
    const store = await StateStore.open(file, path.join(REPO_ROOT, 'brand'));
    expect(store.snapshot().apps).toEqual([]);
    expect((await fs.readdir(dir)).some((name) => name.startsWith('state.json.corrupt-'))).toBe(true);
  });

  it('returns copies so callers cannot change state by accident', async () => {
    const store = await StateStore.open(path.join(await tempDir(), 'state.json'), path.join(REPO_ROOT, 'brand'));
    store.snapshot().brands.pop();
    expect(store.snapshot().brands).toHaveLength(1);
  });
});

describe('file helpers', () => {
  it('writes atomically', async () => {
    const file = path.join(await tempDir(), 'nested', 'a.json');
    await writeFileAtomic(file, '1');
    await writeFileAtomic(file, '2');
    expect(await fs.readFile(file, 'utf8')).toBe('2');
    expect(await fs.readdir(path.dirname(file))).toEqual(['a.json']);
  });

  it('checks containment', () => {
    expect(isInside('/a/b', '/a/b/c')).toBe(true);
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/bc')).toBe(false);
    expect(isInside('/a/b', '/a/b/../c')).toBe(false);
  });
});
