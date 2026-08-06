# Explain a Claude Code session — 5-minute quickstart

Install the Explainify **Session-to-Explain** plugin into **any repository** and
turn one real Claude Code session into a local explanation (diagram + exact
quotes + receipts) — **no transcript copy/paste**. Explainify makes no additional
upload or hosted-API call; every artifact is written to your local filesystem.
(Claude Code's own model/provider network traffic is unchanged — that is Claude
Code, not Explainify.)

The install below pulls the plugin from a **git ref**, so once it is installed
you can delete every local Explainify checkout and the plugin keeps working from
Claude Code's own `~/.claude` cache. Verified end-to-end from a fresh repository
that contained **no Explainify source**, with Claude Code `v2.1.220`.

## Prerequisites

- **Claude Code CLI** `v2.1.220` or newer (`claude --version`).
- **Node.js 20+** (`node --version`) — the plugin runs on the same Node that
  Claude Code uses.
- **git**, plus network access to the Explainify git remote **for the install
  step only** (Claude Code clones the marketplace ref into its cache). After
  install, capturing/explaining a session needs no network for Explainify.
- The repository you want to explain must be a **git repo** (`git init` if new).

No API key, no hosted Explainify service, and no `node_modules` install are
required for the plugin itself — its runtime is bundled into the committed ref.

## 1. Install the plugin from the git ref

From the repository you want to explain:

```bash
cd /path/to/your-repo

# Register Explainify's git-backed marketplace (project scope = this repo).
# --sparse fetches only the catalog + the plugin directory, not the whole repo.
claude plugin marketplace add RileyLin/explainify@session/phase-1c-integration \
  --sparse .claude-plugin tools/session/plugin --scope project

# Install + enable the plugin
claude plugin install explainify-session@explainify-local --scope project
```

Confirm discovery:

```bash
claude plugin details explainify-session@explainify-local
```

Expected — a component inventory listing:

```
Skills (1)  explain-session
Hooks (3)  SessionStart, Stop, SessionEnd
MCP servers (1)  explainify-session
```

Because the marketplace was added by git ref, Claude Code caches the plugin
under `~/.claude`. You may now **delete every local Explainify checkout** — the
plugin continues to load from that cache.

## 2. Restart Claude Code

Hooks and MCP servers load at startup. **Quit and reopen** Claude Code (or start
a new `claude` session) in the same repository so the plugin activates.

## 3. Run one real session

Do any normal work in this repo — for example:

```
Add a factorial(n) function to app.js and a one-line comment above it.
```

When the turn finishes, the plugin's Stop hook records a local **pointer** (the
session id + transcript path + a hash of the final message) under
`.explainify/sessions/<session-id>/`. The transcript itself is never copied.

## 4. Explain the session (in a NEW session)

The tool explains a **completed** session, and it verifies against the exact
final message the hook recorded — so it cannot explain the very session that is
still running. The trust-safe flow is:

1. **Quit** the session you just did the work in (so its pointer is finalized).
2. Start a **new** `claude` session in the same repo.
3. Run the skill:

   ```
   /explain-session
   ```

   or call the MCP tool directly with your repository root:

   ```
   explainify.explain_session { "repository": { "root": "/path/to/your-repo" } }
   ```

The new session has no completed pointer of its own yet, so the tool
auto-selects the single completed session. If more than one completed session
exists, pass `session.id` explicitly.

It captures the session's bounded evidence and renders the explanation locally in
one call. The tool returns **absolute** local paths, e.g.:

```json
{
  "status": "verified",
  "artifactPath":  "/path/to/your-repo/.explainify/out/<session-id>/index.html",
  "packagePath":   "/path/to/your-repo/.explainify/out/<session-id>/workstream-package.json",
  "bundlePath":    "/path/to/your-repo/.explainify/out/<session-id>/bundle.json",
  "captureReceiptPath": "/path/to/your-repo/.explainify/out/<session-id>/capture-receipt.json",
  "lineageReceiptPath": "/path/to/your-repo/.explainify/out/<session-id>/lineage-receipt.json",
  "openCommand":   "open /path/to/your-repo/.explainify/out/<session-id>/index.html",
  "publication":   "local_only"
}
```

## 5. Open the result

```bash
open /path/to/your-repo/.explainify/out/<session-id>/index.html   # macOS
# or: xdg-open …   (Linux)   |   start …   (Windows)
```

You'll see a self-contained page: a 30-second brief, **what changed**, **why**,
**how the session changed the system**, **verification**, **review-first /
unknowns**, and **exact session quotes** — plus the git/tool/test evidence. Every
claim links to a hashed excerpt; the lineage receipt binds capture → bundle →
package → HTML so any tampering is detectable.

## What you're guaranteed

- **No additional upload by Explainify** — Explainify makes no extra network or
  hosted-API call of its own and writes every artifact locally; `publication` is
  always `local_only`. (Your normal Claude Code provider traffic is unaffected.)
- **No whole transcript** — only selected, redacted excerpts with exact locators
  and hashes; `manualPaste` is `false`.
- **Secret-safe** — `.env*`, keys, tokens, caches, and secret-shaped content are
  excluded or redacted before anything is written; the receipt records
  `secretScan: pass` and any redaction/denied-path counts.

## Reinstall / update / uninstall

```bash
# Pull a newer committed plugin build, then refresh the install:
claude plugin marketplace update explainify-local
claude plugin update explainify-session@explainify-local
# then restart Claude Code

# Remove entirely (project scope):
claude plugin uninstall explainify-session@explainify-local --scope project
claude plugin marketplace remove explainify-local
```

## Troubleshooting

- **`plugin details` doesn't list the components** — you didn't restart Claude
  Code after install (step 2), or you ran the commands from a different repo than
  the one you opened.
- **`explain_session` reports no completed session** — you're running it in the
  same session you want explained, or the Stop hook hasn't finalized a pointer
  yet. Quit, start a new session, and run it there; or pass `session.id`.
- **`Multiple completed sessions captured`** — more than one completed pointer
  exists; pass `session.id` to pick one.
- **Validation error mentioning `mcpServers`/`hooks`** — the cached marketplace
  is stale; run `claude plugin marketplace update explainify-local`.

## Note on pre-existing uncommitted changes

Explainify reports the repository changes that were present during the session as
evidence. If your working tree already had unrelated uncommitted edits before the
session, those will appear in the change evidence too — for the cleanest result,
run the session you want explained from a clean worktree. Explainify never hides
genuine in-session edits to your Claude project configuration (`.claude/CLAUDE.md`,
skills, hooks, or edited settings): a session that intentionally changes Claude
configuration **will** include those files as change evidence. Only the two
installer-written settings files (`.claude/settings.json`,
`.claude/settings.local.json`) are omitted, and only when they are byte-identical
to what they were at the session's start (i.e. the install itself, not your work).
The tool-owned `.explainify/` directory is always excluded.
