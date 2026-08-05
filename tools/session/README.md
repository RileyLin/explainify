# Explainify Session Capture — Phase 1A

The **producer** half of Explainify Session-to-Explain: turn a real Claude Code
session into a provider-neutral `SessionEvidenceBundle` with **no transcript
copy/paste**, local-only, secret-scanned. Frozen contract:
[`docs/product/session-to-explain-v1.md`](../../docs/product/session-to-explain-v1.md).

Phase 1B (synthesis: explanation, quotes, diagram) consumes `bundle.json` and
never re-parses a transcript. This module never synthesizes prose/diagrams,
calls a hosted API, or publishes.

## Modules

| File | Role |
| --- | --- |
| `bundle-schema.mjs` | The frozen `SessionEvidenceBundle` shape + `validateBundle`/`assertBundle`. The interface Phase 1B builds against. |
| `safety.mjs` | Denied-path detection + secret redaction/scan (superset of the comparative engine's denial). |
| `claude-adapter.mjs` | Transcript JSONL → bundle: semantic selection, exact locators/hashes, size limits, redaction, fail-closed on unknown payloads. |
| `capture.mjs` | Pointer resolution, async-stable transcript read, git repository facts. |
| `receipt.mjs` | Deterministic stringify + hash (mirrors `tools/comprehension/util.mjs`). |
| `session-cli.mjs` | `capture` / `validate` / `write-pointer` for reproducibility and non-Claude clients. |
| `mcp-server.mjs` | Local stdio MCP server exposing `explainify.explain_session`. |
| `plugin/` | Claude Code plugin: `.mcp.json`, narrow Stop/SessionEnd `hooks.json`, `capture-pointer.mjs` hook, `/explain-session` skill. |

## How capture flows

1. A Claude Code **hook** (`plugin/hooks/capture-pointer.mjs`) fires at Stop /
   SessionEnd and writes a **pointer only** to
   `.explainify/sessions/<session-id>/pointer.json` — session id, transcript
   path, cwd, event. The transcript content is never copied.
2. The session (or user) calls the **MCP tool** `explainify.explain_session`
   (or the CLI). It resolves the pointer, reads the transcript once it is
   **stable** (the file lags the live turn), collects **git** facts, and runs
   the **adapter**.
3. The adapter emits a validated `SessionEvidenceBundle` + a **capture receipt**
   under `.explainify/out/<session-id>/`. The receipt proves `manualPaste:false`,
   records the whole-file transcript hash, bundle hash, secret-scan result,
   redaction/denied-path counts, and `publication: local_only`.

## Scripts

```bash
npm run session:mcp                       # start the stdio MCP server
npm run session:capture -- --session-id <id> --root <repo>   # capture via pointer
npm run session:validate -- --bundle <path>                  # schema-check a bundle
npm run test:session                      # deterministic fixture tests (21)
node tools/session/__tests__/mcp-e2e.mjs <id> <root>         # real MCP handshake
```

## Install as a Claude Code plugin

Point Claude Code at `tools/session/plugin/` (it contains `.claude-plugin/`,
`.mcp.json`, and `hooks.json`). `CLAUDE_PROJECT_DIR` resolves the MCP server and
hook paths. The plugin adds:

- MCP server `explainify-session` with tool `explainify.explain_session`;
- narrow `Stop` / `SessionEnd` hooks that record the session pointer;
- the `/explain-session` skill.

## Guarantees (contract §Privacy Boundary)

- **Local by default.** Every output records `publication: local_only`; nothing
  is uploaded.
- **No whole transcript.** The raw transcript is referenced by its whole-file
  SHA-256 and never embedded; only selected, redacted excerpts enter the bundle.
- **Denied before selection.** `.env*`, credential stores, shell history,
  private keys, tokens, caches, and binaries are excluded before selection.
- **Secret gate.** Secret-shaped content is redacted; anything still matching
  after redaction is excluded rather than shipped, so `secretScan` is always
  `pass`. A secret canary in an excluded transcript/tool result never reaches
  the bundle, receipt, or logs (proven in tests).
- **Fail-closed.** Unknown record/tool/block types and malformed lines are
  excluded and **counted** in `exclusions`, never coerced into trusted evidence.
- **Deterministic.** Identical immutable transcript + repository state yields a
  byte-identical bundle.

## Claude-version constraint

Built against `@modelcontextprotocol/sdk` `^1.27.1` (`McpServer` +
`StdioServerTransport`, `registerTool`). Hook input relies on `session_id`,
`cwd`, and `transcript_path` fields and the `hook_event_name` for Stop /
SessionEnd, per current Claude Code hook docs; the transcript-lag handling in
`readStableTranscript` covers the documented async-write behavior.
