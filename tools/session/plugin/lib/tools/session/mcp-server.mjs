#!/usr/bin/env node
// Explainify local stdio MCP server (Phase 1A). Exposes one tool,
// `explainify.explain_session`, that a Claude Code session invokes to capture
// its own bounded evidence — no transcript copy/paste. The server resolves the
// hook-written pointer (or an explicit transcript path), reads the stable
// transcript, collects repository facts, and emits a SessionEvidenceBundle plus
// a capture receipt on the local filesystem.
//
// Boundary note (Phase 1C): this tool now returns the FINAL local explanation —
// the rendered index.html plus workstream-package.json and receipts — not only
// the capture bundle. It captures the session's bounded evidence (1A producer),
// then runs the accepted 1B synthesis locally and binds the full lineage
// (capture receipt → bundle → session package → HTML receipt). It still does NOT
// call a hosted API/model or publish remotely; everything is local-only.

import { McpServer } from "../../vendor/mcp-vendor.mjs";
import { StdioServerTransport } from "../../vendor/mcp-vendor.mjs";
import { z } from "../../vendor/mcp-vendor.mjs";
import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import {
  readPointer,
  readBaseline,
  readStableTranscript,
  collectRepository,
  hashChangedFiles,
  collectFinalContent,
  outDir as sessionOutDir,
  assertSafeSessionId,
} from "./capture.mjs";
import { captureAndSynthesize } from "./integrate.mjs";

// Resolve the most relevant session pointer if the caller did not name one.
// Prefer an explicit id, else the single COMPLETED pointer under
// .explainify/sessions. A directory is only a candidate if it holds a
// `pointer.json` (a completed Stop/SessionEnd capture). The literal owner flow
// is: finish the work session, start a NEW Claude session, then invoke
// /explain-session. That new session's SessionStart hook writes a start-only
// directory (start.json, no pointer.json yet). Counting those would make the
// first auto-select ambiguous ("Multiple sessions…") even though only one
// session was actually completed — so start-only directories are ignored here.
// This does NOT relax the trust boundary: when two or more COMPLETED pointers
// exist we still require an explicit session.id.
async function hasPointer(dir) {
  try {
    return (await stat(path.join(dir, "pointer.json"))).isFile();
  } catch {
    return false;
  }
}

async function resolveSessionId(root, requested) {
  if (requested) return assertSafeSessionId(requested);
  const dir = path.join(root, ".explainify", "sessions");
  const all = (await readdir(dir).catch(() => [])).filter((id) => /^[A-Za-z0-9._-]+$/.test(id) && id !== "." && id !== "..");
  const completed = [];
  for (const id of all) {
    if (await hasPointer(path.join(dir, id))) completed.push(id);
  }
  if (completed.length === 1) return completed[0];
  if (completed.length === 0) throw new Error("No completed session pointer found; finish a session (Stop/SessionEnd) or pass session.id.");
  throw new Error(`Multiple completed sessions captured (${completed.join(", ")}); specify session.id.`);
}

async function runCapture(input) {
  const rootInput = input.repository.root;
  const root = await realpath(rootInput).catch(() => rootInput);

  const sessionId = await resolveSessionId(root, input.session?.id);
  const pointer = await readPointer(root, sessionId);
  const captureEvent = pointer.captureEvent || "tool_call";
  const cwd = pointer.cwd || root;
  const baseline = await readBaseline(root, sessionId);

  // Bind to the completed turn the hook recorded (finding #1): a Stop/SessionEnd
  // capture MUST carry the hook-provided final-message hash and capture waits for
  // a quiescent transcript that contains that exact final assistant message. We
  // never fall back to a transcript-derived marker for a completion event — that
  // would let a mid-write transcript pass as "verified".
  if ((captureEvent === "stop" || captureEvent === "session_end") && !pointer.finalMessageSha256) {
    throw new Error(
      `Session pointer for ${captureEvent} is missing finalMessageSha256; the hook must record the final assistant message. Refusing to verify against a transcript-derived marker.`,
    );
  }
  const { text, transcriptSha256, finalMessageSha256 } = await readStableTranscript(pointer.transcriptPath, {
    expectFinalHash: pointer.finalMessageSha256 || null,
  });

  const repoBase = await collectRepository(root, {
    baseRef: input.repository.baseRef,
    headRef: input.repository.headRef,
    baseline,
  });
  const changedFiles = await hashChangedFiles(root, repoBase.changedFiles);
  // Final file text for Phase 1E landed-classification (used only to locate where
  // an edit landed; never emitted — the emitted code comes from the secret-scanned
  // transcript preimage).
  const finalContent = await collectFinalContent(root, changedFiles);
  // Pass the SessionStart installer-settings baseline hashes through so the
  // adapter can omit ONLY unchanged installer settings (.claude/settings*.json)
  // from session evidence, while keeping genuine in-session .claude edits.
  const repository = {
    ...repoBase,
    root,
    changedFiles,
    finalContent,
    installerBaselineHashes: baseline?.installerSettings || null,
  };

  const outDir = input.outputDirectory
    ? await realpath(input.outputDirectory).catch(() => input.outputDirectory)
    : sessionOutDir(root, sessionId);

  // Phase 1C seam: build+validate the capture bundle, then synthesize the final
  // local artifacts and bind the lineage. The caller's question/audience is
  // REQUEST context, never the observed objective (finding #3) — the adapter
  // derives the objective from the session itself.
  return captureAndSynthesize({
    text,
    transcriptSha256,
    finalMessageSha256,
    session: { id: sessionId, cwd, captureEvent },
    request: { question: input.question, audience: input.audience },
    repository,
    transcriptPath: pointer.transcriptPath,
    outDir,
  });
}

const server = new McpServer({ name: "explainify-session", version: "0.4.0" });

server.registerTool(
  "explainify.explain_session",
  {
    title: "Explain a completed session",
    description:
      "Explain a completed Claude Code session: capture its bounded evidence (selected excerpts, tool events, git/test receipts) with no transcript copy/paste, then render a local explanation — index.html (diagram + exact quotes), workstream-package.json, and receipts — secret-scanned and written locally. Explainify makes no additional upload or hosted-API call (Claude Code's own provider traffic is unchanged). Auto-selects the sole completed session pointer; pass session.id when more than one exists. Returns the local artifact/package/receipt/lineage paths.",
    inputSchema: {
      question: z.string().describe("What should the explanation answer?").default("What did this session do and why?"),
      session: z
        .object({ id: z.string().optional() })
        .optional()
        .describe("Optional session id; defaults to the sole completed session pointer. Pass an explicit id when multiple completed sessions exist."),
      repository: z
        .object({
          root: z.string().describe("Absolute repository root."),
          baseRef: z.string().optional(),
          headRef: z.string().optional(),
        })
        .describe("Repository to collect git evidence from."),
      audience: z
        .object({
          role: z.string().default("engineer"),
          technicalDepth: z.enum(["overview", "working", "expert"]).default("working"),
        })
        .optional(),
      outputDirectory: z.string().optional(),
    },
  },
  async (input) => {
    try {
      const result = await runCapture(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (e) {
      return {
        isError: true,
        content: [{ type: "text", text: `explain_session failed: ${e.message}` }],
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
