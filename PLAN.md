# Refit: build plan (for approval)

Status: **waiting for approval**. No code has been written yet. Checked on 2026-10-29 against
the current npm packages, the installed type definitions, and the official docs (section 17 of
the spec).

---

## 1. What I understand we are building

Refit is a single-user tool that runs on a developer's machine. It takes an internal Angular app and
moves its front end, page by page, onto PrimeNG with the Oerlikon brand. It never changes anything
behind the UI, and it proves that with builds, screenshots and API-call comparisons. The output is a
local branch plus a `report.md`. A human opens the pull request with one click.

How a run works:

1. **Scan.** Free, deterministic checks give a green, yellow or red readiness rating.
2. **Agent review.** An optional, cheap, read-only AI pass.
3. **Modernize.** Clone, then install, then a baseline (build, tests, before screenshots, API calls),
   then Angular upgrade hops, then the PrimeNG and brand foundation, then pages one at a time. Each
   page gets a checkpoint, an agent task, the guard, a build, a fix or rollback, after screenshots,
   an API comparison, design review rounds and a commit. Final checks and the report come last.
4. **Results.** A before/after comparison, per-page "What changed" lists, diffs, and a pull request.

Three locks keep the work to the front end. A pre-write hook stops protected writes (Claude only). A
guard after each task reverts protected files (all providers). The API-call comparison then catches
behavior changes. AI is used only for review, foundation, pages, polish and fixes, and every call has
a budget.

---

## 2. Findings that change the spec

### 2.1 PrimeNG 22 is no longer free for a company of Oerlikon's size (needs your decision)

I read the `LICENSE.md` files in the published npm packages:

| Package | Version | License |
|---|---|---|
| `primeng` | ≤ 21.1.x (latest 21.1.10) | **MIT** |
| `primeng` | 22.x (latest 22.1.4) | **PrimeUI license**: commercial per developer for any org with more than $1M revenue, 5 developers or 10 employees. A license key is required, and a missing key "may cause the software to display a license notice". |
| `@primeuix/themes` | 2.0.x | MIT |
| `@primeuix/themes` | 3.x (used by PrimeNG 22) | PrimeUI license |
| `primeicons` | 7.0.0 | MIT |
| `primeicons` / `@primeicons/angular` | 8.x | PrimeUI license |

PrimeNG 22 also requires Angular 22, and Angular 22 requires Node `^22.22.3 || ^24.15 || ^26`.

**Recommendation:** default to the **MIT stack**, both for target apps and for Refit's own UI:
Angular **21**, `primeng@21`, `@primeuix/themes@2`, `primeicons@7`. This matches the spec's
`targetAngularMajor: 21`. Angular 21 is in LTS until 2027-06. The Angular → PrimeNG mapping is a
config table, so PrimeNG 22 can be added later as an opt-in if Oerlikon buys a PrimeUI license. With
the key in `.env`, the change is a config edit.

### 2.2 Node version

- Node 20 has been end-of-life since 2026-04-30. Vitest 5 requires Node `^22.12 || >=24`.
  Angular 21 supports `^20.19 || ^22.12 || >=24`.
- **Recommendation:** Refit requires **Node 22.12+ or 24+**, and tests run on **22 and 24** (the
  spec says 20 and 22).
- Target apps run under the same Node as Refit by default. Old apps can set a per-app **Node folder**
  under Advanced (for example an nvm install), and Refit puts it first on `PATH` for that app's
  commands. The scan's Node-mismatch finding gives the exact `nvm use` command. On Windows that is the
  nvm-windows syntax.

### 2.3 Claude Agent SDK (checked against `@anthropic-ai/claude-agent-sdk@0.3.312` types)

Everything the spec names exists: `cwd`, `model`, `effort` (`low|medium|high|xhigh|max`),
`maxTurns`, `maxBudgetUsd` (gives an `error_max_budget_usd` result), `abortController`,
`persistSession`, `systemPrompt: { type: 'preset', preset: 'claude_code', append }`,
`permissionMode`, `allowedTools`, `disallowedTools`, `canUseTool`, and `hooks.PreToolUse` with
`hookSpecificOutput.permissionDecision: 'deny'` plus `permissionDecisionReason`. I would change
three things:

