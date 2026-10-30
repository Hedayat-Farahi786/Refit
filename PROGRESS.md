# Refit progress

Living status of the build. The plan and its reasoning are in [PLAN.md](PLAN.md).

## Status

| Phase | State |
|---|---|
| 1. Foundation | Done |
| 2. Run engine | Next |
| 3. Browser | Not started |
| 4. Claude Agent | Not started |
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
7. **Apps inside bigger repos** (for example `ClientApp/` in a .NET solution) are supported. From
   phase 2, any change outside the app folder will be treated as protected.
8. **Angular 20+ file names.** The new style guide drops suffixes like `.component.ts` and
   `.service.ts`. Component counting reads file contents (`@Component(`), not file names. Phase 2's
   guard will add a content rule: non-component TypeScript files that use `HttpClient` count as
   protected even without a `.service.ts` name.
9. **PrimeNG 21 assumes a 14px root font size.** The generated `brand.css` sets it; PrimeNG 22 moves
   to 16px.
10. **`brand.css` in Refit itself** is wrapped in the lowest cascade layer, so Refit's dark mode can
    override the brand's light-mode base colors. Target apps get it unlayered.
11. **`REFIT_PORT`, `REFIT_DATA_DIR` and `REFIT_WORKSPACES_DIR`** environment variables exist for tests
    and for running a second Refit.
12. **The playbook stays as written in the spec** (Angular + PrimeNG). A second stack would add its
    own playbook folder.

## Notes for later phases

- npm 11.21 warns that install scripts need approval (`npm install-scripts approve`). Watch for target
  apps on Node 24 whose dependencies rely on install scripts.
- The Copilot CLI JSONL event schema for `-p --output-format json` is not documented; phase 5 parses
  it defensively.
