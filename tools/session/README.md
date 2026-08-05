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
| `plugin/` | Self-contained Claude Code plugin: `.claude-plugin/{plugin.json,marketplace.json}`, `.mcp.json`, narrow Stop/SessionEnd `hooks.json`, `capture-pointer.mjs` hook, `/explain-session` skill, and the built `lib/` runtime. |
| `plugin/build-plugin.mjs` | Deterministic packager: copies the runtime source closure verbatim into `plugin/lib/` and vendors the two third-party deps into one bundle, so the plugin installs from any repo with no `node_modules`. `--check` is a drift guard. |

## How capture flows

1. A Claude Code **hook** (`plugin/hooks/capture-pointer.mjs`) fires:
   - at **SessionStart** it records an immutable repository baseline (start
     commit + dirty flag) to `.explainify/sessions/<session-id>/start.json`;
   - at **Stop / SessionEnd** it writes a **pointer only** to
     `.explainify/sessions/<session-id>/pointer.json` — session id, transcript
     path, cwd, event, and the SHA-256 of the hook-provided
     `last_assistant_message` (the authoritative completed turn). The hook never
     reads or copies the transcript; the transcript file lags the live turn, so
     re-deriving the marker from disk could bind a stale, mid-write turn.
2. The session (or user) calls the **MCP tool** `explainify.explain_session`
   (or the CLI). It **requires** that recorded final-message hash for a
   Stop/SessionEnd capture (no transcript-derived fallback), waits until the
   transcript is **quiescent and its final assistant message matches that hash**
   (a timeout is an error, never a partial "verified" bundle), collects **git**
   facts (committed baseline→head changes **unioned** with remaining working-tree
   changes, so a fully-committed session is not reported as empty; an
   unresolvable requested ref is an error), and runs the **adapter**.
3. The adapter emits a validated `SessionEvidenceBundle` + a **capture receipt**
   under `.explainify/out/<session-id>/`. The receipt proves `manualPaste:false`,
   records the whole-file transcript hash, the bound final-message hash, bundle
   hash, secret-scan result, redaction/denied-path counts, and
   `publication: local_only`.

The caller's `question`/`audience` is **request context**, not evidence: it
lands in `bundle.request` and never becomes the observed `objective`, whose
`sourceId` always resolves to a selected excerpt.

## Scripts

```bash
npm run session:mcp                       # start the stdio MCP server
npm run session:capture -- --session-id <id> --root <repo>   # capture via pointer
npm run session:validate -- --bundle <path>                  # schema-check a bundle
npm run test:session                      # deterministic fixture tests (90)
node tools/session/__tests__/mcp-e2e.mjs <id> <root>         # real MCP handshake
```

## Install as a Claude Code plugin (from any repo)

The plugin is **self-contained** and installs into any repository via the
official Claude Code local-plugin mechanism — it never references the Explainify
checkout at runtime. See the copy-pasteable owner guide:
[`plugin/QUICKSTART.md`](plugin/QUICKSTART.md) (under 5 minutes).

In short, from the repository you want to explain:

```bash
claude plugin marketplace add /path/to/explainify/tools/session/plugin
claude plugin install explainify-session@explainify-local
# restart Claude Code, then run one session and call /explain-session
```

The plugin adds:

- MCP server `explainify-session` with tool `explainify.explain_session`;
- a `SessionStart` hook that records the immutable repository baseline, plus
  narrow `Stop` / `SessionEnd` hooks that record the session pointer + the hash
  of the hook-provided `last_assistant_message` (never re-read from disk);
- the `/explain-session` skill.

Runtime paths resolve from `${CLAUDE_PLUGIN_ROOT}` (the installed plugin cache),
so the target repo needs no Explainify source. The MCP tool takes the target
`repository.root` as an argument; the hook writes only a pointer under the target
repo's `.explainify/`.

**Real-client discovery, verified.** With Claude Code `v2.1.220`, installing from
a fresh repository containing **no Explainify source** yields a plugin whose
`plugin details` reports the MCP server, the SessionStart/Stop/SessionEnd hooks,
and the `explain-session` skill; one real session then produces a `verified`
local explanation (`index.html` + package + bound receipts, `manualPaste:false`,
`publication:local_only`). A redacted structural receipt of one real capture is
committed at
[`docs/product/session-1a-real-capture-receipt.json`](../../docs/product/session-1a-real-capture-receipt.json).

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

Built against `@modelcontextprotocol/sdk` `^1.30.0` (`McpServer` +
`StdioServerTransport`, `registerTool`) and verified with the Claude Code CLI
`v2.1.220` local-plugin mechanism. The SDK + `zod` are vendored into the plugin
by `build-plugin.mjs`, so the installed plugin carries its own runtime. Hook
input relies on `session_id`, `cwd`, and `transcript_path` fields and the
`hook_event_name` for Stop / SessionEnd, per current Claude Code hook docs; the
transcript-lag handling in `readStableTranscript` covers the documented
async-write behavior.
