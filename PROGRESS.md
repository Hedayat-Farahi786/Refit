# Refit progress

Living status of the build. The plan and its reasoning are in [PLAN.md](PLAN.md).

## Status

| Phase | State |
|---|---|
| 1. Foundation | Done |
| 2. Run engine | Done |
| 3. Browser | Done |
| 4. Claude Agent | Done |
| 5. GitHub Copilot | Paused (Angular first, as asked); groundwork and research done |
| Design and brands (asked for during phase 5) | Done |
| 6. Upgrade and design system | Done |
| 7. Polish loop and delivery | Next |
| 8. Finish | Not started |

## Phase 1: Foundation (done)

What works:

- **Monorepo.** npm workspaces `shared/`, `server/`, `web/`, plus `fixtures/`, `playbook/`, `brand/`
  and `refit.config.json`. `npm install` installs everything and builds `shared`.
- **Shared code** (`@refit/shared`):
  - the glob matcher with gitignore-style rules
  - the OKLCH brand palette, WCAG contrast check, PrimeNG preset tokens, the `brand-preset.ts` source
    and the `brand.css` generator
  - the REST and SSE types used by both server and UI
- **Server** (Fastify, `127.0.0.1` only):
  - a guard that rejects requests to non-localhost Host names (DNS rebinding) and cross-site
    state changes
  - config loading with zod validation and `data/config.local.json` overrides
  - an atomic `state.json` store that keeps a corrupt file instead of losing it
  - a process runner with timeouts, process-tree kill (taskkill on Windows), ANSI stripping and
    secret redaction
  - git helpers and remote-URL parsing (GitHub, Azure DevOps, GitLab)
- **Scanner.** Snapshots the last commit into `data/sources/<appId>`, so the user's folder is never
  touched. The Angular adapter reports:
  - version (from the lockfile first), bootstrap style, hash routing
  - UI libraries, MSAL and other sign-in libraries
  - commands for npm, yarn classic, yarn berry and pnpm
  - Node compatibility with the exact `nvm install` advice
  - pages, found with the TypeScript parser: provideRouter/forRoot/forChild, imported route arrays,
    children, `loadComponent`/`loadChildren` (arrow and `'x#Module'` syntax), path aliases, barrels,
    `export default [...] satisfies Routes`
  - readiness findings, each with a plain explanation and a fix
  - apps inside a bigger repo (for example `ClientApp/`)
- **Web UI** (Angular 21, zoneless, signals, PrimeNG 21 with the brand preset applied at runtime):
  - apps sidebar, add-app dialog with live folder checks, app header with rescan and remove
  - Overview: readiness, findings, facts, commands, an editable page list with sample values and
    hand-added pages, and an Advanced section for command, port, env and Node-folder overrides
  - Settings: theme, brand, budgets, run defaults, models, and protected/sensitive paths with a
    live path tester
  - light and dark mode, skip link, and an offline banner
- **Tests:**
  - 167 unit tests (Vitest): glob, brand, routes, versions and lockfiles, commands, readiness,
    remote URLs, config, store, redaction, process runner, a full scan of both fixtures, and the
    HTTP API including the security guard
  - 5 end-to-end tests (Playwright) of the UI
- **CI:** GitHub Actions on Ubuntu, Windows and macOS × Node 22 and 24.

How to try it:

```bash
npm install
npm start                       # builds what changed, then http://localhost:4700
# Add app -> paste the full path of an Angular app folder (a git repo).
npm test                        # unit tests
npm run test:e2e                # UI end-to-end tests (starts its own Refit on port 4711)
npm run dev                     # live reload: http://localhost:4701
```

## Phase 2: Run engine (done)

What works:

