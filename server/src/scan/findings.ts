import type { AppRecord, Finding, PageConfig, Readiness } from '@refit/shared';
import type { RepoContext } from '../stacks/types.js';
import type { Snapshot } from './snapshot.js';

/** Findings that do not depend on the framework: git state, package files, unknown stacks. */
export function genericFindings(app: AppRecord, snapshot: Snapshot, repo: RepoContext, stackId: string | null, packageManagerAvailable: boolean): Finding[] {
  const findings: Finding[] = [];

  if (!snapshot.git.isRepo) {
    findings.push({
      id: 'not-git',
      severity: 'block',
      title: 'Not a git repository',
      explanation: 'Refit works on a copy made with git and delivers its changes as a branch and pull request, so the folder must be a git repository.',
      fix: 'In the folder, run: git init, then git add -A, then git commit -m "Initial commit". Then scan again.',
    });
  } else {
    if (snapshot.uncommitted > 0) {
      findings.push({
        id: 'uncommitted',
        severity: 'warn',
        title: `${snapshot.uncommitted} uncommitted ${snapshot.uncommitted === 1 ? 'change' : 'changes'}`,
        explanation: 'Refit copies the last commit, so changed or new files that are not committed will not be modernized.',
        fix: 'Commit or stash your changes, then scan again.',
      });
    }
    if (!snapshot.git.remoteUrl && app.source.kind === 'local') {
      findings.push({
        id: 'no-remote',
        severity: 'info',
        title: 'No git remote',
        explanation: 'The repository has no "origin" remote, so Refit can modernize it but cannot push the branch or open a pull request.',
        fix: 'Add a remote (git remote add origin <url>) before you create the pull request.',
      });
    }
  }

  if (!repo.packageJson) {
    findings.push({
      id: 'no-package-json',
      severity: 'block',
      title: 'No package.json',
      explanation: `We found no package.json in ${snapshot.appDir ? `the "${snapshot.appDir}" folder` : 'the app folder'}, so this is not a Node-based front end.`,
      fix: 'Choose the folder that contains the Angular app (the one with package.json and angular.json).',
    });
  } else if (!stackId) {
    const deps = { ...repo.packageJson.dependencies, ...repo.packageJson.devDependencies };
    const angularJs = 'angular' in deps;
    findings.push(
      angularJs
        ? {
            id: 'angularjs',
            severity: 'block',
            title: 'AngularJS (1.x) is not supported',
            explanation: 'This app uses AngularJS, the predecessor of Angular. It needs a rewrite rather than a modernization.',
            fix: 'Migrate the app to Angular first (see https://angular.dev/update) or rebuild it.',
          }
        : {
            id: 'not-angular',
            severity: 'block',
            title: 'Not an Angular app',
            explanation: 'We did not find @angular/core in package.json. Refit modernizes Angular apps for now.',
            fix: 'Check that you chose the folder of the Angular app. In a repo with several apps, choose the app\'s own folder.',
          },
    );
  }

  if (!packageManagerAvailable) {
    findings.push({
      id: 'package-manager-missing',
      severity: 'block',
      title: `${repo.packageManager} is not installed`,
      explanation: `The app uses ${repo.packageManager} (it has a ${repo.lockfile?.path ?? 'matching'} lockfile), but the ${repo.packageManager} command was not found.`,
      fix: `Install it (corepack enable, or npm install -g ${repo.packageManager}), restart Refit, then scan again.`,
    });
  }
  return findings;
}

/** Findings that depend on the page list the user edits, recomputed on every change. */
export function pageFindings(pages: PageConfig[]): Finding[] {
  const missing = pages.filter((page) => page.include && routeParamNames(page.route).some((param) => !page.params[param]?.trim()));
  const findings: Finding[] = [];
  if (missing.length > 0) {
    findings.push({
      id: 'params-needed',
      severity: 'warn',
      title: `${missing.length} ${missing.length === 1 ? 'page needs' : 'pages need'} sample values`,
      explanation: `Routes like ${missing[0]!.route} need a real value (for example an ID that exists in the test data) so Refit can open them for screenshots.`,
      fix: 'Fill in a value for each parameter in the page list, or exclude those pages.',
    });
  }
  if (pages.length > 0 && pages.every((page) => !page.include)) {
    findings.push({
      id: 'no-pages-included',
      severity: 'warn',
      title: 'No pages included',
      explanation: 'Every page is excluded, so a run would only install the design system and modernize the app shell.',
      fix: 'Include at least one page in the page list.',
    });
  }
  return findings;
}

export function routeParamNames(route: string): string[] {
  return route
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1).replace(/\?$/, ''));
}

export function readinessOf(findings: Finding[]): Readiness {
  if (findings.some((finding) => finding.severity === 'block')) return 'red';
  if (findings.some((finding) => finding.severity === 'warn')) return 'yellow';
  return 'green';
}

const SEVERITY_ORDER: Record<Finding['severity'], number> = { block: 0, warn: 1, info: 2 };

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
