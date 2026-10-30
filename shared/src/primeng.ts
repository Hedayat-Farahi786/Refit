/** The PrimeNG packages to install for one Angular major. */
export interface PrimeNgRelease {
  angularMajor: number;
  primeng: string;
  /** Package that exports `definePreset` and the Aura preset. */
  themePackage: '@primeng/themes' | '@primeuix/themes';
  themes: string;
  primeicons: string;
  /** PrimeNG 18–20 animate through Angular's animations package; 21 has its own motion. */
  needsAngularAnimations: boolean;
}

/**
 * Community (MIT) PrimeNG releases for each Angular major, checked on npm on 2026-10-30.
 * Versions with an "-lts" suffix are under PrimeTek's commercial LTS license and are never used.
 * PrimeNG 22 and later are commercial too, so Angular 22+ has no row. PrimeNG 17 has no
 * presets, so the design system needs Angular 18 or later.
 */
export const PRIMENG_RELEASES: readonly PrimeNgRelease[] = [
  { angularMajor: 18, primeng: '18.0.2', themePackage: '@primeng/themes', themes: '18.0.2', primeicons: '7.0.0', needsAngularAnimations: true },
  { angularMajor: 19, primeng: '19.1.4', themePackage: '@primeng/themes', themes: '19.1.4', primeicons: '7.0.0', needsAngularAnimations: true },
  { angularMajor: 20, primeng: '20.4.0', themePackage: '@primeuix/themes', themes: '1.2.5', primeicons: '7.0.0', needsAngularAnimations: true },
  { angularMajor: 21, primeng: '21.1.10', themePackage: '@primeuix/themes', themes: '2.0.3', primeicons: '7.0.0', needsAngularAnimations: false },
];

export function primeNgFor(angularMajor: number): PrimeNgRelease | null {
  return PRIMENG_RELEASES.find((release) => release.angularMajor === angularMajor) ?? null;
}
