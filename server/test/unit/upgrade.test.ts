import { describe, expect, it } from 'vitest';
import { primeNgFor, PRIMENG_RELEASES } from '../../src/stacks/angular/primeng.js';
import { hopsNeedingOtherNode, ngUpdateCommand, planUpgradeHops } from '../../src/stacks/angular/upgrade.js';

describe('Angular upgrade plan', () => {
  it('goes one major at a time and brings Angular Material along', () => {
    const hops = planUpgradeHops(17, 21, { '@angular/core': '^17.3.0', '@angular/material': '^17.3.0', '@angular/cdk': '^17.3.0' });
    expect(hops.map((hop) => `${hop.from}->${hop.to}`)).toEqual(['17->18', '18->19', '19->20', '20->21']);
    expect(hops[0]!.packages).toEqual(['@angular/core@18', '@angular/cli@18', '@angular/material@18', '@angular/cdk@18']);
    expect(ngUpdateCommand(hops[3]!)).toBe('npx --yes @angular/cli@21 update @angular/core@21 @angular/cli@21 @angular/material@21 @angular/cdk@21 --allow-dirty --force');
  });

  it('updates the CDK without Angular Material, and nothing when already there', () => {
    expect(planUpgradeHops(20, 21, { '@angular/cdk': '^20.0.0' })[0]!.packages).toContain('@angular/cdk@21');
    expect(planUpgradeHops(21, 21, {})).toEqual([]);
  });

  it('finds hops whose Angular does not support the Node in use', () => {
    const hops = planUpgradeHops(17, 21, {});
    expect(hopsNeedingOtherNode(hops, '22.12.0')).toEqual([]);
    expect(hopsNeedingOtherNode(hops, '24.1.0').map((hop) => hop.to)).toEqual([18, 19]);
  });
});

describe('PrimeNG releases', () => {
  it('has an MIT community release for Angular 18 to 21 and none for 17 or 22', () => {
    expect(PRIMENG_RELEASES.map((release) => release.angularMajor)).toEqual([18, 19, 20, 21]);
    expect(PRIMENG_RELEASES.every((release) => !release.primeng.includes('lts') && !release.themes.includes('lts'))).toBe(true);
    expect(primeNgFor(17)).toBeNull();
    expect(primeNgFor(22)).toBeNull();
    expect(primeNgFor(21)).toMatchObject({ primeng: '21.1.10', themePackage: '@primeuix/themes', needsAngularAnimations: false });
    expect(primeNgFor(19)).toMatchObject({ themePackage: '@primeng/themes', needsAngularAnimations: true });
  });
});
