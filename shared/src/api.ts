/** Types exchanged between Refit's server and web UI over REST. */
import type { Brand } from './brand/brand.js';

export type Readiness = 'green' | 'yellow' | 'red';
export type FindingSeverity = 'info' | 'warn' | 'block';

export interface Finding {
  id: string;
  severity: FindingSeverity;
  title: string;
  /** What we found and why it matters, in plain words. */
  explanation: string;
  /** What to do about it. */
  fix: string;
}

/**
 * Where an app's code comes from. For a git URL, `subdir` is the app's folder inside the repo
 * (for example "ClientApp"); for a local folder Refit works it out from the repo root.
 */
export type AppSource = { kind: 'local'; path: string } | { kind: 'git'; url: string; subdir?: string };

export interface CommandSet {
  install: string;
  /** Tried once when the install command fails, e.g. with --legacy-peer-deps. */
  installRetry?: string;
  build: string;
  test?: string;
  /** Dev server command; `{port}` is replaced with the app's port. */
  serve: string;
  env: Record<string, string>;
}

export interface CommandOverrides {
  install?: string;
  build?: string;
  test?: string;
  serve?: string;
  env?: Record<string, string>;
  /** Folder that contains the `node` executable to use for this app's commands. */
  nodeDir?: string;
}

export interface ScannedPage {
  id: string;
  name: string;
  /** Full route with a leading slash, e.g. /requests/:id */
  route: string;
  params: string[];
  componentClass?: string;
  componentFile?: string;
  templateFile?: string;
  styleFiles: string[];
  /** Routing file that declared this route. */
  routeFile?: string;
  lazy: boolean;
}

export interface PageConfig {
  id: string;
  name: string;
  route: string;
  include: boolean;
  /** Sample values for route parameters, e.g. { id: "42" }. */
  params: Record<string, string>;
  /** Repo-relative files the agent may edit for this page. */
  files: string[];
  componentFile?: string;
  /** True when the user added the page by hand. */
  manual: boolean;
}

export interface Fact {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}

export interface AngularScan {
  version: string | null;
  major: number | null;
  bootstrap: 'standalone' | 'ngmodule' | 'unknown';
  hashRouting: boolean;
  project: string | null;
  sourceRoot: string;
  /** Base path the app is served under, e.g. "/portal/" (null for "/"). */
  baseHref: string | null;
  /** The app's own global stylesheet, e.g. "src/styles.scss" (older scans do not have it). */
  stylesFile?: string | null;
  /** Where app-wide providers are registered: app.config.ts or the AppModule. */
  providersFile?: string | null;
  /** The root component and the layout parts around every page. */
  shellFiles?: string[];
}

export interface GitInfo {
  isRepo: boolean;
  branch?: string;
  commit?: string;
  dirty?: boolean;
  remoteUrl?: string;
}

export interface ScanResult {
  scannedAt: string;
  durationMs: number;
  /** The app's folder relative to the repo root, "" when the app is the whole repo. */
  appDir: string;
  /** Adapter that recognized the app, e.g. "angular"; null when nothing did. */
  stack: string | null;
  git: GitInfo;
  packageManager: 'npm' | 'yarn' | 'pnpm';
  lockfile: string | null;
  scripts: Record<string, string>;
  uiLibraries: string[];
  msal: boolean;
  counts: { components: number; specs: number; pages: number; sourceFiles: number };
  node: { current: string; supported: string | null; ok: boolean };
  angular?: AngularScan;
  facts: Fact[];
  pages: ScannedPage[];
  findings: Finding[];
  commands: CommandSet;
}

export interface ScanState {
  status: 'idle' | 'scanning' | 'failed';
  startedAt?: string;
  /** Why the last scan failed and what to do, when status is "failed". */
  error?: string;
  fix?: string;
}

export interface AppRecord {
  id: string;
  name: string;
  source: AppSource;
  port: number;
  createdAt: string;
  updatedAt: string;
  scanState: ScanState;
  scan?: ScanResult;
  pages: PageConfig[];
  overrides: CommandOverrides;
  /** Scan findings plus findings that depend on the page list (for example missing sample values). */
  findings: Finding[];
  readiness: Readiness | null;
  review?: ReviewResult;
}

export type ProviderId = 'claude' | 'copilot' | 'dryrun';

export interface ProviderCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  available: boolean;
  /** Why the provider cannot be used right now, in plain words. */
  reason?: string;
  checks: ProviderCheck[];
  /** Steps that make the provider available. */
  setup: string[];
  /** What the provider counts: dollars, or requests/credits for Copilot. */
  costUnit: CostUnit;
  /** Set when "Test connection" is possible: what one test costs, in plain words. */
  testCost?: string;
}

/** The result of "Test connection": one tiny real request to the provider. */
export interface ProviderTestResult {
  ok: boolean;
  /** The model's reply, or what went wrong and how to fix it. */
  detail: string;
  durationMs: number;
  /** Which model answered, when the provider says. */
  model?: string;
  costUsd?: number;
  requests?: number;
}

export type CostUnit = 'usd' | 'requests' | 'credits';

export type RunKind = 'modernize' | 'review';
export type RunStatus = 'running' | 'done' | 'failed' | 'cancelled' | 'interrupted';
export type StepStatus = 'pending' | 'active' | 'done' | 'warn' | 'failed' | 'skipped';
export type PageStatus = 'queued' | 'working' | 'reviewing' | 'done' | 'flagged' | 'skipped';
export type Viewport = 'desktop' | 'mobile';
export type ShotPhase = 'before' | 'after';

