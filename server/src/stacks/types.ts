/**
 * The boundary between Refit's stack-neutral engine and framework-specific knowledge.
 * Everything that knows about Angular lives in ./angular and is reached only through this
 * interface and the registry, so another stack can be added as one more adapter folder.
 */
import type { AngularScan, CommandSet, Fact, Finding, ScannedPage, ThemeTarget } from '@refit/shared';

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

/** One major-version step of a framework upgrade. */
export interface UpgradeHop {
  from: number;
  to: number;
  /** Packages the update command moves to the new major. */
  packages: string[];
  /** Node versions the new major supports (a semver range), or "" when unknown. */
  node: string;
}

/** How a stack upgrades its framework one major version at a time. */
export interface StackUpgrades {
  plan(from: number, to: number, dependencies: Readonly<Record<string, string>>): UpgradeHop[];
  /** The shell command for one hop, run in the app folder. */
  command(hop: UpgradeHop): string;
}

/** The component library and theme a framework version gets. */
export interface DesignSystemRelease {
  /** For people and commit messages: "PrimeNG 21.1.10". */
  label: string;
  /** Exact package specs to install, e.g. "primeng@21.1.10". */
  packages: string[];
  /** Packages to add only when the app does not have them yet (name -> spec). */
  ifMissing: Record<string, string>;
  /** What the brand generator needs to know (theme package, root font size). */
  themeTarget: ThemeTarget;
  /** For the foundation prompt. */
  library: { version: string; themePackage: string; needsAnimations: boolean };
}

export interface StackDesignSystem {
  /** The release for this framework version, or the reason there is none and what to do. */
  releaseFor(major: number, coreVersion: string): { release: DesignSystemRelease } | { problem: string; fix: string };
}

export interface StackAdapter {
  id: string;
  label: string;
  /** 0 when the repo is not this stack; up to 1 when certain. */
  detect(repo: RepoContext): number;
  scan(repo: RepoContext, context: ScanContext): Promise<StackScan>;
  /** The package whose installed version is the framework version, e.g. "@angular/core". */
  frameworkPackage: string;
  upgrades?: StackUpgrades;
  designSystem?: StackDesignSystem;
}
