# Refit progress

Living status of the build. The plan and its reasoning are in [PLAN.md](PLAN.md).

## Status

| Phase | State |
|---|---|
| 1. Foundation | Done |
| 2. Run engine | Done |
| 3. Browser | Done |
| 4. Claude Agent | Next |
| 5. GitHub Copilot | Not started |
| 6. Upgrade and design system | Not started |
| 7. Polish loop and delivery | Not started |
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

## Notes for later phases

- npm 11.21 warns that install scripts need approval (`npm install-scripts approve`). Watch for target
  apps on Node 24 whose dependencies rely on install scripts.
- The Copilot CLI JSONL event schema for `-p --output-format json` is not documented; phase 5 parses
  it defensively.
