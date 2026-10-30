# Refit

Refit modernizes the front end of internal Angular apps, page by page, onto PrimeNG with your
company brand. An AI agent does the restyling; Refit proves that nothing behind the UI changed
(builds, before/after screenshots, API-call comparisons) and delivers everything as a branch and a
pull request that a person reviews.

- **Front end only.** Services, API calls, routing, auth and configuration are protected: any change
  to them is reverted automatically.
- **Human in the loop.** Refit works on its own copy of the app, commits on a new branch, and never
  pushes or merges unless you click **Create pull request**.
- **Free to try.** Scans and the **Dry run** use no AI at all.

---

## 1. Set up (Windows first)

You need:

| What | Version | How to check |
|---|---|---|
| Node.js | 22.12 or newer, or 24 | `node --version` |
| Git | any recent version | `git --version` |
| An AI provider (for real runs) | Anthropic API key, or Amazon Bedrock / Google Vertex AI / Microsoft Foundry | see step 3 |

**Windows:** install Node.js LTS from https://nodejs.org (the installer adds it to PATH) and Git from
https://git-scm.com (keep "Git Credential Manager" selected). Open **PowerShell** or **Windows
Terminal** for the commands below.

**macOS:** `brew install node@22 git`, or use the installers from the same sites.

### 1.1 Install

```powershell
cd C:\Tools            # or wherever you keep tools
git clone <Refit repository URL> Refit
cd Refit
npm install
npm run setup:browser  # downloads the Chromium Refit uses for screenshots (once)
```

If your company uses a proxy, set `HTTPS_PROXY` (and `NODE_EXTRA_CA_CERTS` for a company root
certificate) before `npm install`.

### 1.2 Start

```powershell
npm start
```

Open **http://localhost:4700**. Refit only listens on your own computer. Stop it with **Ctrl+C**.
Another port: `$env:REFIT_PORT=4800; npm start` (PowerShell) or `REFIT_PORT=4800 npm start` (macOS
and Linux), or change `port` in `refit.config.json`.

### 1.3 Connect an AI provider

Copy `.env.example` to `.env` in the Refit folder and fill in **one** option:

```ini
# Anthropic API key (console.anthropic.com > API keys)
ANTHROPIC_API_KEY=sk-ant-...
```

Or your company cloud: set `CLAUDE_CODE_USE_BEDROCK=1` (with your AWS settings),
`CLAUDE_CODE_USE_VERTEX=1` or `CLAUDE_CODE_USE_FOUNDRY=1`. A company LLM gateway works with
`ANTHROPIC_BASE_URL` plus `ANTHROPIC_AUTH_TOKEN`.

Restart Refit, open **Settings > AI providers** and choose **Test connection**. The test sends one
tiny request (about $0.001).

Refit never uses a personal claude.ai login. Keys live only in `.env`, which is never committed and
never written to logs.

> **GitHub Copilot** support is planned. Its research notes are in `docs/research/`.

---

## 2. Microsoft sign-in apps

Apps that sign in with Microsoft Entra ID (MSAL) need a signed-in browser for screenshots:

1. Ask IT for a **test account**. Do not use your personal account.
2. The app's dev-server address (usually `http://localhost:4200`) must be a **redirect URI** of the
   app registration in Entra ID. Ask the app's owner to add it if sign-in fails with a redirect
   error.
3. In Refit, open **Settings > Microsoft sign-in > Sign in once**. A browser window opens: sign in
   (including MFA) and answer **Yes** to "Stay signed in?". Then choose **I'm signed in**.

Runs reuse that session headlessly. If a run says sign-in is needed, sign in once again.

---

## 3. Your first app

1. **Add app** (sidebar): paste the full path of the Angular app folder (a git repository), or its
   git URL. Refit scans its own copy; your folder is never changed.
2. **Overview:** check the readiness and the page list. Pages with route parameters (like
   `/orders/:id`) need a sample value, for example an ID that exists in your test data.
3. **Agent review** (optional, at most $0.60 by default): an AI reads the app and suggests where
   to start. It changes nothing.
