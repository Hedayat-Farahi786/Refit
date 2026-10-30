import { promises as fs } from 'node:fs';
import path from 'node:path';
import { brandCss, brandGuide, brandPresetSource } from '@refit/shared';
import semver from 'semver';
import { commitAll, headCommit, resetHard } from '../../git/workspace.js';
import { succeeded } from '../../proc/run.js';
import { fixPrompt, foundationPrompt } from '../../prompts/tasks.js';
import { adapterById } from '../../stacks/registry.js';
import type { DesignSystemRelease } from '../../stacks/types.js';
import { runAgentTask } from '../agent.js';
import { activity, exec, log, StepFailure, throwIfCancelled, type RunContext } from '../context.js';
import { logTail, runBuild } from './build.js';
import { runGuard } from './guard-run.js';
import { addPackagesCommand, appDependencies, installedVersion } from './packages.js';
import type { StepOutcome } from './upgrade.js';

/** Where Refit writes the brand inside the app, relative to the app's source root. */
export const THEME_FOLDER = 'app/theme';
export const THEME_FILES = ['brand-preset.ts', 'brand.css', 'BRAND.md'] as const;

/**
 * Step 5: install PrimeNG for the app's Angular major, write the brand files, then the foundation
 * task registers PrimeNG, loads the styles and modernizes the app shell. Build and guard after,
 * and a commit for each part.
 */
export async function designSystemStep(ctx: RunContext): Promise<StepOutcome> {
  const adapter = adapterById(ctx.app.scan?.stack);
  if (!adapter?.designSystem) throw new StepFailure('Refit has no design system for this kind of app.', 'Refit modernizes Angular apps.');
  const coreVersion = await installedVersion(ctx, adapter.frameworkPackage);
  if (!coreVersion) throw new StepFailure(`Refit could not tell which ${adapter.label} version the app uses.`, 'Check that the install step worked.');
  const choice = adapter.designSystem.releaseFor(semver.major(coreVersion), coreVersion);
  if ('problem' in choice) throw new StepFailure(choice.problem, choice.fix);
  const { release } = choice;

  await installLibrary(ctx, release);
  const files = await writeThemeFiles(ctx, release);
  await commitAll(ctx.paths.workspace, `refit: install ${release.label} and the ${ctx.brand.name} brand`);
  log(ctx, 'info', 'refit', `Wrote ${files.join(', ')}.`);

  await foundation(ctx, release);
  return { status: 'done', detail: `${release.label} with ${ctx.brand.name}` };
}

async function installLibrary(ctx: RunContext, release: DesignSystemRelease): Promise<void> {
  const dependencies = await appDependencies(ctx);
  const specs = [...release.packages, ...Object.entries(release.ifMissing).filter(([name]) => !dependencies[name]).map(([, spec]) => spec)];
  activity(ctx, `Installing ${release.label} and its theme`);
  const manager = ctx.app.scan?.packageManager ?? 'npm';
  const command = addPackagesCommand(manager, specs);
  const timeoutMin = ctx.config.timeouts.installMin;
  let result = await exec(ctx, command, { timeoutMin });
  throwIfCancelled(ctx);
  if (!succeeded(result) && manager === 'npm') {
    log(ctx, 'warn', 'refit', `Installing ${release.label} failed. Trying again with --legacy-peer-deps.`);
    result = await exec(ctx, `${command} --legacy-peer-deps`, { timeoutMin });
    throwIfCancelled(ctx);
  }
  if (!succeeded(result)) {
    throw new StepFailure(`Installing ${release.label} failed.`, `Run "${command}" in the app folder to see the full error. A private registry that needs a login (.npmrc) is a common cause.`);
  }
}