export const MODERNIZE_STEPS = [
  { id: 'prepare', label: 'Prepare a safe copy' },
  { id: 'install', label: 'Install dependencies' },
  { id: 'baseline', label: 'Check how it works today' },
  { id: 'upgrade', label: 'Upgrade Angular' },
  { id: 'design-system', label: 'Install the design system' },
  { id: 'pages', label: 'Modernize pages' },
  { id: 'final', label: 'Final checks' },
  { id: 'ready', label: 'Ready for review' },
] as const;
export type ModernizeStepId = (typeof MODERNIZE_STEPS)[number]['id'];
export type StepId = ModernizeStepId | 'review';

export interface RunSettings {
  provider: ProviderId;
  brandId: string;
  /** Angular major to upgrade to, or "keep" to stay on the current version (18 or newer). */
  targetAngularMajor: number | 'keep';
  polishRounds: 0 | 1 | 2;
  runTests: boolean;
  perPageUsd: number;
  perRunUsd: number;
  onApiChange: 'flag' | 'rollback';
  strongModelForComplexPages: boolean;
}

export interface StepState {
  id: StepId;
  label: string;
  status: StepStatus;
  detail?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface PageReport {
  status: 'done' | 'partial';
  /** Plain-text summary written for a non-technical reader. */
  summary: string;
  inventory: string[];
  changes: string[];
  componentsUsed: string[];
  concerns: string[];
  /** False when the agent did not return a parseable JSON block. */
  structured: boolean;
}

export interface ApiCall {
  method: string;
  host: string;
  path: string;
}

export interface ApiDiff {
  added: string[];
  removed: string[];
  unchanged: number;
}

export interface ShotSet {
  desktop?: string;
  mobile?: string;
}

export interface PageRunState {
  pageId: string;
  name: string;
  route: string;
  status: PageStatus;
  note?: string;
  report?: PageReport;
  costUsd: number;
  shots: { before: ShotSet; after: ShotSet };
  apiDiff?: ApiDiff;
  newConsoleErrors?: string[];
  /** True when the page needed Microsoft sign-in during screenshots. */
  signInNeeded?: boolean;
  changedFiles?: string[];
  commit?: string;
}

export interface ChangedFile {
  file: string;
  status: 'added' | 'modified' | 'deleted';
  protected: boolean;
  sensitive: boolean;
  reverted?: boolean;
}

export interface RunCost {
  usd: number;
  requests: number;
  unit: CostUnit;
}

export interface RunResult {
  pagesDone: number;
  pagesFlagged: number;
  pagesSkipped: number;
  build: 'passed' | 'failed' | 'not-run';
  tests: 'passed' | 'failed' | 'no-regressions' | 'regressions' | 'not-run';
  apiUnchanged: boolean | null;
  protectedReverts: number;
  sensitiveChanges: string[];
  costUsd: number;
  requests: number;
  durationMs: number;
  branch?: string;
  workspace?: string;
  reportPath?: string;
}

export interface ReviewResult {
  runId: string;
  createdAt: string;
  provider: ProviderId;
  costUsd: number;
  structured: boolean;
  summary: string;
  uiStack: string[];
  layout: string;
  sharedComponents: { name: string; files: string[]; why: string }[];
  risks: { title: string; files: string[]; detail: string }[];
  pages: { route: string; purpose: string; complexity: 'low' | 'medium' | 'high'; notes?: string }[];
  recommendations: string[];
}

export interface RunRecord {
  id: string;
  appId: string;
  appName: string;
  kind: RunKind;
  status: RunStatus;
  startedAt: string;
  finishedAt?: string;
  message?: string;
  settings?: RunSettings;
  branch?: string;
  baseBranch?: string;
  baseCommit?: string;
  workspace?: string;
  steps: StepState[];
  pages: PageRunState[];
  cost: RunCost;
  activity?: string;
  result?: RunResult;
  pullRequestUrl?: string;
  /** True after the user removed the run's workspace (the branch only existed there). */
  workspaceRemoved?: boolean;
  lastSeq: number;
}

export interface UiSettings {
  /** The brand new runs use unless another one is chosen. */
  defaultBrandId: string;
  lastSignInAt?: string;
}

/** Settings a user can change on the Settings screen (saved to data/config.local.json). */
export interface EditableConfig {
  budget: { perPageUsd: number; perRunUsd: number; reviewUsd: number; foundationUsd: number };
  claude: { models: Record<AgentTaskKind, string>; strongModel: string; effort: string };
  /** command: the Copilot CLI program (a name on PATH or a full path). */
  copilot: { command: string; model: string; maxAiCreditsPerTask: number };
  defaults: {
    polishRounds: 0 | 1 | 2;
    runTests: boolean;
    upgradeAngular: boolean;
    onApiChange: 'flag' | 'rollback';
    strongModelForComplexPages: boolean;
  };
  protectedPaths: string[];
  sensitivePaths: string[];
}

export type AgentTaskKind = 'review' | 'foundation' | 'page' | 'polish' | 'fix';

export interface StateResponse {
  version: string;
  apps: AppRecord[];
  runs: RunRecord[];
  brands: Brand[];
  settings: UiSettings;
  config: EditableConfig & { targetAngularMajor: number; port: number };
  activeRunId: string | null;
  /** True while the "Sign in once" window is open (runs cannot start then). */
  signInOpen: boolean;
  platform: 'windows' | 'macos' | 'linux';
}

export interface ApiError {
  error: string;
  /** What the user can do about it. */
  fix?: string;
}
