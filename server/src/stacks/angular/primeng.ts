import { primeNgFor, themeTargetForPrimeNg, type PrimeNgRelease, type ThemeTarget } from '@refit/shared';
import type { StackDesignSystem } from '../types.js';

export { PRIMENG_RELEASES, primeNgFor, type PrimeNgRelease } from '@refit/shared';

/** What the brand generator needs to know about the installed PrimeNG. */
export function themeTargetFor(release: PrimeNgRelease): ThemeTarget {
  return themeTargetForPrimeNg(release.angularMajor);
}

/** PrimeNG for the app's Angular major, from the MIT release table. */
export const angularDesignSystem: StackDesignSystem = {
  releaseFor(major, coreVersion) {
    const release = primeNgFor(major);
    if (!release) {
      return major > 21
        ? {
            problem: `Angular ${major} needs PrimeNG ${major} or later, which PrimeTek only sells under a commercial license.`,
            fix: 'Refit installs the MIT-licensed PrimeNG 21. Use an app on Angular 21 or below, or buy the license and set PrimeNG up by hand.',
          }
        : { problem: `PrimeNG themes need Angular 18 or newer, and the app is on Angular ${major}.`, fix: 'Run again with an Angular upgrade (Angular 21 is recommended).' };
    }
    const ifMissing: Record<string, string> = release.needsAngularAnimations ? { '@angular/animations': `@angular/animations@${coreVersion}` } : {};
    return {
      release: {
        label: `PrimeNG ${release.primeng}`,
        packages: [`primeng@${release.primeng}`, `${release.themePackage}@${release.themes}`, `primeicons@${release.primeicons}`],
        ifMissing,
        themeTarget: themeTargetFor(release),
        library: { version: release.primeng, themePackage: release.themePackage, needsAnimations: release.needsAngularAnimations },
      },
    };
  },
};
