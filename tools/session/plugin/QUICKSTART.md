# Explain a Claude Code session — 5-minute quickstart

Install the Explainify **Session-to-Explain** plugin into **any repository** and
turn one real Claude Code session into a local explanation (diagram + exact
quotes + receipts) — **no transcript copy/paste, nothing uploaded.**

Every step below is copy-pasteable and was verified end-to-end from a fresh
repository that contained **no Explainify source**, with Claude Code `v2.1.220`.

## Prerequisites

- **Claude Code CLI** `v2.1.220` or newer (`claude --version`).
- **Node.js 20+** (`node --version`) — the plugin runs on the same Node that
  Claude Code uses.
- A local checkout of Explainify (only to point the installer at the plugin
  directory once; its source is **not** copied into your repo).
- The repository you want to explain must be a **git repo** (`git init` if new).

No API key, no network, no hosted service, and no `node_modules` install are
required for the plugin itself — its runtime is bundled.

## 1. (Maintainers only) build the bundled plugin runtime

If you are installing a released Explainify checkout, `tools/session/plugin/lib/`
is already built — **skip to step 2**. If you changed any session source, rebuild
and verify the drift guard:

```bash
cd /path/to/explainify
node tools/session/plugin/build-plugin.mjs          # assemble plugin/lib/
node tools/session/plugin/build-plugin.mjs --check  # must print "in sync"
```

## 2. Install the plugin into your repository

From the repository you want to explain:

```bash
cd /path/to/your-repo

# Register Explainify's plugin as a local marketplace (project scope = this repo)
claude plugin marketplace add /path/to/explainify/tools/session/plugin --scope project

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

## 3. Restart Claude Code

Hooks and MCP servers load at startup. **Quit and reopen** Claude Code (or start
a new `claude` session) in the same repository so the plugin activates.

## 4. Run one real session

Do any normal work in this repo — for example:

```
Add a factorial(n) function to app.js and a one-line comment above it.
```

When the turn finishes, the plugin's Stop hook records a local **pointer** (the
session id + transcript path + a hash of the final message) under
`.explainify/sessions/<session-id>/`. The transcript itself is never copied.

## 5. Explain the session

Ask Claude Code to run the skill:

```
/explain-session
```

or call the MCP tool directly with your repository root:

```
explainify.explain_session { "repository": { "root": "/path/to/your-repo" } }
```

It captures the session's bounded evidence and renders the explanation locally in
one call. The tool returns local paths, e.g.:

```json
{
  "status": "verified",
  "artifactPath":  ".explainify/out/<session-id>/index.html",
  "packagePath":   ".explainify/out/<session-id>/workstream-package.json",
  "bundlePath":    ".explainify/out/<session-id>/bundle.json",
  "captureReceiptPath": ".explainify/out/<session-id>/capture-receipt.json",
  "lineageReceiptPath": ".explainify/out/<session-id>/lineage-receipt.json",
  "openCommand":   "open .explainify/out/<session-id>/index.html",
  "publication":   "local_only"
}
```

## 6. Open the result

```bash
open .explainify/out/<session-id>/index.html      # macOS
# or: xdg-open …   (Linux)   |   start …   (Windows)
```

You'll see a self-contained page: a 30-second brief, **what changed**, **why**,
**how the session changed the system**, **verification**, **review-first /
unknowns**, and **exact session quotes** — plus the git/tool/test evidence. Every
claim links to a hashed excerpt; the lineage receipt binds capture → bundle →
package → HTML so any tampering is detectable.

## What you're guaranteed

- **Nothing is uploaded** — `publication` is always `local_only`.
- **No whole transcript** — only selected, redacted excerpts with exact locators
  and hashes; `manualPaste` is `false`.
- **Secret-safe** — `.env*`, keys, tokens, caches, and secret-shaped content are
  excluded or redacted before anything is written; the receipt records
  `secretScan: pass` and any redaction/denied-path counts.

## Reinstall / update / uninstall

```bash
# After changing the plugin, rebuild then refresh the install:
node /path/to/explainify/tools/session/plugin/build-plugin.mjs
claude plugin uninstall explainify-session@explainify-local --scope project
claude plugin marketplace remove explainify-local
claude plugin marketplace add /path/to/explainify/tools/session/plugin --scope project
claude plugin install explainify-session@explainify-local --scope project
# then restart Claude Code

# Remove entirely:
claude plugin uninstall explainify-session@explainify-local --scope project
claude plugin marketplace remove explainify-local
```

## Troubleshooting

- **`plugin details` doesn't list the components** — you didn't restart Claude
  Code after install (step 3), or you ran the commands from a different repo than
  the one you opened.
- **`explain_session` reports no captured session** — the Stop hook hasn't run
  yet. Complete at least one full turn after enabling the plugin, or pass
  `session.id` explicitly.
- **Validation error mentioning `mcpServers`/`hooks`** — you're pointing at an old
  plugin build; rebuild with `build-plugin.mjs` and re-add the marketplace.