- **Pipeline** (`server/src/pipeline/`):
  - The eight steps, each with live step events, elapsed time and a plain-language "Now"
    sentence.
  - Prepare: a clone of the last commit, with `origin` pointed at the source repo's own remote (never
    at the developer's folder), branch `refit/modernize-<yyyymmdd>-<id>`, `.refit/` excluded from
    git, and a git identity set when the developer has none.
  - Install: retries once with `--legacy-peer-deps`, and restores lockfiles the install rewrote.
  - Baseline: build, plus tests when turned on. If the app does not build, Refit stops with an
    explanation. `ERR_OSSL_EVP_UNSUPPORTED` triggers one retry with `--openssl-legacy-provider`.
  - Pages, one at a time: checkpoint, agent task, guard, build. A broken build gets one fix task;
    if it still fails, Refit rolls back to the checkpoint and flags the page. Each page gets its own
    commit and report. Refit stops starting pages when the run budget is reached.
  - Final checks: build, and tests compared with the baseline (only new failures count).
  - Ready: `report.md` in `data/runs/<id>/`. Nothing is ever pushed.
  - Upgrade and design-system steps exist and are skipped until phase 6.
- **Guard** (lock 2, every provider):
  - Lists every change since the checkpoint (committed, staged, unstaged, untracked) and reverts
    protected files: edited files are restored, new files deleted, deleted files restored.
  - A change outside the app folder is protected.
  - A non-component file that calls the backend (`HttpClient`, `fetch`, `axios`) is protected
    whatever its name.
  - New ignored `.env*` files are removed.
  - Sensitive changes are recorded for the report.
- **Dry run provider:** realistic events; marks each page's template. Test hooks can touch a
  protected file or break a page's build.
- **Event log:**
  - One JSONL file per run.
  - SSE replays everything, then streams; reconnects resume from `Last-Event-ID`.
  - A shared reducer (`applyRunEvent`) keeps the server's `state.json` summary and the UI identical
    and is safe to replay.
- **Runs:**
  - One active run at a time. Start checks readiness, sample values and the provider.
  - Cancel kills every process tree and keeps the branch and workspace.
  - After a server restart, a run that was in progress shows "Interrupted" with its workspace path.
  - Remove workspace (keeps history) and Delete run are both available.
- **UI:**
  - Modernize tab: provider cards with the reason when one is unavailable; brand with a draft
    warning; target Angular; review rounds; API-change policy; tests; budgets; the estimated
    maximum cost before Start; and the reason when Start is disabled.
  - Live run view, Simple mode: the Now card, a stepper with elapsed times, page cards with
    thumbnail slots and "What changed", and a cost meter.
  - Live run view, Developer mode: a virtualized terminal log with filters (All, Agent, Commands,
    Guard, Warnings), search, follow-mode and copy; changed files with a diff viewer that has line
    numbers.
  - Run outcome: result tiles, branch and workspace with copy buttons, the report, and clean-up.
  - History tab.
- **Tests:**
  - 199 unit tests: guard, report parser, budget, commands, reducer and event log, on top of
    phase 1.
  - 3 integration tests: a full dry run on fixture 1 with guard reverts and a rolled-back page,
    cancel mid-run, and the one-run-at-a-time rule.
  - 6 end-to-end tests: one starts a dry run and follows it in both views.

How to try it: `npm start`, add an app, fill in sample values, open **Modernize**, choose **Dry run**
and **Start modernizing**. Switch between **Simple** and **Developer** while it runs.

## Phase 3: Browser (done)

What works:

- **Dev server** (`browser/devserver.ts`):
  - checks the port first; if it is taken, the error says how to find and stop the program
    (netstat/taskkill on Windows, lsof/kill elsewhere)
  - waits for webpack's or esbuild's "compiled" message
  - counts rebuilds, so after screenshots wait for the new code
  - kills the whole process tree when it stops
- **Capture** (`browser/capture.ts`):
  - waits for network idle (capped), for MSAL-style popups to close, then idle again
  - turns off animations and the caret, then takes a full-page JPEG at quality 72 (capped at 9,000
    px tall)
  - desktop 1440×900 and mobile 390×844
  - the desktop pass records XHR/fetch calls and console errors