/** Writes brand-preset.ts, brand.css and BRAND.md for the installed PrimeNG. Returns their paths. */
async function writeThemeFiles(ctx: RunContext, release: DesignSystemRelease): Promise<string[]> {
  const sourceRoot = ctx.app.scan?.angular?.sourceRoot ?? 'src';
  const folder = path.join(ctx.paths.appFolder, ...sourceRoot.split('/'), ...THEME_FOLDER.split('/'));
  await fs.mkdir(folder, { recursive: true });
  const target = release.themeTarget;
  const contents: Record<(typeof THEME_FILES)[number], string> = {
    'brand-preset.ts': brandPresetSource(ctx.brand, target),
    'brand.css': brandCss(ctx.brand, target),
    'BRAND.md': brandGuide(ctx.brand, release.library.version),
  };
  for (const name of THEME_FILES) await fs.writeFile(path.join(folder, name), contents[name]);
  return THEME_FILES.map((name) => `${sourceRoot}/${THEME_FOLDER}/${name}`);
}

async function foundation(ctx: RunContext, release: DesignSystemRelease): Promise<void> {
  const angular = ctx.app.scan?.angular;
  const sourceRoot = angular?.sourceRoot ?? 'src';
  const providersFile = angular?.providersFile ?? null;
  const globalStyles = angular?.stylesFile ?? null;
  const shellFiles = angular?.shellFiles ?? [];
  const files = [providersFile, globalStyles, ...shellFiles].filter((file): file is string => Boolean(file));
  const label = 'design system and app shell';
  activity(ctx, 'Setting up the design system and modernizing the app shell');
  const checkpoint = await headCommit(ctx.paths.workspace);

  const result = await runAgentTask(ctx, { kind: 'foundation', label, files }, {
    scope: 'foundation',
    scopeBudgetUsd: ctx.config.budget.foundationUsd,
    prompt: foundationPrompt({
      bootstrap: angular?.bootstrap ?? 'unknown',
      providersFile,
      globalStyles,
      shellFiles,
      primeng: release.library.version,
      themePackage: release.library.themePackage,
      needsAngularAnimations: release.library.needsAnimations,
      buildCommand: ctx.commands.build,
      themeFolder: `${sourceRoot}/${THEME_FOLDER}`,
    }),
  });
  throwIfCancelled(ctx);
  if (!result.ok && !result.limitReached) {
    await resetHard(ctx.paths.workspace, checkpoint);
    throw new StepFailure(
      `The agent could not set up the design system (${result.error ?? 'no reason given'}).`,
      'The branch keeps PrimeNG and the brand files. Check the AI provider in Settings and run again.',
    );
  }
  await runGuard(ctx, checkpoint);

  let build = await runBuild(ctx, 'The build after the design system');
  throwIfCancelled(ctx);
  if (!succeeded(build)) {
    log(ctx, 'warn', 'refit', 'The build broke after the design system step. Asking the agent to fix it.');
    activity(ctx, 'Fixing the build after the design system');
    const changed = await runGuard(ctx, checkpoint);
    await runAgentTask(ctx, { kind: 'fix', label, files }, {
      scope: 'foundation',
      scopeBudgetUsd: ctx.config.budget.foundationUsd,
      prompt: fixPrompt({ label, buildCommand: ctx.commands.build, logTail: logTail(build), changedFiles: changed }),
    });
    throwIfCancelled(ctx);
    await runGuard(ctx, checkpoint);
    build = await runBuild(ctx, 'The build after fixing the design system');
    throwIfCancelled(ctx);
    if (!succeeded(build)) {
      await resetHard(ctx.paths.workspace, checkpoint);
      throw new StepFailure(
        'The design system setup broke the build and could not be fixed, so its changes were rolled back.',
        'The branch keeps PrimeNG and the brand files. The build log above shows the errors.',
      );
    }
  }
  const commit = await commitAll(ctx.paths.workspace, 'refit(ui): design system and app shell');
  if (!commit) log(ctx, 'warn', 'refit', 'The foundation task changed nothing. Pages will still use PrimeNG, but PrimeNG may not be registered with the brand.');
}
