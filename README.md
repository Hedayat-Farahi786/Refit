# Refit

Refit modernizes the front end of internal Angular apps with an AI agent, page by page, onto
PrimeNG with the Oerlikon brand. It proves that nothing behind the UI changed with builds,
screenshots and API-call comparisons, and it delivers everything as a branch and pull request that a
person reviews.

> Refit is being built in phases. See [PROGRESS.md](PROGRESS.md) for what works today and
> [PLAN.md](PLAN.md) for the plan. The full setup and troubleshooting guide arrives in phase 8.

## Quick start

Requirements: **Node 22.12+ or 24** and **Git**. Windows, macOS and Linux all work.

```bash
npm install
npm start
```

Open http://localhost:4700, choose **Add app** and paste the full path of an Angular app folder (it
must be a git repository). Refit scans it for free and shows whether it is ready, which pages it
found, and anything to fix first. Refit never changes the folder: it works on its own copy.

## Development

```bash
npm run dev          # server + web UI with live reload at http://localhost:4701
npm test             # unit tests
npm run test:e2e     # end-to-end tests of Refit's UI (Playwright)
npm run lint
npm run typecheck
```

Run `npm run setup:browser` once if Playwright asks for its Chromium.
