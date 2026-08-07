// Phase 1C integration seam: capture (1A producer) → synthesis (1B consumer).
//
// This is the single shared core that both the MCP tool and the CLI call so the
// live product path is proven, not two disconnected boundaries. It:
//   1. builds + validates the SessionEvidenceBundle from the stable transcript
//      and repository facts (1A producer, unchanged — assertBundle inside);
//   2. feeds that exact bundle into 1B `writeSessionArtifacts`, which re-validates
//      via the SAME `assertBundle` (no schema fork) and renders the local
//      index.html + workstream-package.json + receipt;
//   3. writes the capture bundle + capture receipt next to the rendered artifacts
//      and binds the whole lineage chain:
//        capture receipt → bundle → session package → HTML receipt
//      so a tamper anywhere in the chain is detectable.
//
// It never copies/pastes a transcript, calls a hosted API/model, or publishes
// remotely — the returned artifacts are all local, publication:local_only.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildBundleFromTranscript } from "./claude-adapter.mjs";
import { transcriptTimeRange } from "./capture.mjs";
import { stableStringify, sha256Of } from "./receipt.mjs";
import { writeSessionArtifacts } from "../session-synthesis/session-synthesis.mjs";
import { buildLatestPointer, writeLatestPointer } from "./latest-pointer.mjs";

/**
 * Build the capture bundle from an already-read stable transcript, then run 1B
 * synthesis and write all artifacts under `outDir`. Returns the contract-shaped
 * result plus the lineage receipt.
 *
 * @param {object} a
 * @param {string} a.text                stable transcript text (already quiescent + bound)
 * @param {string} a.transcriptSha256    whole-file transcript hash
 * @param {string} a.finalMessageSha256  hook-bound final assistant message hash (may be undefined for non-completion events)
 * @param {object} a.session             { id, cwd, captureEvent }
 * @param {object} a.request             { question, audience }
 * @param {object} a.repository          collected repository facts (with hashed changedFiles)
 * @param {string} a.transcriptPath      path the transcript was read from (for the capture receipt)
 * @param {string} a.outDir              absolute output directory
 * @returns {Promise<object>} contract-shaped result with lineage
 */