- **API comparison** (`browser/api-calls.ts`):
  - each call becomes `METHOD host/path`, with numeric IDs, GUIDs and long hex IDs turned into
    `:id` and query strings ignored
  - static files, `/assets`, dev-server traffic, Microsoft sign-in hosts and common telemetry
    (Application Insights, Google Analytics, Clarity, Sentry, Datadog) are skipped
  - recordings are compared as sets, so polling differences don't count
  - console errors are compared after removing URLs and line numbers
- **Sign-in** (`browser/session.ts`):
  - one persistent Chromium profile (`data/browser-profile`) with a lock: the sign-in window and
    runs never use it at the same time, and each says why when blocked
  - "Sign in once" opens a visible window and saves the cookies every 3 seconds, so closing the
    window also keeps the session
  - "I'm signed in" saves the session and closes the window
  - headless runs restore the saved cookies, including session-only ones like Entra's `ESTSAUTH`
  - if a page lands on a Microsoft sign-in host, it is marked "sign-in needed"; if that happens on
    every page, the run stops and explains exactly what to do
- **Pipeline:**
  - Baseline takes the before screenshots and API recordings with its own dev server.
  - Pages keeps one dev server running for all pages. Before each page, the before screenshots
    are copied into `.refit/shots/` for the agent (and passed as images). After the build passes,
    Refit waits for the rebuild, takes after screenshots and compares API calls. A change is
    flagged, or rolled back if that is the run setting.
  - Final checks re-capture every page on the final code, because a later page can change shared
    code, and compare each page with its before recording.
  - The report includes the API comparison. Base href and hash routing are respected.
- **UI:**
  - a "Before and after" stage on the blueprint grid: page selector, desktop/mobile toggle, and a
    slider mode whose divider is a real slider (arrow keys, Shift for bigger steps, Page Up/Down,
    Home/End, pointer drag)
  - side-by-side mode
  - page-card thumbnails open the comparison
  - a Microsoft sign-in section in Settings with status, "Sign in once", "I'm signed in" and tips
- **Fixture 3** (`ng-mock-sso`): an Angular app that signs in through a popup on another local
  origin, like MSAL.
- **Tests:**
  - 224 unit tests
  - integration:
    - the full dry run now with screenshots and "API calls unchanged"
    - browser tests against real Chromium (recording, a stuck sign-in popup, and "Sign in once"
      reused headless with persistent and with session-only cookies)
    - the fixture 3 run without and with a saved session
  - end-to-end: the comparison slider operated with the keyboard

How to try it: start Refit, run a Dry run on an app, and open **Before and after** in the Simple
view. For apps with Microsoft sign-in, use **Settings → Microsoft sign-in → Sign in once** first.

## Phase 4: Claude Agent (done)

What works:

- **Claude Agent provider** (`providers/claude.ts`), on the Anthropic Claude Agent SDK:
  - streams the agent's thoughts and tool actions into the run log, and reads cost and the final
    text from the result
  - budget (`maxBudgetUsd`) and turn (`maxTurns`) caps per task; hitting one is reported as a limit,
    not a crash, and the last text is kept
  - model per task kind from Settings, the stronger model for pages the review rated "high", and
    the effort level
  - cancel aborts the SDK query
  - errors in plain words: rejected key, no credit, rate limit, network or proxy
- **Safety** (`providers/tool-policy.ts`):
  - only the task's tools exist: Read, Glob and Grep for reviews, plus Edit, Write and Bash for
    page work; web, subagents, notebooks and skills are disallowed
  - every call, reads included, goes through a PreToolUse hook and `canUseTool`, both backed by
    the same policy:
    - reads stay inside the app folder
    - writes may not touch protected globs, files outside the app folder, or code that calls the
      backend
    - Bash runs only the app's build, lint and test commands, one at a time, with no `;`, `&`,
      `|`, `>` or `$( )`
  - every block is logged as a guard line, with a reason the model can act on
  - nothing from disk is loaded (`settingSources: []`), so a target repo's `.claude/settings.json`,
    hooks or CLAUDE.md cannot widen permissions
  - the agent's config folder is `data/claude-config`, never `~/.claude`, and
    `CLAUDE_CODE_OAUTH_TOKEN` is removed from its environment: Refit never uses a claude.ai login
