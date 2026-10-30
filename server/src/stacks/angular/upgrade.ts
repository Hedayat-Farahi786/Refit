import semver from 'semver';
import { ANGULAR_NODE_SUPPORT } from './versions.js';

/** One major-version step of an Angular upgrade. */
export interface UpgradeHop {
  from: number;
  to: number;
  /** Packages for `ng update`, e.g. "@angular/core@18". */
  packages: string[];
  /** Node versions this Angular major supports. */
  node: string;
}

/**
 * Plans the upgrade one major at a time, as the Angular update guide requires, with Angular Material
 * and the CDK at the same major when the app uses them.
 */
export function planUpgradeHops(from: number, to: number, dependencies: Readonly<Record<string, string>>): UpgradeHop[] {
  const hops: UpgradeHop[] = [];
  for (let major = from + 1; major <= to; major++) {
    const packages = [`@angular/core@${major}`, `@angular/cli@${major}`];
    for (const name of ['@angular/material', '@angular/cdk']) if (dependencies[name]) packages.push(`${name}@${major}`);
    hops.push({ from: major - 1, to: major, packages, node: ANGULAR_NODE_SUPPORT[major] ?? '' });
  }
  return hops;
}

/**
 * The update command for a hop. It runs the target major's CLI (so its migrations run) and uses
 * --force, because other libraries often lag behind Angular's peer ranges; the build after the hop
 * is the real check.
 */
export function ngUpdateCommand(hop: UpgradeHop): string {
  return `npx --yes @angular/cli@${hop.to} update ${hop.packages.join(' ')} --allow-dirty --force`;
}

/** The hops whose Angular does not support the Node that runs the app's commands. */
export function hopsNeedingOtherNode(hops: readonly UpgradeHop[], nodeVersion: string): UpgradeHop[] {
  return hops.filter((hop) => hop.node !== '' && !semver.satisfies(nodeVersion, hop.node));
}
