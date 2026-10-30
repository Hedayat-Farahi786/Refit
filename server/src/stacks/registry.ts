import { angularAdapter } from './angular/index.js';
import type { RepoContext, StackAdapter } from './types.js';

/** All stack adapters Refit knows. Add new stacks here. */
export const STACK_ADAPTERS: readonly StackAdapter[] = [angularAdapter];

/** The adapter that recognizes the repo with the highest confidence, or null. */
export function pickAdapter(repo: RepoContext): StackAdapter | null {
  let best: { adapter: StackAdapter; score: number } | null = null;
  for (const adapter of STACK_ADAPTERS) {
    const score = adapter.detect(repo);
    if (score > 0 && (!best || score > best.score)) best = { adapter, score };
  }
  return best?.adapter ?? null;
}