- **Credentials:** `ANTHROPIC_API_KEY`, Amazon Bedrock, Google Vertex AI, Microsoft Foundry, or a
  company gateway (`ANTHROPIC_BASE_URL` plus `ANTHROPIC_AUTH_TOKEN`), all from `.env`.
- **Agent review** (`pipeline/review.ts`):
  - a read-only run of kind `review` on the scan snapshot, with its own budget and turn limit
  - it starts from the app shell, global styles and a sample of page templates
  - it returns a summary, UI stack, layout, shared components to modernize first, risks, pages with
    complexity and recommendations
  - the result is stored on the app; its page ratings choose the stronger model in later runs
  - `POST /api/apps/:id/review`; it streams over the same SSE events as a modernize run and can be
    cancelled
- **UI:**
  - an **Agent review** tab: reviewer choice (only providers that are ready, with a link to set
    up the rest), the maximum cost, a live feed of what the agent reads, and result cards
  - an **AI providers** panel in Settings: each provider's checks, cost unit and setup steps, with
    "Check again"
  - a top-bar indicator of the ready AI providers
- **Fixes:**
  - The UI now refreshes when its change stream (re)connects. A scan that finished between the
    first state load and the connection used to stay "Scanning" until the next change.
  - The SelectButton labels now reach screen readers. `ariaLabel` is not an input of PrimeNG's
    SelectButton.
- **Tests:**
  - 235 unit tests: the tool policy, and the provider against scripted SDK message streams
    (hook and `canUseTool` denials, limits, errors, credentials)
  - integration: a dry-run review through the HTTP API
  - end-to-end: the providers panel and a dry-run review with its result cards
  - No test calls a real AI API. The e2e server blanks every AI credential, so a developer's
    `.env` cannot leak into the tests.

How to try it: put `ANTHROPIC_API_KEY=...` in `.env`, restart Refit, and check **Settings → AI
providers**. Then open an app's **Agent review** tab and start a review (at most
`budget.reviewUsd`, $0.60 by default). Then run **Modernize** with Claude Agent.

## Design and brands (done, asked for during phase 5)

What changed:

- **Refit's own look.** Refit no longer wears a brand. It has a fixed, calm design:
  - warm neutral surfaces, ink-black actions, and one quiet blue for focus and live states
  - Inter for the interface and Source Serif 4 for page titles; both are bundled, so nothing loads
    from the internet
  - a sidebar with Add app, Apps / Brands / Settings, your apps with status dots, the AI status
    and the theme toggle; a drawer on phones
  - an Apps dashboard of cards, and the same page header on every screen
  - The old "Brand for Refit itself" setting is now "the default brand for new runs" (and is
    migrated).
- **Complete brands.** A brand now has primary and neutral colors, status colors (success, info,
  warning, danger), a body and heading font, corner radius and density. Refit generates three
  files for an app:
  - `brand-preset.ts`: the PrimeNG preset. It covers the primary scale and surfaces, the palettes
    behind every severity, the focus ring, form fields, density, table cells, cards and tags.
  - `brand.css`: variables, base type, and layout classes agents build pages from (page, header,
    toolbar, card, form grid, field, stats, empty state).
  - `BRAND.md`: the usage guide for agents and reviewers. It says which color is for what, gives a
    page skeleton, maps each need to a PrimeNG component, and covers states and accessibility.