1. **`settingSources: []` instead of `['project']`.** `'project'` loads the *target repo's*
   `.claude/settings.json`. Its allow rules (for example `Bash(*)`) are applied before `canUseTool`,
   which would switch off our shell lock, and its hooks run shell commands. Refit supplies the
   playbook itself, so it does not need the repo's settings.
2. **Restrict tools with the `tools` option**, not only `disallowedTools`. A review task gets
   `['Read','Glob','Grep']`. A write task also gets `Edit`, `Write` and `Bash`, with Bash gated by
   `canUseTool`. `WebFetch`, `WebSearch` and subagent tools are always disallowed.
3. **Use `permissionMode: 'default'` for every task, not `'acceptEdits'`, and always set it.**
   - The permissions docs say `acceptEdits` auto-approves Edit and Write, and also the shell commands
     `rm`, `mv`, `cp`, `sed`, `mkdir`, `touch` and `rmdir` inside `cwd`, without calling
     `canUseTool`. That would let the agent delete or move files past our shell allowlist.
   - When the mode is omitted, the SDK now picks `'auto'`, where a model classifier approves calls.
   - In `'default'` mode, Refit's `canUseTool` decides every edit and every command.
   - The `PreToolUse` hook enforces the same rules again: protected or outside-workspace paths for
     Edit, Write and NotebookEdit, and build/lint/test only for Bash. Hooks always run first, and a
     deny always wins.

Auth works with an API key only. The provider shows "not available" unless `ANTHROPIC_API_KEY` or a
Bedrock, Vertex or Foundry variable is set. Model aliases stay `sonnet` (the current Sonnet), and the
"stronger model for high-complexity pages" option uses `opus`. Refit sets
`CLAUDE_AGENT_SDK_CLIENT_APP=refit/<version>`.

### 2.4 GitHub Copilot CLI (checked on `@github/copilot@1.0.105`, `copilot --help`, and the docs)

