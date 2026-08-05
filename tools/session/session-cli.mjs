#!/usr/bin/env node
// Explainify session capture CLI (Phase 1A). Provides reproducible, non-Claude
// access to the same capture the MCP tool performs, plus a validate command.
//
// Commands:
//   capture --session-id <id> --root <repo> [--transcript <path>] \
//           [--base <ref> --head <ref>] [--event stop|session_end|tool_call] \
//           [--out <dir>]
//       Resolve the session pointer (or explicit --transcript), read the stable
//       transcript, collect repository facts, build a SessionEvidenceBundle, and
//       write bundle.json + receipt.json under <out> (default .explainify/out/<id>).
//
//   validate --bundle <path>
//       Validate a bundle file against the frozen schema. Exit 0 iff valid.
//
//   write-pointer --session-id <id> --root <repo> --transcript <path> [--event ...]
//       Emit the local pointer a hook would write (for manual/fixture setup).
//
// The CLI never accepts credentials or an entire transcript as an argument; it
// reads the transcript from disk by path, exactly as the hook records it.

import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { buildBundleFromTranscript } from "./claude-adapter.mjs";
import { validateBundle } from "./bundle-schema.mjs";
import {
  readPointer,
  writePointer,
  readBaseline,
  readStableTranscript,
  collectRepository,
  hashChangedFiles,
  outDir as sessionOutDir,
  assertSafeSessionId,
} from "./capture.mjs";
import { stableStringify, sha256Of } from "./receipt.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    }
  }
  return args;
}

async function cmdCapture(args) {
  const sessionId = args["session-id"];
  const rootInput = args.root || process.cwd();
  if (!sessionId) throw new Error("capture requires --session-id");
  assertSafeSessionId(sessionId);
  const root = await realpath(rootInput).catch(() => rootInput);

  // Resolve transcript path: explicit flag, else the hook-written pointer.
  let transcriptPath = args.transcript;
  let captureEvent = args.event || "stop";
  let cwd = root;
  let expectFinalHash = null;
  if (!transcriptPath) {
    const pointer = await readPointer(root, sessionId);
    transcriptPath = pointer.transcriptPath;
    captureEvent = args.event || pointer.captureEvent || "stop";
    cwd = pointer.cwd || root;
    expectFinalHash = pointer.finalMessageSha256 || null;
  } else if (typeof args["final-message-sha"] === "string") {
    // Explicit-transcript path (fixture/manual): the completion marker must be
    // supplied by the caller, never re-derived from the transcript on disk.
    expectFinalHash = args["final-message-sha"];
  }
  // Finding #1: a completion capture (stop/session_end) must carry the
  // hook/caller-provided final-message hash. We never verify a completion event
  // against a transcript-derived marker.
  if ((captureEvent === "stop" || captureEvent === "session_end") && !expectFinalHash) {
    throw new Error(
      `capture of ${captureEvent} requires a recorded final-message hash (pointer.finalMessageSha256 or --final-message-sha); refusing to verify against a transcript-derived marker.`,
    );
  }
  const baseline = await readBaseline(root, sessionId);

  const { text, transcriptSha256, finalMessageSha256 } = await readStableTranscript(transcriptPath, { expectFinalHash });

  const repoBase = await collectRepository(root, { baseRef: args.base, headRef: args.head, baseline });
  const changedFiles = await hashChangedFiles(root, repoBase.changedFiles);
  const repository = { ...repoBase, changedFiles };

  const { bundle } = buildBundleFromTranscript({
    transcript: text,
    transcriptSha256,
    session: { id: sessionId, cwd, captureEvent, finalMessageSha256 },
    request: { question: args.question, audience: { role: args.role, technicalDepth: args.depth } },
    repository,
    receipts: [],
  });

  const outDir = args.out
    ? await realpath(args.out).catch(() => args.out)
    : sessionOutDir(root, sessionId);
  await mkdir(outDir, { recursive: true });
  const bundlePath = path.join(outDir, "bundle.json");
  const bundleText = `${stableStringify(bundle)}\n`;
  await writeFile(bundlePath, bundleText, "utf8");

  // Capture receipt: proves no manual paste (transcript read from disk by
  // path), records the whole-file transcript hash, the bundle hash, the secret
  // scan result, and publication scope. This is acceptance-gate evidence.
  const receipt = {
    schemaVersion: 1,
    sessionId,
    captureEvent,
    transcriptPath,
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

  process.stdout.write(
    JSON.stringify(
      {
        status: "verified",
        bundlePath,
        receiptPath,
        excerpts: bundle.excerpts.length,
        toolEvents: bundle.toolEvents.length,
        publication: bundle.privacy.publication,
      },
      null,
      2,
    ) + "\n",
  );
}

async function cmdValidate(args) {
  const file = args.bundle;
  if (!file) throw new Error("validate requires --bundle <path>");
  const raw = await readFile(file, "utf8");
  const { ok, errors } = validateBundle(JSON.parse(raw));
  if (ok) {
    process.stdout.write("valid\n");
    return;
  }
  process.stderr.write(`invalid:\n - ${errors.join("\n - ")}\n`);
  process.exitCode = 1;
}

async function cmdWritePointer(args) {
  const sessionId = args["session-id"];
  const root = await realpath(args.root || process.cwd()).catch(() => args.root || process.cwd());
  if (!sessionId || !args.transcript) throw new Error("write-pointer requires --session-id and --transcript");
  assertSafeSessionId(sessionId);
  const pointer = await writePointer(root, {
    sessionId,
    transcriptPath: args.transcript,
    cwd: args.cwd || root,
    captureEvent: args.event || "stop",
    finalMessageSha256: typeof args["final-message-sha"] === "string" ? args["final-message-sha"] : undefined,
  });
  process.stdout.write(`${JSON.stringify(pointer, null, 2)}\n`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  switch (cmd) {
    case "capture":
      return cmdCapture(args);
    case "validate":
      return cmdValidate(args);
    case "write-pointer":
      return cmdWritePointer(args);
    default:
      process.stderr.write(
        "usage: session-cli <capture|validate|write-pointer> [flags]\n",
      );
      process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`error: ${e.message}\n`);
  process.exitCode = 1;
});