- **Oerlikon brand.** Red #eb0000 on white and light grey (the neutral family), with 4px corners
  and a deeper crimson for danger. Every status color reaches 4.5:1 on white. Because the brand is
  red, inputs get a dark focus border and danger actions are outlined with an icon, so errors
  never look like brand actions. An untouched old blue draft is replaced on start-up.
- **Brand studio** (Brands in the sidebar):
  - cards with swatches; New, Import (.brand.json), Duplicate, Use for new runs, Export, Delete
  - an editor with a validated form (identity, color with a contrast check, neutrals, status
    colors, type, corners, density) and a dirty-state save bar
  - **Preview:** real PrimeNG components in an isolated iframe, desktop or phone width
  - **Palette:** every shade with its contrast
  - **Code:** the three files for PrimeNG 18–21, to copy or download
- **Fixes:** every PrimeNG Select now gets its name from its visible label. `<label for>` cannot
  name the span PrimeNG renders.
- **Tests:** 250 unit tests (status palettes, the red-brand rule, density, CSS layout classes,
  the guide, migration, brand API) and 11 end-to-end tests. The brand tests cover the live preview
  restyling as you type, the code view per PrimeNG version, and duplicate, save, export and delete.

How to try it: open **Brands**, then **Oerlikon**. Change the color or the corners and watch the
preview. Check **Palette** and **Code**, then **Export**.

## Phase 6: Upgrade and design system (done)

What works:

- **Scan:** Refit now also finds the three places the design system touches:
  - the app's own global stylesheet (not a package's)
  - where app-wide providers go (`app.config.ts`, or the `AppModule` for NgModule apps), found by
    following `main.ts`
  - the app-shell files: the root component plus header, navigation, sidebar, footer and layout
    parts
- **Upgrade Angular** (when the target is newer):
  - one major at a time with the spec's command:
    `npx --yes @angular/cli@<n> update @angular/core@<n> @angular/cli@<n>`, plus Material and the
    CDK when present, with `--allow-dirty --force`
  - each hop is committed (`refit: upgrade Angular to <n>`) and built
  - a broken build gets one agent fix (protected files stay protected) and its own commit
  - if the build still fails, the run stops with a clear message and keeps the branch
  - hops whose Angular does not officially support the current Node are warned about
- **Install the design system:**
  - installs the MIT PrimeNG release for the app's Angular major (18–21) with its theme package
    and primeicons, plus `@angular/animations` for PrimeNG 18–20; npm retries with
    `--legacy-peer-deps`
  - writes `src/app/theme/brand-preset.ts`, `brand.css` and `BRAND.md` from the run's brand, and
    commits them
  - Angular 22+ (commercial PrimeNG only) and Angular 17 (no presets) stop with what to do instead
  - **Foundation task:** register PrimeNG with the BrandPreset (dark mode only via `.app-dark`),
    load primeicons and brand.css from the global stylesheet, modernize the app shell, and add
    one global toast and confirm dialog. Guard, build, one fix if needed, then a commit; if it
    cannot be fixed, it is rolled back and the run stops.
  - the generated theme files are protected for every agent task
- **Pages** are told the installed PrimeNG version and to read BRAND.md first.
- **Report:** the summary has the Angular and design-system rows plus a short Design system
  section.
- **Workspaces** never commit `node_modules/`, `dist/` or `.angular/`, even in repos whose
  `.gitignore` misses them.
- **Architecture:**
  - Upgrades and the design system are optional stack-adapter capabilities (`upgrades`,
    `designSystem`, `frameworkPackage`).
  - The engine reaches them only through the adapter registry, so the boundary lint rule holds.
  - The MIT PrimeNG release table lives in the shared package, so Refit's UI (the Modernize hint)
    and the server agree.
- **Dry run:** in standalone apps it really registers `providePrimeNG` with the generated
  BrandPreset and loads the brand styles. Every dry-run build therefore proves the generated
  preset compiles against the installed PrimeNG.