- These flags exist as the spec describes: `-p`, `--allow-all-tools` ("required for non-interactive
  mode"), `--deny-tool` (deny always beats allow, even allow-all), `--model`, and
  `--output-format json` (JSONL).
- **The JSONL event schema is not documented.** Refit will parse it defensively (known
  assistant-text and tool-call shapes) and fall back to plain text when it cannot.
- **Usage is now counted in "AI credits".** "Premium requests" appear only on legacy billing.
  `--usage-output-file` writes final usage as JSON, and `--max-ai-credits` (minimum 30) works as a
  per-task cap. Refit shows whichever unit is reported.
- **Extra safety flags I'll add:**
  - `--disable-builtin-mcps`: the built-in GitHub MCP server could otherwise push or open PRs.
  - `--no-ask-user`, `--no-auto-update`, `--no-custom-instructions` and `--disallow-temp-dir`.
  - `--excluded-tools web_fetch`.
  - Refit never sets `COPILOT_ALLOW_ALL=true`, because that exact value trusts the folder and runs
    the repo's hooks.
- **Deny list.** Deny rules are passed as one comma list, which is the documented form:
  - git: `shell(git:*)`
  - delete: `shell(rm:*)`, `shell(del:*)`, `shell(Remove-Item:*)`
  - installs: `shell(npm install:*)`, `shell(npm i:*)`, `shell(npm ci:*)`, `shell(yarn add:*)`,
    `shell(pnpm add:*)`
  - network: `shell(curl:*)`, `shell(wget:*)`, `shell(Invoke-WebRequest:*)`
  - plus `write` in read-only mode.
- **Screenshots go in with `--attachment`** (images), so Copilot really sees the before and after
  shots.
- **Sign-in status:** there is no documented non-interactive check. Settings shows "CLI found"
  (`copilot --version`) and "token or stored login detected", plus a **Test connection** button the
  user clicks, which costs about one request.

### 2.5 PrimeNG 21 theming (checked in `@primeuix/themes@2.0.3`)

- The generator imports `definePreset` from `@primeuix/themes` and `Aura` from
  `@primeuix/themes/aura`.
- Token names:
  - `primitive.borderRadius.{none,xs,sm,md,lg,xl}`
  - `semantic.primary.{50…950}`
  - `semantic.colorScheme.light.surface.{0…950}`, using `{slate.50}`-style references for the
    chosen surface family
  - `semantic.colorScheme.light.primary.{color,contrastColor,hoverColor,activeColor}`
- **There is no font token**, so the font goes only through `brand.css`.
- `provideAnimationsAsync` is no longer needed in v21 (native CSS animations).
- Registration uses `providePrimeNG({ theme: { preset: BrandPreset, options: { darkModeSelector:
  '.app-dark', cssLayer: … } } })`. Apps that use Tailwind or Bootstrap get a CSS layer order, so the
  old styles do not override PrimeNG while pages are being moved.
- The palette is generated in OKLCH so the steps look even, and 500 is exactly the brand color.
- The Brand studio checks WCAG contrast. If white text on the brand color is below 4.5:1, it switches
  `primary.contrastColor` to dark text and says so.

### 2.6 Other improvements I'd make

- **Local server security.** Refit can clone, run commands and push, so a random website must not be
  able to drive it. The server binds to `127.0.0.1` only, and Host and Origin checks block DNS
  rebinding and cross-site POSTs. `/files/*` is protected against path traversal.
- **Microsoft sign-in.**
  - The same full Chromium build runs headed and headless (Playwright `channel: 'chromium'`), so the
    saved profile can be read in both modes.
  - The user must choose **"Stay signed in? → Yes"**. Otherwise Entra's session cookie is gone once
    the window closes.
  - A **"I'm signed in"** button in Refit saves the session, including session cookies, before it
    closes the window. This makes later headless runs reliable.
- **Route extraction uses the TypeScript compiler API**, not regex. Routes defined in other files,
  `export default [...] satisfies Routes`, and both lazy syntaxes resolve properly.
- **Budgets.**
  - The per-page budget covers *everything* on that page: the page task, the fix and polish rounds.
  - The foundation task gets its own `budget.foundationUsd`.
  - Estimated maximum = `min(perRun, foundation + pages × perPage)`.
- **Windows.**
  - Clones get `core.longpaths=true`, run IDs are short, and `workspacesDir` can be set (for example
    `C:\refit-ws`) to stay clear of the 260-character path limit.
  - `cross-spawn` handles the `.cmd` shims that `npm` and `npx` use.
  - Atomic writes retry when antivirus briefly locks a file (`EPERM`).
  - Process trees are killed with `taskkill /T /F`.
- **Sources.**
  - A local folder with uncommitted changes gets a warning, because a clone only takes the last
    commit.
  - A folder that is not a git repo gets a blocking finding with the exact commands to fix it.
  - Git-URL apps are scanned from a cached clone in `data/sources/`.
  - `GIT_TERMINAL_PROMPT=0` means git never hangs waiting for a password.
- **Upgrades.** `ng update` runs with `CI=true` and `NG_CLI_ANALYTICS=false`, so prompts cannot hang a
  run. If a build fails with `ERR_OSSL_EVP_UNSUPPORTED`, Refit retries once with
  `NODE_OPTIONS=--openssl-legacy-provider`.
- **Live events.**
  - Events carry sequence IDs, and the browser reconnects with `Last-Event-ID` without losing or
    repeating lines.
  - API calls are compared as *sets* of `METHOD host /path`, so polling timing does not cause false
    flags. Counts are still shown.
- **Pull requests.**
  - A GitHub PR body over 65,536 characters is shortened with a note.
  - Azure DevOps cannot pre-fill a description from a URL, so Refit shows a **Copy description**
    button next to the link.

### 2.7 Built for Angular now, ready for other app types later

**Refit's own UI stays Angular.** The framework Refit is written in does not limit which apps it can
modernize. The UI only talks to the server over REST and SSE. Angular is the right choice here for
two reasons. Our developers know it, so they can maintain Refit. And the Brand studio has to render
real PrimeNG components with the brand, which needs Angular on the page.

**The engine is built so other stacks can be added.**

- **Already neutral:** the pipeline, providers, budgets, guard, git, browser capture, sign-in,
  API-call comparison, report, PR, events and UI.
- **Angular-specific** (moves behind a `StackAdapter` interface in `server/src/stacks/angular/`):
  - detection and scan facts
  - route-to-page extraction
  - install, build, serve and test commands, and the "compiled" message
  - upgrade hops
  - design-system install and theme files
  - default protected paths
  - readiness rules
  - the stack's playbook section

```ts
interface StackAdapter {
  id: string;                                   // 'angular' now; 'react', 'vue', ... later
  detect(repo): Promise<{ confidence: number } | null>;
  scan(repo): Promise<StackScan>;               // facts, pages, findings, commands
  upgradePlan?(scan, target): UpgradeHop[];
  designSystem: DesignSystemAdapter;            // install + generate theme files from the brand
  playbook: { rules: string; page: string; checklist: string };  // layered on playbook/common
  protectedPaths: string[]; sensitivePaths: string[];
}
```

- **The brand stays framework-neutral.** Colors, font and radius become CSS variables and design
  tokens. Each design-system adapter turns them into its own theme file. PrimeNG is the first.
- **A lint rule keeps the core from importing Angular code directly.** The boundary stays real
  instead of being a naming convention.
- **Adding a stack later means:** one adapter folder, its playbook files, its protected paths and a
  fixture app. No changes to the pipeline or the UI.
- **Licensing is the same story elsewhere.** PrimeReact 11 and PrimeVue 5 moved to the same
  commercial PrimeUI license. The last MIT versions are PrimeReact 10.9 and PrimeVue 4.5. The
  design-system choice for other stacks is a separate decision when we get there.

**Honest limit.** Full-stack frameworks (Next.js, Nuxt, SvelteKit, Blazor, ASP.NET Razor) mix UI and
server code in the same files. In those apps a file-level guard is weaker, and the browser cannot see
server-side data calls. Those stacks would start as **yellow** and need content-aware checks.
Single-page apps (Angular, React, Vue) fit Refit's model as well as Angular does.

I will **not** build React or Vue adapters now. We have no test apps for them yet, and the spec
targets Angular. Only the boundary is built now.

---

## 3. Architecture

```
refit/
  package.json            npm workspaces (shared, server, web); start, dev, test, setup:browser
  shared/                 pure TypeScript, used by server and web
    brand/                OKLCH palette, contrast, preset object, preset .ts source, brand.css
    events.ts, api.ts     SSE event and REST types (one source of truth)
    glob.ts               glob matcher (**, *, ?, **/ = zero or more folders)
  server/src/
    app.ts, main.ts       Fastify, host/origin guard, static web, /files, SSE
    config/               refit.config.json + data/config.local.json (zod-validated), .env
    store/                atomic state.json, events.jsonl per run, interrupted-run recovery
    proc/                 spawn with timeout, tree kill, output tail cap, secret redaction
    git/                  clone, branch, exclude, changed files, revert, commit, diff, push, remote URLs
    scan/                 stack-neutral scan: git state, lockfile, scripts, MSAL, size, picks the adapter
    stacks/               StackAdapter interface + registry
      angular/            versions, UI libs, routes (TS AST), components, readiness, commands,
                          upgrade hops, PrimeNG design-system adapter, protected paths
    browser/              profile lock, sign-in window, capture, API recorder and normalization
    providers/            AgentProvider interface, claude, copilot, dry run, availability
    guard/                protected and sensitive classification, post-task revert
    prompts/              playbook loader, task prompts, JSON report parser
    pipeline/             orchestrator, 8 steps, budget ledger, cancellation
    report/, pr/          report.md; push + gh / Azure DevOps URL / manual commands
  web/src/app/            Angular 21, standalone, signals, zoneless, PrimeNG 21
    core/                 API client, SSE store, theme + runtime brand
    shell/                top bar, app list with readiness and status chips
    features/             apps (add, overview, page list, advanced), review, run (simple and
                          developer), results (comparison stage, PR), history, brand studio, settings
    ui/                   status chip, empty state, elapsed timer, copy button, skeletons
  web/e2e/                Playwright tests of Refit itself
  playbook/common/        RULES, PAGE_PROCEDURE, UI_CHECKLIST: the stack-neutral parts of appendix A–C
  playbook/angular/       Angular- and PrimeNG-specific rules layered on top (the system prompt is
                          still identical across calls within a stack, so caching keeps working)
  brand/ fixtures/ data/ workspaces/   as in the spec
  .github/workflows/ci.yml  Ubuntu, Windows and macOS × Node 22 and 24: lint, typecheck, unit, integration
```

The `shared/` package is the only addition to the spec's layout. It lets Refit's own UI and the
generated target-app files use the same brand generator.

---

## 4. Phases

Each phase ends with all tests green, a short "how to try it" note, a `PROGRESS.md` update and one
commit.

1. **Foundation.**
   - Monorepo, config loading, atomic store and the shared brand generator. Refit's UI needs the
     generator from day one; the studio screen comes in phase 6.
   - Fastify skeleton, the Angular shell with PrimeNG and the brand, and light and dark mode.
   - Apps list, add-app dialog, the scanner (versions, libraries, routes, readiness, commands) and
     the Overview tab with the page-list editor and Advanced section.
   - Fixture apps 1 and 2 as source.
   - Unit tests: routes, readiness, glob, palette and preset, remote URLs.
   - CI workflow.
2. **Run engine.**
   - Process runner (timeouts, tree kill, redaction), git layer, pipeline orchestrator and the event
     log with SSE replay.
   - Dry run provider, guard and post-task revert.
   - Run view in Simple mode (Now card, stepper, page cards, cost meter) and Developer mode
     (virtualized log with filters, files, diffs).
   - Cancel, history, interrupted-run recovery.
   - Integration test: a full dry run on fixture 1, plus cancel mid-run.
3. **Browser.**
   - Playwright capture (desktop and mobile, JPEG), API-call and console recording with
     normalization, hash routing and parameter values.
   - Port checks, the sign-in window, the profile lock, and fixture 3 (mock SSO popup).
   - Comparison stage: slider with keyboard support and side-by-side mode on the blueprint grid.
4. **Claude Agent.**
   - Provider with streaming events, the `PreToolUse` guard hook, the `canUseTool` shell allowlist,
     and budget and turn caps.
   - Cost meter, the agent review task and the Agent review tab.
   - Tested with a scripted fake SDK stream. A real run needs your API key.
5. **GitHub Copilot.** Provider, defensive JSONL parsing with a text fallback, attachments, usage
   tracking, availability checks and a test-connection button.
6. **Upgrade and design system.**
   - Angular upgrade hops with an optional agent fix.
   - PrimeNG install from the version table, preset and CSS generation, and the foundation task.
   - Brand studio with the live preview of real components and the preset code view.
   - Slow test: fixture 2 upgraded from 17 to 21.
7. **Polish loop and delivery.** Design review rounds, final checks against the baseline,
   `report.md`, and Create pull request (GitHub `gh`, Azure DevOps URL, or manual commands).
8. **Finish.**
   - Polish pass on every screen and state, accessibility pass (axe checks in e2e) and reduced
     motion.
   - Windows-first README, `.env.example`, and a final full test run.

### What I can and cannot verify from this cloud container

- **Can:** Linux, Node 22, real Angular installs and builds of the fixtures, Playwright Chromium,
  dry runs, and screenshots of Refit's own UI.
- **Cannot:**
  - Windows or macOS. CI runs those, and path handling also gets unit tests with `path.win32`.
  - Real Claude or Copilot calls: there is no API key or Copilot login here.
  - Real Microsoft sign-in.

  These remain your manual acceptance checks from section 14 of the spec.
