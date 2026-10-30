import type { RepoContext } from '../types.js';

interface AngularJsonProject {
  projectType?: string;
  root?: string;
  sourceRoot?: string;
  architect?: Record<string, { builder?: string; options?: Record<string, unknown> }>;
  targets?: Record<string, { builder?: string; executor?: string; options?: Record<string, unknown> }>;
}

interface AngularJson {
  defaultProject?: string;
  projects?: Record<string, AngularJsonProject>;
}

export interface AngularWorkspace {
  /** Name of the project Refit works on (the default or first application). */
  project: string | null;
  projectCount: number;
  sourceRoot: string;
  /** Entry file, e.g. src/main.ts. */
  main: string | null;
  index: string | null;
  styles: string[];
  buildBuilder: string | null;
  testBuilder: string | null;
  /** Workspace file format: angular.json, the pre-6 .angular-cli.json, or an Nx project.json. */
  format: 'angular.json' | 'angular-cli-legacy' | 'nx' | 'none';
}

export async function readAngularWorkspace(repo: RepoContext): Promise<AngularWorkspace> {
  const empty: AngularWorkspace = {
    project: null,
    projectCount: 0,
    sourceRoot: 'src',
    main: repo.hasFile('src/main.ts') ? 'src/main.ts' : null,
    index: repo.hasFile('src/index.html') ? 'src/index.html' : null,
    styles: [],
    buildBuilder: null,
    testBuilder: null,
    format: 'none',
  };
  if (!repo.hasFile('angular.json')) {
    if (repo.hasFile('.angular-cli.json')) return { ...empty, format: 'angular-cli-legacy' };
    if (repo.hasFile('project.json') || repo.hasFile('nx.json')) return { ...empty, format: 'nx' };
    return empty;
  }
  const json = await repo.readJson<AngularJson>('angular.json');
  const projects = Object.entries(json?.projects ?? {});
  const chosen =
    projects.find(([name]) => name === json?.defaultProject) ??
    projects.find(([, project]) => project.projectType === 'application') ??
    projects[0];
  if (!chosen) return { ...empty, format: 'angular.json' };
  const [name, project] = chosen;
  const targets = project.architect ?? project.targets ?? {};
  const build = targets['build'];
  const options = build?.options ?? {};
  const root = (project.root ?? '').replace(/\/$/, '');
  const sourceRoot = (project.sourceRoot ?? (root ? `${root}/src` : 'src')).replace(/\/$/, '');
  const main = asString(options['browser']) ?? asString(options['main']) ?? (repo.hasFile(`${sourceRoot}/main.ts`) ? `${sourceRoot}/main.ts` : null);
  const index = asIndex(options['index']) ?? (repo.hasFile(`${sourceRoot}/index.html`) ? `${sourceRoot}/index.html` : null);
  const styles = (Array.isArray(options['styles']) ? options['styles'] : [])
    .map((entry: unknown) => (typeof entry === 'string' ? entry : asString((entry as { input?: unknown })?.input)))
    .filter((entry): entry is string => Boolean(entry));
  const test = targets['test'];
  return {
    project: name,
    projectCount: projects.length,
    sourceRoot,
    main,
    index,
    styles,
    buildBuilder: build?.builder ?? null,
    testBuilder: test?.builder ?? null,
    format: 'angular.json',
  };
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.replace(/^\.\//, '') : null;
}

function asIndex(value: unknown): string | null {
  if (typeof value === 'string') return asString(value);
  if (value && typeof value === 'object') return asString((value as { input?: unknown }).input);
  return null;
}
