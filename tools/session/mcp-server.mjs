#!/usr/bin/env node
// Explainify local stdio MCP server (Phase 1A). Exposes one tool,
// `explainify.explain_session`, that a Claude Code session invokes to capture
// its own bounded evidence — no transcript copy/paste. The server resolves the
// hook-written pointer (or an explicit transcript path), reads the stable
// transcript, collects repository facts, and emits a SessionEvidenceBundle plus
// a capture receipt on the local filesystem.
//
// Boundary note: this is the PRODUCER half of Phase 1A. It deliberately does NOT
// synthesize prose/diagrams, call a hosted API, or publish — the returned
// artifactPath is the local bundle. Phase 1B (synthesis) consumes the bundle and
// renders the reader/diagram. The tool output shape matches the contract's
// explainify.explain_session result, with artifactPath pointing at the bundle
// until 1B integration lands the HTML reader.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mkdir, writeFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { buildBundleFromTranscript } from "./claude-adapter.mjs";
import {
  readPointer,
  readBaseline,
  readStableTranscript,
  collectRepository,
  hashChangedFiles,
  outDir as sessionOutDir,
  assertSafeSessionId,
} from "./capture.mjs";
import { stableStringify, sha256Of } from "./receipt.mjs";

// Resolve the most relevant session pointer if the caller did not name one:
// prefer an explicit id, else the single pointer under .explainify/sessions.
async function resolveSessionId(root, requested) {
  if (requested) return assertSafeSessionId(requested);
  const dir = path.join(root, ".explainify", "sessions");
  const ids = (await readdir(dir).catch(() => [])).filter((id) => /^[A-Za-z0-9._-]+$/.test(id) && id !== "." && id !== "..");
  if (ids.length === 1) return ids[0];
  if (ids.length === 0) throw new Error("No captured session pointer found; run the hook or pass session.id.");
  throw new Error(`Multiple sessions captured (${ids.join(", ")}); specify session.id.`);
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
  const repository = { ...repoBase, changedFiles };

  const { bundle } = buildBundleFromTranscript({
    transcript: text,
    transcriptSha256,
    session: { id: sessionId, cwd, captureEvent, finalMessageSha256 },
    // The caller's question/audience is REQUEST context, never the observed
    // objective (finding #3). The adapter derives objective from the session.
    request: { question: input.question, audience: input.audience },
    repository,
    receipts: [],
  });

  const outDir = input.outputDirectory
    ? await realpath(input.outputDirectory).catch(() => input.outputDirectory)
    : sessionOutDir(root, sessionId);
  await mkdir(outDir, { recursive: true });
  const bundlePath = path.join(outDir, "bundle.json");
  const bundleText = `${stableStringify(bundle)}\n`;
  await writeFile(bundlePath, bundleText, "utf8");

  const receipt = {
    schemaVersion: 1,
    sessionId,
    captureEvent,
    transcriptPath: pointer.transcriptPath,
    transcriptSha256,
    finalMessageSha256,
    bundlePath,
    bundleSha256: sha256Of(bundleText),
    manualPaste: false,
    excerptCount: bundle.excerpts.length,
    toolEventCount: bundle.toolEvents.length,
    redactionCount: bundle.privacy.redactionCount,
    deniedPathCount: bundle.privacy.deniedPathCount,
    secretScan: bundle.privacy.secretScan,
    publication: bundle.privacy.publication,
  };
  const receiptPath = path.join(outDir, "receipt.json");
  await writeFile(receiptPath, `${stableStringify(receipt)}\n`, "utf8");

  // Contract-shaped result. packagePath/artifactPath point at the bundle for now;
  // Phase 1B integration replaces artifactPath with the rendered local HTML.
  return {
    status: "verified",
    artifactPath: bundlePath,
    packagePath: bundlePath,
    receiptPath,
    openCommand: `explainify open ${bundlePath}`,
    publication: bundle.privacy.publication,
  };
}

const server = new McpServer({ name: "explainify-session", version: "0.1.0" });

server.registerTool(
  "explainify.explain_session",
  {
    title: "Explain this coding session",
    description:
      "Capture the current Claude Code session's bounded evidence (selected excerpts, tool events, git/test receipts) into a local SessionEvidenceBundle — no transcript copy/paste, local-only, secret-scanned. Returns local artifact/package/receipt paths.",
    inputSchema: {
      question: z.string().describe("What should the explanation answer?").default("What did this session do and why?"),
      session: z
        .object({ id: z.string().optional() })
        .optional()
        .describe("Optional session id; defaults to the current captured session."),
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
