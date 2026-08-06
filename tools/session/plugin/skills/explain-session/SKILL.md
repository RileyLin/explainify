---
name: explain-session
description: Explain what a completed Claude Code session did — capture bounded session evidence (selected excerpts, tool events, git/test receipts) and render a local, secret-scanned explanation (diagram + exact quotes) with no transcript copy/paste. Use when a user asks "what did this session do", "explain this work", or "summarize what changed" for the most recent completed session (or a specified one).
---

# Explain a completed session

Explain the **most recent completed** Claude Code session (or a specified one) by
calling the Explainify MCP tool. It captures the session's bounded evidence and
renders the final local explanation in one call. Do **not** paste transcript
content; the tool reads the session's own transcript pointer that the plugin hook
recorded.

Best run in a **new** Claude session: finish the work you want explained, then
start a fresh session and invoke this skill. The tool auto-selects the single
completed session pointer; the fresh session is still in progress (no pointer
yet), so it is not a candidate. If more than one completed session exists, pass
`session.id` explicitly.

## How to run it

1. Confirm the Explainify session plugin is active (the `explainify-session` MCP
   server is configured in `.mcp.json`, and the Stop/SessionEnd hook has written
   a pointer under `.explainify/sessions/<session-id>/`).
2. Call the MCP tool:

   ```text
   explainify.explain_session
   ```

   with arguments:

   - `question`: what the explanation should answer (e.g. "What did this session
     change and why?").
   - `repository.root`: the absolute repository root (use `CLAUDE_PROJECT_DIR`).
   - optionally `repository.baseRef` / `repository.headRef` to bound the diff.
   - optionally `session.id` to explain a specific completed session when more
     than one has been captured.

3. The tool returns local paths to the final rendered explanation plus the
   capture bundle/receipt lineage:

   ```json
   {
     "status": "verified",
     "artifactPath": "…/index.html",
     "packagePath": "…/workstream-package.json",
     "htmlReceiptPath": "…/receipt.json",
     "bundlePath": "…/bundle.json",
     "captureReceiptPath": "…/capture-receipt.json",
     "lineageReceiptPath": "…/lineage-receipt.json",
     "openCommand": "open …/index.html",
     "publication": "local_only"
   }
   ```

   Open `artifactPath` (`index.html`) in a browser to read the explanation
   (diagram + exact quotes). Everything is on the local filesystem.

## Guarantees to tell the user

- Explainify performs no additional upload or hosted-API call and writes every
  artifact to the local filesystem: `publication` is always `local_only`. (This
  is about Explainify itself; Claude Code's own model/provider network traffic is
  unchanged.)
- The raw transcript is never embedded — only selected, redacted excerpts with
  exact locators and hashes.
- Denied paths (`.env*`, credentials, keys, tokens, caches, binaries) and
  secret-shaped content are excluded or redacted before anything is written; the
  receipt records the secret scan result and any redaction/denied-path counts.
- Model reasoning (thinking) and progress chatter are excluded.
- The lineage receipt binds capture receipt → bundle → session package → HTML
  receipt by content hash, so any tamper anywhere in the chain is detectable.

## Boundary

This skill captures the **evidence bundle** (Phase 1A) and renders the final
explanation via the accepted Phase 1B synthesis (Phase 1C integration) — all
local. It never calls a hosted API/model or publishes remotely.
