import path from 'node:path';
import { z } from 'zod';
import type { EditableConfig } from '@refit/shared';
import { UserError } from '../util/errors.js';
import { readJsonIfExists, writeFileAtomic } from '../util/fs.js';

const taskModels = z.object({
  review: z.string(),
  foundation: z.string(),
  page: z.string(),
  polish: z.string(),
  fix: z.string(),
});

const usd = z.number().min(0).max(1000);

export const configSchema = z.object({
  port: z.number().int().min(1024).max(65535),
  workspacesDir: z.string().min(1),
  targetAngularMajor: z.number().int().min(18).max(30),
  budget: z.object({ perPageUsd: usd, perRunUsd: usd, reviewUsd: usd, foundationUsd: usd }),
  maxTurns: z.object({
    review: z.number().int().min(1),
    foundation: z.number().int().min(1),
    page: z.number().int().min(1),
    polish: z.number().int().min(1),
    fix: z.number().int().min(1),
  }),
  claude: z.object({
    models: taskModels,
    strongModel: z.string(),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']),
  }),
  copilot: z.object({ model: z.string(), maxAiCreditsPerTask: z.number().min(0) }),
  defaults: z.object({
    polishRounds: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    runTests: z.boolean(),
    upgradeAngular: z.boolean(),
    onApiChange: z.enum(['flag', 'rollback']),
    strongModelForComplexPages: z.boolean(),
  }),
  timeouts: z.object({
    installMin: z.number().positive(),
    buildMin: z.number().positive(),
    serveMin: z.number().positive(),
    upgradeHopMin: z.number().positive(),
    testMin: z.number().positive(),
    agentMin: z.number().positive(),
  }),
  browser: z.object({
    channel: z.enum(['chromium', 'msedge', 'chrome']),
    executablePath: z.string(),
    settleCapSec: z.number().positive().max(120),
  }),
  protectedPaths: z.array(z.string()),
  sensitivePaths: z.array(z.string()),
});

export type RefitConfig = z.infer<typeof configSchema>;

/** The parts of the config the Settings screen may change. Everything else stays in refit.config.json. */
export const editableConfigSchema = z.object({
  budget: configSchema.shape.budget,
  claude: configSchema.shape.claude,
  copilot: configSchema.shape.copilot,
  defaults: configSchema.shape.defaults,
  protectedPaths: z.array(z.string().trim().min(1)).max(500),
  sensitivePaths: z.array(z.string().trim().min(1)).max(500),
});

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Deep merge where objects merge key by key and arrays or scalars replace. */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return (override === undefined ? base : override) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = key in out ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeIssues(error: z.ZodError, file: string): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${file}: ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

export interface ConfigFiles {
  defaultsFile: string;
  localFile: string;
}

export async function loadConfig(files: ConfigFiles): Promise<RefitConfig> {
  let defaults: unknown;
  try {
    defaults = await readJsonIfExists<Json>(files.defaultsFile);
  } catch (error) {
    throw new UserError(
      `${path.basename(files.defaultsFile)} is not valid JSON: ${(error as Error).message}`,
      'Fix the syntax error, or restore the file from git.',
    );
  }
  if (defaults === null) {
    throw new UserError(`Could not find ${files.defaultsFile}.`, 'Run Refit from its project folder, or restore the file from git.');
  }
  let local: unknown;
  try {
    local = (await readJsonIfExists<Json>(files.localFile)) ?? {};
  } catch (error) {
    throw new UserError(
      `data/config.local.json is not valid JSON: ${(error as Error).message}`,
      'Fix or delete data/config.local.json (it only holds settings you changed in Refit).',
    );
  }
  const parsed = configSchema.safeParse(deepMerge(defaults, local));
  if (!parsed.success) {
    throw new UserError(
      `Refit's configuration is not valid:\n${describeIssues(parsed.error, 'config')}`,
      'Fix the value in refit.config.json or data/config.local.json, or delete data/config.local.json to go back to the defaults.',
    );
  }
  return parsed.data;
}

export function editablePart(config: RefitConfig): EditableConfig {
  return {
    budget: config.budget,
    claude: config.claude,
    copilot: config.copilot,
    defaults: config.defaults,
    protectedPaths: config.protectedPaths,
    sensitivePaths: config.sensitivePaths,
  };
}

/** Saves the user's changes to data/config.local.json and returns the new effective config. */
export async function saveLocalConfig(files: ConfigFiles, patch: unknown): Promise<RefitConfig> {
  const parsed = editableConfigSchema.safeParse(patch);
  if (!parsed.success) {
    throw new UserError(`Some settings are not valid:\n${describeIssues(parsed.error, 'settings')}`, 'Correct the highlighted values and save again.');
  }
  const existing = ((await readJsonIfExists<Record<string, unknown>>(files.localFile)) ?? {}) as Record<string, unknown>;
  const next = { ...existing, ...parsed.data };
  await writeFileAtomic(files.localFile, `${JSON.stringify(next, null, 2)}\n`);
  return loadConfig(files);
}
