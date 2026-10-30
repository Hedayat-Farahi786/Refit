import type { CostUnit } from '@refit/shared';

/** The smallest budget worth starting an agent task with. */
const MIN_TASK_USD = 0.05;

/**
 * Tracks AI spend for a run. Dollar budgets (Claude) are enforced per page and per run; providers
 * that count requests (Copilot) are capped per task by the provider itself.
 */
export class BudgetLedger {
  private totalUsdValue = 0;
  private totalRequestsValue = 0;
  private readonly perScope = new Map<string, number>();

  constructor(
    readonly perRunUsd: number,
    readonly perPageUsd: number,
    readonly unit: CostUnit,
  ) {}

  get totalUsd(): number {
    return this.totalUsdValue;
  }

  get totalRequests(): number {
    return this.totalRequestsValue;
  }

  record(scope: string, usd: number, requests: number): void {
    this.totalUsdValue += usd;
    this.totalRequestsValue += requests;
    this.perScope.set(scope, (this.perScope.get(scope) ?? 0) + usd);
  }

  spentOn(scope: string): number {
    return this.perScope.get(scope) ?? 0;
  }

  remainingRun(): number {
    return Math.max(0, this.perRunUsd - this.totalUsdValue);
  }

  /** Budget left for one more task on a page: the page's remainder, capped by the run's remainder. */
  remainingFor(scope: string, scopeBudget = this.perPageUsd): number {
    return Math.max(0, Math.min(scopeBudget - this.spentOn(scope), this.remainingRun()));
  }

  /** False once the run budget is used up (never for request-counted providers). */
  canStart(scope: string, scopeBudget = this.perPageUsd): boolean {
    if (this.unit !== 'usd') return true;
    return this.remainingFor(scope, scopeBudget) >= Math.min(MIN_TASK_USD, scopeBudget);
  }
}