- **Tests:**
  - 252 unit tests, including the shell-file detection and the adapter tables
  - integration: the dry run installs PrimeNG 21.1.10, writes and protects the theme files,
    registers PrimeNG, and commits in order
  - **slow** (`npm run test:slow`): fixture 2 goes from Angular 17 to 21 in four `ng update`
    hops, each built and committed, then PrimeNG 21.1.10 with Oerlikon, the page, and a passing
    final build (about 5.5 minutes, needs network)

How to try it: add an Angular 17–20 app and choose **Modernize**. Under **Angular version** pick
**Upgrade to Angular 21**, choose **Oerlikon**, and start a dry run. The run view shows each hop,
then PrimeNG and the brand. The branch has one commit per step.

## Decisions and differences from the spec

1. **PrimeNG 21 and Angular 21, not the newest versions.** PrimeNG 22, `@primeuix/themes` 3 and
   `primeicons` 8 moved to a commercial PrimeUI license, which Oerlikon's size requires paying for.
   PrimeNG 21.1.x, `@primeuix/themes` 2.0.x and `primeicons` 7 are MIT. The target Angular major stays
   21 (the spec's default). Apps already on Angular 22+ get a red "needs a commercial PrimeNG license"
   finding.
2. **Node 22.12+ or 24+**, not 20. Node 20 has been end-of-life since 2026-04-30. CI tests 22 and 24.
3. **Vitest 4.1**, not 5. Angular 21's build tools declare `vitest ^4` as a peer.
4. **`.npmrc` with `legacy-peer-deps=true`.** npm 10 (the npm that ships with Node 22) crashes with
   "Cannot read properties of null (reading 'edgesOut')" while resolving Vitest's optional peers,
   which `@angular/build@21` pulls in. npm 11 is fine. Every needed peer is listed explicitly instead.
   The fixtures' lockfiles were generated with npm 11, so npm 10's `npm ci` installs them cleanly.
   Target apps without a lockfile hit the same npm 10 bug on `npm install`; the automatic
   `--legacy-peer-deps` retry covers it.
5. **Scan snapshots.** Scans and agent reviews read a fresh clone of the last commit in
   `data/sources/<appId>`, not the user's folder. A local folder with uncommitted changes gets a
   warning, because a run only sees committed work.
6. **Glob rule:** a pattern without a slash (`package.json`, `.env*`) matches the file name at any
   depth, like `.gitignore`. A leading `/` anchors it to the repo root. Matching ignores case
   (Windows and macOS file systems do).
7. **Apps inside bigger repos** (for example `ClientApp/` in a .NET solution) are supported, and any
   change outside the app folder is treated as protected.
8. **Angular 20+ file names.** The new style guide drops suffixes like `.component.ts` and
   `.service.ts`. Component counting reads file contents (`@Component(`), and the guard protects any
   non-component file that calls the backend, whatever its name.
9. **PrimeNG 21 assumes a 14px root font size.** The generated `brand.css` sets it; PrimeNG 22 moves
   to 16px.
10. **`brand.css` in Refit itself** is wrapped in the lowest cascade layer, so Refit's dark mode can
    override the brand's light-mode base colors. Target apps get it unlayered.
11. **`REFIT_PORT`, `REFIT_DATA_DIR` and `REFIT_WORKSPACES_DIR`** environment variables exist for tests
    and for running a second Refit.
12. **The playbook stays as written in the spec** (Angular + PrimeNG). A second stack would add its
    own playbook folder.
13. **Per-page budget covers the whole page:** the page task and its fix task share it, and so will
    design reviews from phase 7. The foundation task has its own `budget.foundationUsd`.
14. **Extra endpoints:**
    - `GET /api/runs/:id/changes`, `GET /api/runs/:id/report`, `DELETE /api/runs/:id/workspace`,
      `DELETE /api/runs/:id`, and `GET /api/inspect-folder`.
    - The global `GET /api/events` stream tells the UI when to refresh.
    - A `meta` run event carries the branch and workspace.
15. **Final build failure** marks the Final checks step failed, but the run still ends as "Ready for
    review" with the failure shown prominently, because the branch is still useful to a developer.
16. **Sign-in cookies are saved to `data/browser-session.json`** (file mode 600). Chromium does not
    keep session cookies in a profile once the window closes, and without them a later headless run
    would land on the sign-in page.
17. **Browser endpoints:** `GET /api/browser`, `POST /api/browser/sign-in` and
    `POST /api/browser/sign-in/done`. `browser.channel` in the config can be `chromium` (default),
    `msedge` or `chrome`.
18. **Final checks re-capture every page.** The spec only asks for after screenshots per page; a
    change on a later page can affect earlier ones through shared code.
19. **Claude Agent runs in `permissionMode: 'default'` with no `allowedTools`.** `acceptEdits` would
    auto-approve file-system commands like `rm` and `mv`, and `allowedTools` would skip
    `canUseTool`. With neither, each call passes Refit's policy twice (the hook, then
    `canUseTool`).