export async function captureAndSynthesize(a) {
  // startedAt/endedAt are derived from the transcript's own record timestamps —
  // immutable evidence, deterministic, and already-reserved optional schema
  // fields. 1B requires a freshness cursor (startedAt||endedAt), so a bundle with
  // neither cannot be synthesized; deriving them from the transcript closes that
  // gap without forking the schema or inventing a value.
  const timeRange = transcriptTimeRange(a.text);

  const { bundle } = buildBundleFromTranscript({
    transcript: a.text,
    transcriptSha256: a.transcriptSha256,
    session: {
      id: a.session.id,
      cwd: a.session.cwd,
      captureEvent: a.session.captureEvent,
      ...(a.finalMessageSha256 ? { finalMessageSha256: a.finalMessageSha256 } : {}),
      ...(timeRange.startedAt ? { startedAt: timeRange.startedAt } : {}),
      ...(timeRange.endedAt ? { endedAt: timeRange.endedAt } : {}),
    },
    request: a.request,
    repository: a.repository,
    receipts: [],
  });

  await mkdir(a.outDir, { recursive: true });

  // Persist the capture bundle + capture receipt (1A lineage roots) next to the
  // rendered artifacts.
  const bundlePath = path.join(a.outDir, "bundle.json");
  const bundleText = `${stableStringify(bundle)}\n`;
  await writeFile(bundlePath, bundleText, "utf8");
  const bundleSha256 = sha256Of(bundleText);

  // The capture receipt's CONTENT identity — a location-independent projection
  // that binds the capture to the transcript + bundle by content hash, never by
  // absolute path. This is what the lineage chain binds, so it stays deterministic
  // and relocatable (a different output dir or host does not change it). Absolute
  // paths are recorded separately below as provenance metadata, outside this hash.
  const captureContent = {
    schemaVersion: 1,
    sessionId: a.session.id,
    captureEvent: a.session.captureEvent,
    transcriptSha256: a.transcriptSha256,
    ...(a.finalMessageSha256 ? { finalMessageSha256: a.finalMessageSha256 } : {}),
    bundleSha256,
    manualPaste: false,
    excerptCount: bundle.excerpts.length,
    toolEventCount: bundle.toolEvents.length,
    redactionCount: bundle.privacy.redactionCount,
    deniedPathCount: bundle.privacy.deniedPathCount,
    secretScan: bundle.privacy.secretScan,
    publication: bundle.privacy.publication,
  };
  const captureContentSha256 = sha256Of(stableStringify(captureContent));

  const captureReceipt = {
    ...captureContent,
    // Provenance metadata (environment-specific; NOT part of contentSha256):
    transcriptPath: a.transcriptPath,
    bundlePath,
    contentSha256: captureContentSha256,
  };
  const captureReceiptPath = path.join(a.outDir, "capture-receipt.json");
  await writeFile(captureReceiptPath, `${stableStringify(captureReceipt)}\n`, "utf8");

  // 1B synthesis: re-validates the bundle via the shared assertBundle, renders
  // index.html + workstream-package.json + receipt.json into outDir.
  const synth = await writeSessionArtifacts(bundle, a.outDir);

  // Lineage receipt: binds capture → bundle → session package → HTML receipt.
  // Each hop names the hash of the previous artifact so a tamper anywhere breaks
  // the chain (verified by integration tamper negatives).
  const lineageCore = {
    schemaVersion: 1,
    status: "verified",
    sessionId: a.session.id,
    captureEvent: a.session.captureEvent,
    transcriptSha256: a.transcriptSha256,
    ...(a.finalMessageSha256 ? { finalMessageSha256: a.finalMessageSha256 } : {}),
    bundleSha256,
    // Bind the capture by its location-independent CONTENT identity, not the
    // on-disk receipt file (which carries absolute paths and would make the
    // whole lineage vary by output directory). The capture-receipt file records
    // this same value as contentSha256, so a tampered receipt is still detectable.
    captureContentSha256,
    checkpointId: synth.checkpointId,
    sessionSha256: synth.receipt.sessionSha256,
    packageSha256: synth.receipt.packageSha256,
    artifactSha256: synth.receipt.artifactSha256,
    htmlReceiptSha256: synth.receipt.receiptSha256,
    manualPaste: false,
    publication: bundle.privacy.publication,
    secretScan: bundle.privacy.secretScan,
    files: {
      bundle: "bundle.json",
      captureReceipt: "capture-receipt.json",
      artifact: "index.html",
      package: "workstream-package.json",
      htmlReceipt: "receipt.json",
      lineageReceipt: "lineage-receipt.json",
    },
  };
  const lineageReceipt = { ...lineageCore, lineageReceiptSha256: sha256Of(stableStringify(lineageCore)) };
  const lineageReceiptPath = path.join(a.outDir, "lineage-receipt.json");
  await writeFile(lineageReceiptPath, `${stableStringify(lineageReceipt)}\n`, "utf8");

  // R6: write `.explainify/latest.json` — the "last VERIFIED artifact" pointer —
  // ONLY now, after the whole lineage validated. Atomic (temp + rename) so a
  // failed/partial run can never overwrite a good pointer, and a reader never sees
  // a half-written file. Bind it to the repo root (not outDir) so recovery tooling
  // has one well-known location. Bound to changeStorySha256 when this is a v2 run.
  let latestPath = null;
  const pointerRoot = a.repository?.root || a.session?.cwd;
  if (pointerRoot) {
    const outputRelDir = path.isAbsolute(a.outDir) && path.isAbsolute(pointerRoot)
      ? path.relative(pointerRoot, a.outDir)
      : a.outDir;
    const pointer = buildLatestPointer({
      lineage: { ...lineageReceipt, changeStorySha256: synth.receipt.changeStorySha256 },
      outputRelDir,
      completedAt: a.completedAt, // provenance only; may be undefined in deterministic paths
    });
    // Best-effort: the artifact/package/receipt are already written and verified.
    // The latest pointer is a convenience/recovery aid, so a write failure (e.g. an
    // unwritable root) must NOT undo an otherwise-verified run — we just omit it.
    try {
      latestPath = await writeLatestPointer(pointerRoot, pointer);
    } catch {
      latestPath = null;
    }
  }

  // Contract-shaped result: artifactPath is now the rendered local HTML (Phase 1C
  // fulfils the acceptance criterion that the tool returns the final artifact,
  // not only the bundle), while bundle/receipt lineage is retained.
  return {
    status: "verified",
    artifactPath: synth.artifactPath,
    packagePath: synth.packagePath,
    htmlReceiptPath: synth.receiptPath,
    bundlePath,
    captureReceiptPath,
    lineageReceiptPath,
    ...(latestPath ? { latestPath } : {}),
    openCommand: synth.openCommand,
    checkpointId: synth.checkpointId,
    publication: bundle.privacy.publication,
  };
}
