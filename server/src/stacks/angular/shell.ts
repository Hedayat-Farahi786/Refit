import path from 'node:path';
import type { RepoContext } from '../types.js';
import type { AngularWorkspace } from './workspace.js';

export interface AppShell {
  /** The app's own global stylesheet (not a package's), e.g. "src/styles.scss". */
  stylesFile: string | null;
  /** Where app-wide providers go: app.config.ts for standalone apps, the AppModule otherwise. */
  providersFile: string | null;
  /** The root component and the layout parts around every page (header, navigation, footer). */
  shellFiles: string[];
}

const SHELL_NAME = /(?:^|[/._-])(header|navbar|nav|navigation|sidebar|side-nav|sidenav|footer|layout|shell|topbar|top-bar|toolbar|menu)(?:[/._-]|$)/i;
const SHELL_EXTENSIONS = ['.ts', '.html', '.scss', '.css', '.sass', '.less'];
const MAX_SHELL_FILES = 16;

/** Finds the files the design-system step and the foundation task work on. */
export async function findAppShell(repo: RepoContext, workspace: AngularWorkspace): Promise<AppShell> {
  const stylesFile = workspace.styles.find((entry) => !entry.startsWith('node_modules/') && /\.(s?css|sass|less)$/.test(entry) && repo.hasFile(entry)) ?? null;
  const main = workspace.main;
  const mainText = main ? await repo.readText(main) : null;
  if (!main || !mainText) return { stylesFile, providersFile: null, shellFiles: [] };

  let providersFile: string | null = null;
  let rootComponent: string | null = null;
  const standalone = /bootstrapApplication\(\s*(\w+)\s*(?:,\s*(\w+))?/.exec(mainText);
  if (standalone) {
    rootComponent = resolveImport(repo, main, mainText, standalone[1]!);
    // An inline config object lives in main.ts itself.
    providersFile = standalone[2] ? resolveImport(repo, main, mainText, standalone[2]) : main;
  } else {
    const ngModule = /bootstrapModule\(\s*(\w+)/.exec(mainText);
    if (ngModule) {
      providersFile = resolveImport(repo, main, mainText, ngModule[1]!);
      const moduleText = providersFile ? await repo.readText(providersFile) : null;
      const bootstrapped = moduleText ? /bootstrap\s*:\s*\[\s*(\w+)/.exec(moduleText)?.[1] : undefined;
      if (providersFile && moduleText && bootstrapped) rootComponent = resolveImport(repo, providersFile, moduleText, bootstrapped);
    }
  }

  const shellFiles: string[] = [];
  const add = (file: string) => {
    if (!shellFiles.includes(file) && shellFiles.length < MAX_SHELL_FILES) shellFiles.push(file);
  };
  if (rootComponent) for (const file of siblings(repo, rootComponent)) add(file);
  const appFolder = `${workspace.sourceRoot}/app/`;
  for (const file of repo.files) {
    if (!file.startsWith(appFolder) || file.endsWith('.spec.ts')) continue;
    if (!SHELL_EXTENSIONS.some((extension) => file.endsWith(extension))) continue;
    // Only shallow layout parts: deep files belong to pages and feature modules.
    if (file.slice(appFolder.length).split('/').length > 3) continue;
    if (SHELL_NAME.test(file.slice(appFolder.length)) && !/routing|\.routes\.ts$|\.service\.ts$|\.guard\.ts$/.test(file)) add(file);
  }
  return { stylesFile, providersFile, shellFiles };
}

/** Resolves the file an identifier was imported from, relative to the importing file. */
function resolveImport(repo: RepoContext, fromFile: string, text: string, identifier: string): string | null {
  const pattern = new RegExp(`import\\s*\\{[^}]*\\b${identifier}\\b[^}]*\\}\\s*from\\s*['"](\\.[^'"]+)['"]`);
  const spec = pattern.exec(text)?.[1];
  if (!spec) return null;
  const base = path.posix.join(path.posix.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) if (repo.hasFile(candidate)) return candidate;
  return null;
}

/** A component's .ts file and its template and styles with the same base name. */
function siblings(repo: RepoContext, tsFile: string): string[] {
  const base = tsFile.replace(/\.ts$/, '');
  return [tsFile, ...SHELL_EXTENSIONS.filter((extension) => extension !== '.ts').map((extension) => `${base}${extension}`).filter((file) => repo.hasFile(file))];
}
