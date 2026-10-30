import type { RunContext } from '../context.js';

/** Step 4: Angular upgrade hops. Only runs when the app is below the target major. */
export async function upgradeStep(ctx: RunContext): Promise<{ status: 'skipped'; detail: string }> {
  const major = ctx.app.scan?.angular?.major ?? null;
  const target = ctx.settings.targetAngularMajor;
  if (target === 'keep') return { status: 'skipped', detail: `Keeping Angular ${major ?? ''}`.trim() };
  if (major !== null && major >= target) return { status: 'skipped', detail: `Already on Angular ${major}` };
  return { status: 'skipped', detail: 'Angular upgrades are not part of this build yet' };
}

/** Step 5: install PrimeNG and the brand. */
export async function designSystemStep(_ctx: RunContext): Promise<{ status: 'skipped'; detail: string }> {
  return { status: 'skipped', detail: 'Installing the design system is not part of this build yet' };
}
