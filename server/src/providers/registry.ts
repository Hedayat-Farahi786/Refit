import type { ProviderId, ProviderStatus, ProviderTestResult } from '@refit/shared';
import { UserError } from '../util/errors.js';
import { DryRunProvider, type DryRunOptions } from './dryrun.js';
import type { AgentProvider, ProviderRegistry } from './types.js';

export interface ProviderModule {
  status(): Promise<ProviderStatus>;
  create(): AgentProvider;
  /** One tiny real request, so people can check their setup before a run. */
  test?(): Promise<ProviderTestResult>;
}

const dryRunStatus: ProviderStatus = {
  id: 'dryrun',
  label: 'Dry run',
  available: true,
  checks: [{ label: 'No setup needed', ok: true, detail: 'Runs the whole pipeline without AI and at no cost.' }],
  setup: [],
  costUnit: 'usd',
};

/** Provider registry built from modules; tests pass their own dry run options. */
export function createProviderRegistry(modules: Partial<Record<ProviderId, ProviderModule>>, dryRun: DryRunOptions = {}): ProviderRegistry {
  const all: Record<ProviderId, ProviderModule> = {
    claude: modules.claude ?? unavailable('claude', 'Claude Agent'),
    copilot: modules.copilot ?? unavailable('copilot', 'GitHub Copilot'),
    dryrun: modules.dryrun ?? { status: async () => dryRunStatus, create: () => new DryRunProvider(dryRun) },
  };
  async function ready(id: ProviderId): Promise<ProviderModule> {
    const module = all[id];
    if (!module) throw new UserError(`Unknown provider "${id}".`, 'Choose Claude Agent, GitHub Copilot or Dry run.');
    const status = await module.status();
    if (!status.available) {
      throw new UserError(`${status.label} is not available: ${status.reason ?? 'it is not set up.'}`, status.setup.join(' ') || undefined);
    }
    return module;
  }
  return {
    statuses: () => Promise.all((['claude', 'copilot', 'dryrun'] as const).map((id) => all[id].status())),
    async get(id: ProviderId): Promise<AgentProvider> {
      return (await ready(id)).create();
    },
    async test(id: ProviderId): Promise<ProviderTestResult> {
      const module = await ready(id);
      if (!module.test) throw new UserError('This provider has nothing to test.', 'It needs no connection.');
      return module.test();
    },
  };
}

function unavailable(id: ProviderId, label: string): ProviderModule {
  return {
    status: async () => ({
      id,
      label,
      available: false,
      reason: 'This provider is not part of this build of Refit yet.',
      checks: [],
      setup: [],
      costUnit: id === 'copilot' ? 'requests' : 'usd',
    }),
    create: () => {
      throw new UserError(`${label} is not part of this build of Refit yet.`, 'Use Dry run for now.');
    },
  };
}
