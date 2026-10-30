# GitHub Copilot CLI 1.0.105: facts for the Copilot provider

Collected on 2026-10-30 for phase 5, which is paused until the Angular work is done. Sources:

- the CLI's own extracted package (`cli-main.js`, `copilot-sdk/generated/session-events.d.ts`,
  `schemas/session-events.schema.json`) and its bundled native helpers, run without network
- `copilot --help` and `copilot help <topic>`
- GitHub's docs: the
  [programmatic reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference)
  and [running the CLI programmatically](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically)

"Confirmed" means seen in code or types; "inferred" means not proven and needs an empirical test.

## Running it

- `copilot -p "<prompt>"` runs once and exits. `--allow-all-tools` is **not** required.
- Without approval for a tool call, `-p` mode auto-denies it and the run continues (confirmed).
  The model reads "Permission denied and could not request permission from user".
- With `--allow-all-tools` plus `--deny-tool`, deny always wins. The model reads "Permission to run
  this tool was denied due to the following rules: ...".
- Reads (view, grep, glob) are auto-approved in `-p` mode (confirmed).
- Permission patterns: `shell(cmd)`, `shell(git:*)` (prefix on the first-level subcommand),
  `write(path)` (a relative path matches trailing components), `read(...)`, `url(domain)`,
  `memory`, `<mcp-server>(tool)`. The kind is not validated: `--allow-tool bash` names an MCP
  server, it does not allow the shell.
- Plan for Refit: `--allow-tool write` plus `--allow-tool "shell(<each allowed command>)"`, no
  `--allow-all-tools`, and the spec's `--deny-tool` list on top (git push/commit/reset/checkout,
  rm/del, package installs, curl/wget). Read-only reviews get no write or shell approvals at all.
- Safety flags: `--no-ask-user`, `--no-auto-update`, `--no-custom-instructions`,
  `--disable-builtin-mcps`, `--disallow-temp-dir`, `--no-color`. Never `--trust-folder` and never
  `COPILOT_ALLOW_ALL=true`. Both load the repository's hooks, MCP servers and plugins.
- Repository hooks and workspace MCP load only for trusted folders: `COPILOT_ALLOW_ALL==="true"`,
  `GITHUB_COPILOT_PROMPT_MODE_REPO_HOOKS==="true"`, saved `trustedFolders`, or `--trust-folder`.
  A folder trusted earlier in interactive mode is trusted in `-p` too. Refit's workspaces are
  fresh folders, so they are never in that list.
- AGENTS.md, `.github/copilot-instructions.md`, CLAUDE.md and `.github/instructions/*` load
  regardless of trust. `--no-custom-instructions` turns them off.
- `disableAllHooks: true` in `$COPILOT_HOME/settings.json` turns off repo and user hooks. The CLI
  writes that file itself (`copilot config disableAllHooks true` wrote `$COPILOT_HOME/settings.json`).
- Instructions besides the prompt: `COPILOT_CUSTOM_INSTRUCTIONS_DIRS`, or a custom agent
  (`--agent <name>` takes a name only, so the file goes in `$COPILOT_HOME/agents`). The spec's way
  works: write `.refit/task.md` and prompt "Read the file .refit/task.md and follow its
  instructions exactly."

## Tools (for `--available-tools` / `--excluded-tools`)

- Shell: `bash`, `read_bash`, `stop_bash`, `list_bash` on Linux and macOS. On Windows:
  `powershell`, `read_powershell`, `stop_powershell`, `list_powershell` (confirmed).
- Files, depending on the model: `view`, `glob`, `grep` or `rg`, `edit`, `create`,
  `str_replace_editor`, `apply_patch`.
- Others to exclude: `web_fetch`, `task`, `skill`, `store_memory`, `ask_user`,
  `fetch_copilot_cli_documentation`, `read_agent`, `write_agent`, `list_agents`, `sql`,
  `manage_schedule`, `lsp`, `update_todo`, `exit_plan_mode`.

## Output: `--output-format json`