20. **Screenshots reach Claude as file paths.** The page prompt lists the before screenshots in
    `.refit/shots/` and the agent opens them with Read, which shows images. The SDK's
    string prompt has no attachments.
21. **Company LLM gateways count as credentials** (`ANTHROPIC_BASE_URL` with `ANTHROPIC_AUTH_TOKEN`).
    Like an API key, this is not a claude.ai login.
22. **An agent review is a run of kind `review`.** It gets the same history, live events and cancel as
    a modernize run, and can run while a modernize run is active, because it only reads the scan
    snapshot.
23. **Refit has its own fixed look** (requested). The spec had Refit render itself with the
    selected brand. Brands now apply only to the apps Refit modernizes.
24. **Brands are richer than the spec's.** The spec covered primary, neutrals, font and radius. A
    brand now also has status colors, a heading font and density, and comes with BRAND.md and
    layout classes, so agents have every building block a page needs.
25. **The brand preview runs in an iframe of Refit itself** (`/preview/brand`, without the shell).
    PrimeNG themes are global per document, so a frame is the only way to show a brand next to
    Refit's own theme. The editor sends unsaved changes with `postMessage` on the same origin.
26. **Export and import happen in the browser.** The web app already shares the generator, so the
    server only stores brands (`POST`, `PUT` and `DELETE /api/brands`).
27. **Upgrade hops commit before the build.** A hop's `ng update` is committed first, then the
    build runs. A fix is a separate commit, so a developer can see what Angular changed and what
    the agent changed.
28. **The foundation task is the only one that may touch the providers file and the global
    stylesheet**, and only to add PrimeNG. The generated theme files are protected for every agent
    task; change the brand in Refit and run again instead.

## Notes for later phases

- npm 11.21 warns that install scripts need approval (`npm install-scripts approve`). Watch for target
  apps on Node 24 whose dependencies rely on install scripts.
- The Copilot CLI JSONL event schema for `-p --output-format json` is not documented; phase 5 parses
  it defensively.
- Phase 6 version table, checked on npm on 2026-10-30. Use community (MIT) releases only. Versions
  with an `-lts` suffix carry PrimeTek's commercial LTS license.
  - Angular 18: `primeng@18.0.2` with `@primeng/themes@18.0.2`
  - Angular 19: `primeng@19.1.4` with `@primeng/themes@19.1.4`
  - Angular 20: `primeng@20.4.0` with `@primeuix/themes@1.2.5`
  - Angular 21: `primeng@21.1.10` with `@primeuix/themes@2.0.3`
  - Every row uses `primeicons@7.0.0`. PrimeNG 18–20 also need `@angular/animations`
    (`provideAnimationsAsync`); PrimeNG 21 does not.
  - PrimeNG 17 has no presets, so the design-system step needs Angular 18 or later.
