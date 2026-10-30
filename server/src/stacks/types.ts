/**
 * The boundary between Refit's stack-neutral engine and framework-specific knowledge.
 * Everything that knows about Angular lives in ./angular and is reached only through this
 * interface and the registry, so another stack can be added as one more adapter folder.
 */
import type { AngularScan, CommandSet, Fact, Finding, ScannedPage } from '@refit/shared';

export interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
}

export type PackageManager = 'npm' | 'yarn' | 'pnpm';

export interface Lockfile {
  kind: 'npm' | 'yarn' | 'pnpm';
  path: string;
}

/** Read-only view of a repository snapshot. All paths are repo-relative with forward slashes. */
export interface RepoContext {
  root: string;
  files: readonly string[];
  hasFile(relativePath: string): boolean;
  readText(relativePath: string): Promise<string | null>;
  readJson<T>(relativePath: string): Promise<T | null>;
  packageJson: PackageJson | null;
  lockfile: Lockfile | null;
  packageManager: PackageManager;
}

export interface ScanContext {
  port: number;
  /** Version of the Node that will run this app's commands, e.g. "22.12.0". */
  nodeVersion: string;
  /** True when that Node comes from the app's own Node folder setting. */
  customNode: boolean;
  targetAngularMajor: number;
}

export interface StackScan {
  facts: Fact[];
  pages: ScannedPage[];
  findings: Finding[];
  commands: CommandSet;
  uiLibraries: string[];
  msal: boolean;
  counts: { components: number; specs: number };
  node: { supported: string | null; ok: boolean };
  angular?: AngularScan;
}

export interface StackAdapter {
  id: string;
  label: string;
  /** 0 when the repo is not this stack; up to 1 when certain. */
  detect(repo: RepoContext): number;
  scan(repo: RepoContext, context: ScanContext): Promise<StackScan>;
}
