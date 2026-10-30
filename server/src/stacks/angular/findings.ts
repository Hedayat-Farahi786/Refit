import type { Finding } from '@refit/shared';
import type { NodeCompatibility } from './versions.js';
import type { LibraryReport } from './libraries.js';
import type { AngularWorkspace } from './workspace.js';

export interface AngularFindingInput {
  major: number | null;
  version: string | null;
  workspace: AngularWorkspace;
  node: NodeCompatibility;
  nodeVersion: string;
  customNode: boolean;
  libraries: LibraryReport;
  hasBuildScript: boolean;
  specCount: number;
  componentCount: number;
  pageCount: number;
  routeWarnings: string[];
  targetMajor: number;
  port: number;
}

/** Highest Angular major whose PrimeNG release is MIT-licensed (PrimeNG 22 needs a paid license). */
export const MAX_FREE_PRIMENG_ANGULAR_MAJOR = 21;
const LARGE_APP_PAGES = 40;
const LARGE_APP_COMPONENTS = 300;

export function angularFindings(input: AngularFindingInput): Finding[] {
  const findings: Finding[] = [];
  const { major, workspace, targetMajor } = input;

  if (workspace.format === 'angular-cli-legacy') {
    findings.push({
      id: 'angular-cli-legacy',
      severity: 'block',
      title: 'Angular 5 or older',
      explanation: 'The app still uses .angular-cli.json, the project format from before Angular 6. Automatic upgrades cannot start that far back.',
      fix: 'Upgrade the app to Angular 6 or newer by hand (see https://update.angular.dev), commit, then scan again.',
    });
  }
  if (workspace.format === 'nx') {
    findings.push({
      id: 'nx-workspace',
      severity: 'warn',
      title: 'Nx workspace',
      explanation: 'This repo is an Nx workspace. Refit reads the routes but its build and serve commands assume the Angular CLI.',
      fix: 'Under Advanced, set the build and serve commands to the Nx ones (for example npx nx build app and npx nx serve app --port {port}).',
    });
  }

  if (major === null) {
    findings.push({
      id: 'angular-version-unknown',
      severity: 'warn',
      title: 'Angular version not found',
      explanation: 'We could not read the Angular version from the lockfile or package.json, so Refit cannot plan upgrades.',
      fix: 'Make sure @angular/core is listed in package.json with a version and that the lockfile is committed.',
    });
  } else if (major < targetMajor) {
    const hops = targetMajor - major;
    findings.push({
      id: 'needs-upgrade',
      severity: 'warn',
      title: `Angular ${major} needs ${hops} upgrade ${hops === 1 ? 'step' : 'steps'}`,
      explanation: `The design system (PrimeNG with design tokens) is installed on Angular ${targetMajor}. Refit upgrades one major version at a time (${major} → ${targetMajor}), building after each step and committing each one separately.`,
      fix: 'Nothing to do now. If a step fails, Refit stops safely and keeps the branch so a developer can finish it. You can also upgrade the app yourself first.',
    });
    if (major < 12) {
      findings.push({
        id: 'very-old-angular',
        severity: 'warn',
        title: 'Very old Angular version',
        explanation: `Angular ${major} uses View Engine and webpack 4. Upgrades from versions before 12 often need manual fixes for removed APIs and old dependencies.`,
        fix: 'Expect the upgrade steps to stop for a developer. Upgrading to Angular 12 by hand first makes the rest much smoother.',
      });
    }
  } else if (major > MAX_FREE_PRIMENG_ANGULAR_MAJOR) {
    findings.push({
      id: 'primeng-license',
      severity: 'block',
      title: `Angular ${major} needs a commercial PrimeNG license`,
      explanation: `PrimeNG for Angular ${major} is released under the PrimeUI commercial license (free only for very small companies). Refit installs the last MIT version, PrimeNG 21, which needs Angular 21.`,
      fix: 'Ask whether Oerlikon has a PrimeUI license. Until then, Refit cannot modernize apps on Angular 22 or newer.',
    });
  } else if (major > targetMajor) {
    findings.push({
      id: 'newer-than-target',
      severity: 'info',
      title: `Angular ${major} is newer than the target (${targetMajor})`,
      explanation: 'Refit never downgrades Angular.',
      fix: 'Choose "Keep current version" when you start modernizing.',
    });
  }

  if (!input.node.ok && input.node.supported) {
    const best = input.node.recommendedMajor;
    const where = input.customNode ? "this app's Node folder" : 'the Node that runs Refit';
    findings.push({
      id: 'node-mismatch',
      severity: 'warn',
      title: `Node ${input.nodeVersion} ${input.node.mismatch === 'newer' ? 'is newer than' : 'is older than'} Angular ${major} supports`,
      explanation: `Angular ${major} supports Node ${input.node.supported}; ${where} is ${input.nodeVersion}. ${
        input.node.mismatch === 'newer'
          ? 'Older Angular versions often still build on newer Node, and the first build will tell.'
          : 'The Angular CLI refuses to run on a Node version that is too old.'
      }`,
      fix: best
        ? `If the first build fails, install Node ${best} (nvm install ${best}, with nvm or nvm-windows) and set this app's Node folder under Advanced to its folder. Refit itself keeps running on its own Node.`
        : 'Install a supported Node version and set it as this app\'s Node folder under Advanced.',
    });
  }

  if (input.libraries.nodeSass) {
    findings.push({
      id: 'node-sass',
      severity: 'warn',
      title: 'Uses node-sass',
      explanation: 'node-sass is deprecated and does not install on current Node versions, so installing dependencies will probably fail.',
      fix: 'Replace node-sass with sass in the source repo (npm uninstall node-sass && npm install -D sass), commit, then scan again. Or set an old Node (14 or 16) as this app\'s Node folder.',
    });
  }

  if (!input.hasBuildScript) {
    findings.push({
      id: 'no-build-script',
      severity: 'info',
      title: 'No build script',
      explanation: 'package.json has no "build" script.',
      fix: 'Nothing required: Refit runs npx ng build. Change it under Advanced if the app builds differently.',
    });
  }

  if (input.specCount === 0) {
    findings.push({
      id: 'no-tests',
      severity: 'info',
      title: 'No unit tests',
      explanation: 'We found no .spec.ts files, so Refit cannot compare test results before and after.',
      fix: 'Nothing required. Builds, screenshots and API-call checks still prove nothing behind the UI changed.',
    });
  }

  if (input.pageCount === 0) {
    findings.push({
      id: 'no-pages',
      severity: 'warn',
      title: 'No pages found',
      explanation: 'We could not find any routes with components in the routing files.',
      fix: 'Add the pages by hand in the page list (route and component file).',
    });
  }
  for (const [index, warning] of input.routeWarnings.slice(0, 3).entries()) {
    findings.push({
      id: `route-warning-${index + 1}`,
      severity: 'info',
      title: 'A route could not be followed',
      explanation: warning,
      fix: 'Check the page list and add any missing page by hand.',
    });
  }

  if (input.pageCount > LARGE_APP_PAGES || input.componentCount > LARGE_APP_COMPONENTS) {
    findings.push({
      id: 'large-app',
      severity: 'warn',
      title: 'Large app',
      explanation: `This app has ${input.pageCount} pages and ${input.componentCount} components. A full run takes longer and costs more.`,
      fix: 'Include a few representative pages for the first run, then run again for the rest.',
    });
  }

  if (input.libraries.primengVersion) {
    findings.push({
      id: 'existing-primeng',
      severity: 'info',
      title: 'Already uses PrimeNG',
      explanation: `The app uses PrimeNG ${input.libraries.primengVersion}. Refit aligns it with the version that matches the target Angular and replaces any old theme with the brand preset.`,
      fix: 'Nothing required.',
    });
  }

  if (input.libraries.msal) {
    findings.push({
      id: 'msal',
      severity: 'info',
      title: 'Uses Microsoft sign-in',
      explanation: `Screenshots need a signed-in browser. Microsoft only accepts sign-ins on registered redirect URIs, so the dev server must run on port ${input.port}.`,
      fix: 'Before the first run, open Settings and use "Sign in once" with a test account. Make sure http://localhost:' + `${input.port} is a redirect URI of the app in Entra ID.`,
    });
  } else if (input.libraries.otherAuth.length > 0) {
    findings.push({
      id: 'other-auth',
      severity: 'info',
      title: 'Uses a sign-in library',
      explanation: `The app uses ${input.libraries.otherAuth.join(', ')}. Pages behind sign-in need a signed-in browser for screenshots.`,
      fix: 'Use "Sign in once" in Settings to sign in with a test account before the first run.',
    });
  }

  if (input.libraries.ssr) {
    findings.push({
      id: 'ssr',
      severity: 'info',
      title: 'Uses server-side rendering',
      explanation: 'The app renders on the server too. Refit modernizes the components; the server setup itself is left alone.',
      fix: 'Nothing required.',
    });
  }

  if (workspace.projectCount > 1 && workspace.project) {
    findings.push({
      id: 'multiple-projects',
      severity: 'info',
      title: `${workspace.projectCount} projects in angular.json`,
      explanation: `Refit works on the "${workspace.project}" project.`,
      fix: 'If that is the wrong one, set the build and serve commands for the right project under Advanced.',
    });
  }

  return findings;
}
