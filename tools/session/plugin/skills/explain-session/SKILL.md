---
name: explain-session
description: Explain what the current Claude Code session did — capture bounded session evidence (selected excerpts, tool events, git/test receipts) into a local, secret-scanned SessionEvidenceBundle with no transcript copy/paste. Use when a user asks "what did this session do", "explain this work", or "summarize what changed" for the current session.
---

# Explain this session

Capture the current Claude Code session into a local evidence bundle by calling
the Explainify MCP tool. Do **not** paste transcript content; the tool reads the
session's own transcript pointer that the plugin hook recorded.

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

3. The tool returns local paths:

   ```json
   {
     "status": "verified",
     "artifactPath": "…/bundle.json",
     "packagePath": "…/bundle.json",
     "receiptPath": "…/receipt.json",
     "publication": "local_only"
   }
   ```

## Guarantees to tell the user

- Nothing is uploaded: `publication` is always `local_only`.
- The raw transcript is never embedded — only selected, redacted excerpts with
  exact locators and hashes.
- Denied paths (`.env*`, credentials, keys, tokens, caches, binaries) and
  secret-shaped content are excluded or redacted before anything is written; the
  receipt records the secret scan result and any redaction/denied-path counts.
- Model reasoning (thinking) and progress chatter are excluded.

## Boundary

This skill produces the **evidence bundle** (Phase 1A). Rendering the human
explanation, quotes, and architecture diagram from the bundle is Phase 1B; it
consumes `bundle.json` and never re-parses the transcript.