Each line is a raw session event: `{type, data, id, timestamp, parentId, ephemeral?, agentId?}`.
These are filtered out (confirmed):

- `session.idle`, `session.shutdown`, `session.usage_info`, `session.title_changed`,
  `session.mode_changed`, `session.model_change`
- `assistant.usage`, `assistant.intent`, `assistant.streaming_delta`
- `permission.*` and `hook.*`

Deltas (`assistant.message_delta`, `assistant.reasoning_delta`) are **not** filtered.

| Event | Data |
|---|---|
| `assistant.message` | `{messageId, content, toolRequests?: [{toolCallId, name, arguments?, intentionSummary?}], model?, outputTokens?, reasoningText?}` |
| `assistant.reasoning` | `{reasoningId, content}` |
| `tool.execution_start` | `{toolCallId, toolName, arguments?, mcpServerName?, shellToolInfo?}` |
| `tool.execution_complete` | `{toolCallId, success, result?: {content}, error?: {message, code?}, shellExecution?: {exitCode}}`. It has no tool name: join on `toolCallId`. A permission denial shows only here, as `success: false`. |
| `session.error` | `{errorType, message, statusCode?, errorCode?, remediation?, url?}`. In JSON mode it goes only to stdout, not stderr. |
| `abort` | `{reason: "user_initiated" \| "remote_command" \| "user_abort" \| "autopilot_credit_limit"}` |
| `session_limits_exhausted.requested` | `{requestId, usedAiCredits, maxAiCredits}` |

The last line is not an event:

```json
{"type":"result","timestamp":"...","sessionId":"...","exitCode":0,
 "usage":{"premiumRequests":1,"totalApiDurationMs":0,"sessionDurationMs":0,
          "codeChanges":{"linesAdded":0,"linesRemoved":0,"filesModified":[]}},
 "outcome":"blocked","blocker":"..."}
```

`outcome` and `blocker` appear only when blocked.

## Usage and cost

- `--usage-output-file <file>` writes pretty JSON: `{sessionStartTime, totalPremiumRequestCost,
  totalUserRequests, totalApiDurationMs, totalNanoAiu?, aiCreditsStatus?, currentModel?,
  modelMetrics: {[model]: {requests: {count, cost}, usage: {...}, totalNanoAiu?}}, codeChanges}`.
  One AI credit is 1e9 nano-AIU (confirmed).
- Billing is in AI credits; accounts on the legacy plan see premium requests.
- `--max-ai-credits <n>` has a minimum of 30. What `-p` does when the limit is hit (final event,
  exit code) is not confirmed: test it.

## Exit codes (`-p`)

- 0: success. A SIGINT or SIGTERM also exits 0 (inferred; test it).
- 1: missing auth, a `session.error` other than `model_call` or `hook`, a blocked run, a failed
  usage-file write, or an exception. A `model_call` error alone does not exit 1. Read
  `session.error` events as well as the exit code.

## Auth

- Tokens, in precedence order: `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`.
- Supported: fine-grained PATs (`github_pat_`) with the "Copilot Requests" permission, and OAuth
  tokens (`gho_`, `ghu_`). Classic PATs (`ghp_`) are not supported.
- `copilot login` stores the token in the OS credential store, falling back to a plain-text file
  under `~/.copilot/` (or `$COPILOT_HOME`). There is also `COPILOT_DISABLE_KEYTAR=1`.
- No auth: stderr "Error: No authentication information found. ..." and exit 1.

## Other

- `--attachment` takes images (png, jpg, gif, webp, bmp, tiff, heic, ico) and documents (pdf,
  docx, xlsx, pptx, rtf, odt). It rejects svg, txt, md, csv, html and json.
- `--reasoning-effort none|minimal|low|medium|high|xhigh|max`. It is not supported with the "auto"
  model.
- `copilot --version` prints "GitHub Copilot CLI 1.0.105." on the first line.
- The first run extracts about 236 MB to `~/.cache/copilot/pkg/<platform>/<version>/`.
