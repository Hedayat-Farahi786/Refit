import type { Fact } from '@refit/shared';
import { allDependencies } from '../repo.js';
import type { RepoContext, ScanContext, StackAdapter, StackScan } from '../types.js';
import { angularCommands } from './commands.js';
import { looksLikeComponent } from './components.js';
import { angularFindings } from './findings.js';
import { detectLibraries } from './libraries.js';
import { extractRoutes } from './routes.js';
import { nodeCompatibility, resolveAngularVersion } from './versions.js';
import { readAngularWorkspace } from './workspace.js';

export const angularAdapter: StackAdapter = {
  id: 'angular',
  label: 'Angular',

  detect(repo: RepoContext): number {
    const deps = allDependencies(repo.packageJson);
    if ('@angular/core' in deps) return 1;
    if (repo.hasFile('angular.json')) return 0.8;
    return 0;
  },

  async scan(repo: RepoContext, context: ScanContext): Promise<StackScan> {
    const [version, workspace] = await Promise.all([resolveAngularVersion(repo), readAngularWorkspace(repo)]);
    const [libraries, routes] = await Promise.all([detectLibraries(repo, workspace), extractRoutes(repo, workspace.sourceRoot)]);

    const sourceFiles = repo.files.filter((file) => file.startsWith(`${workspace.sourceRoot}/`) || workspace.sourceRoot === '.');
    const specCount = sourceFiles.filter((file) => file.endsWith('.spec.ts')).length;
    let componentCount = 0;
    for (const file of sourceFiles) {
      if (!file.endsWith('.ts') || file.endsWith('.spec.ts')) continue;
      const text = await repo.readText(file);
      if (text && looksLikeComponent(text)) componentCount++;
    }

    const mainText = workspace.main ? await repo.readText(workspace.main) : null;
    const bootstrap = mainText?.includes('bootstrapApplication(')
      ? 'standalone'
      : mainText?.includes('bootstrapModule(')
        ? 'ngmodule'
        : 'unknown';

    const node = nodeCompatibility(version.major, context.nodeVersion);
    const findings = angularFindings({
      major: version.major,
      version: version.version,
      workspace,
      node,
      nodeVersion: context.nodeVersion,
      customNode: context.customNode,
      libraries,
      hasBuildScript: Boolean(repo.packageJson?.scripts?.['build']),
      specCount,
      componentCount,
      pageCount: routes.pages.length,
      routeWarnings: routes.warnings,
      targetMajor: context.targetAngularMajor,
      port: context.port,
    });

    const facts: Fact[] = [
      { label: 'Angular', value: version.version ?? 'unknown', tone: version.major === null ? 'warn' : version.major < context.targetAngularMajor ? 'warn' : 'good' },
      { label: 'App setup', value: bootstrap === 'standalone' ? 'Standalone components' : bootstrap === 'ngmodule' ? 'NgModules' : 'Unknown' },
      { label: 'Routing', value: routes.hashRouting ? 'Hash (/#/path)' : 'Path' },
      { label: 'UI libraries', value: libraries.libraries.join(', ') || 'None found' },
      { label: 'Microsoft sign-in', value: libraries.msal ? 'MSAL' : 'No' },
      { label: 'Node', value: node.ok ? `${context.nodeVersion} (supported)` : `${context.nodeVersion} (Angular ${version.major} supports ${node.supported})`, tone: node.ok ? 'good' : 'warn' },
    ];
    if (workspace.project) facts.push({ label: 'Project', value: workspace.project });

    return {
      facts,
      pages: routes.pages,
      findings,
      commands: angularCommands(repo, workspace, version.major, context.nodeVersion, specCount),
      uiLibraries: libraries.libraries,
      msal: libraries.msal,
      counts: { components: componentCount, specs: specCount },
      node: { supported: node.supported, ok: node.ok },
      angular: {
        version: version.version,
        major: version.major,
        bootstrap,
        hashRouting: routes.hashRouting,
        project: workspace.project,
        sourceRoot: workspace.sourceRoot,
        baseHref: workspace.baseHref,
      },
    };
  },
};