4. **Brands:** open **Oerlikon** to see the brand (red #eb0000 with light grey and white). Edit,
   duplicate, export or import brands; the live preview shows real PrimeNG components in the brand,
   and **Code** shows the exact theme files Refit adds to the app.

### A first dry run (free)

**Modernize > Dry run > Start modernizing.** Refit:

1. copies the app and creates a branch
2. installs dependencies
3. builds it and takes before screenshots
4. upgrades Angular if you asked
5. installs PrimeNG and the brand
6. marks every page, checks it, and takes after screenshots
7. writes a report

This proves your app works with Refit before you spend anything on AI.

### A first real run

Pick **Claude Agent**, check the estimated maximum cost (pages × per-page budget, capped by the
run budget), and start. Watch it in **Simple** view (plain words) or **Developer** view (the full
log, commands and diffs). Cancel at any time: the branch and workspace are kept.

---

## 4. Results, report and pull request

- **Before and after:** compare every page, desktop and mobile, with a slider or side by side.
- **Report** (`View report`): what changed per page in plain words, flagged pages and why,
  protected files that were reverted, sensitive files that changed, the API-call check, the build
  and test results, cost and duration. It is also the pull request description.
- **Create pull request:** Refit asks first, then pushes the branch.
  - **GitHub:** with the GitHub CLI (`gh auth login` done) it creates the pull request; otherwise
    it opens the compare page.
  - **Azure DevOps** and **GitLab:** it links the "create pull request" page, and you paste the
    description with **Copy the description**.
  - **No remote** (a local folder): it shows the commands to fetch the branch into your folder.
- **Clean up:** **Remove workspace** deletes the run's copy (do it after the branch is pushed).
  **Delete run** removes everything about that run.

---

## 5. Costs

- Scans, the dry run, builds, screenshots and the guard are free.
- AI runs only for the review, the foundation (theme and app shell), each page, the design
  review rounds and build fixes.
- Hard limits apply per task, per page and per run (**Settings > Budgets**; by default $1.50 per
  page and $25 per run). Refit stops starting new pages when the run budget is used up and marks
  the rest **Skipped**.
- The run page shows the cost live.

---

## 6. Troubleshooting

| Problem | What to do |
|---|---|
| "Node X is not supported by Angular Y" in the scan | Install a Node version the app supports (the scan shows which), then set its folder in the app's **Advanced** settings. |
| "Port 4200 is in use" | Stop the other dev server. On Windows: `netstat -ano \| findstr :4200`, then `taskkill /PID <pid> /F`. |
| "Sign-in needed" on pages | **Settings > Microsoft sign-in > Sign in once** again; check the redirect URI (section 2). |
| Install failed | Run the install command shown in the log in the app folder. Common causes: a lockfile out of sync with package.json, or a private registry that needs a login (`.npmrc`). |
| "The app does not build before any change" | Refit only starts when the original builds, so it can prove it broke nothing. Fix the build in the app first. |
| Angular upgrade failed | The branch keeps every hop that worked. The log shows the failing `ng update`; libraries that do not support the new Angular yet are the usual cause. |
| Refit itself does not start | `node --version` must be 22.12+ or 24. Another program on port 4700? Use `REFIT_PORT`. |

---

## 7. Security

Refit sends the app's front-end code and screenshots to the AI provider you choose. **Get your
company's approval** for that provider and that app first. Refit:

- runs only on your computer and listens only on localhost
- keeps keys and tokens in `.env` only, and removes anything that looks like a secret from logs
- loads no settings, hooks or instructions from the target repository into the agent
- lets the agent run only the app's build, lint and test commands
- never pushes or merges without your click

---

## For developers

```bash
npm run dev            # server and web UI with live reload at http://localhost:4701
npm test               # unit tests
npm run test:integration
npm run test:e2e       # Playwright tests of Refit's UI
npm run test:slow      # Angular 17 to 21 upgrade (needs network, about 6 minutes)
npm run lint
npm run typecheck
```

Architecture, decisions and progress: [PLAN.md](PLAN.md) and [PROGRESS.md](PROGRESS.md). The
agent playbook is in `playbook/`, the starter brand in `brand/`, and test apps in `fixtures/`.
