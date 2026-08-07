// Phase 1E R6 — `.explainify/latest.json`, the "last VERIFIED artifact" pointer.
//
// Contract:
//  - It is written ONLY after the artifact/package/receipt hashes validated (the
//    caller passes an already-verified lineage). A failed run never writes it, so
//    it can never point at a partial/failed attempt.
//  - The write is atomic: a temp file in the same directory + rename, so a reader
//    never observes a half-written pointer, and a crash mid-write leaves the prior
//    verified pointer intact.
//  - It is self-binding: latestSha256 = sha256(stableStringify(core)). The reader
//    recomputes it and reports tamper.
//  - The reader also reports STALENESS: the pointer names its output files by
//    relative path + their bound hashes; if the on-disk artifact/package/receipt
//    no longer match, the pointer is stale (the output was regenerated or edited
//    without updating the pointer), which is distinct from a tampered pointer.
//
// This module has no network and no dependency beyond node core + the shared
// stable hashers, so it runs inside the zero-build plugin runtime.

import { writeFile, rename, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { stableStringify, sha256Of } from "./receipt.mjs";

export const LATEST_SCHEMA_VERSION = 1;

// The pointer's directory, relative to the repo root the capture ran against.
export function latestPath(root) {
  return path.join(root, ".explainify", "latest.json");
}

/**
 * Build the canonical, self-binding latest pointer from a verified lineage.
 * `completedAt` MUST be supplied by the caller (no Date.now() in the runtime path
 * that must stay deterministic under test/resume); it is provenance only and is
 * NOT part of the bound identity so two verified runs of the same session compare
 * equal on their bound hashes.
 */
export function buildLatestPointer({ lineage, outputRelDir, completedAt }) {
  const core = {
    schemaVersion: LATEST_SCHEMA_VERSION,
    status: "verified",
    sessionId: lineage.sessionId,
    checkpointId: lineage.checkpointId,
    // The bound artifact identities (any of these missing/mismatched ⇒ stale).
    bundleSha256: lineage.bundleSha256,
    packageSha256: lineage.packageSha256,
    artifactSha256: lineage.artifactSha256,
    receiptSha256: lineage.htmlReceiptSha256,
    ...(lineage.changeStorySha256 ? { changeStorySha256: lineage.changeStorySha256 } : {}),
    lineageReceiptSha256: lineage.lineageReceiptSha256,
    outputDir: outputRelDir,
    files: {
      artifact: "index.html",
      package: "workstream-package.json",
      htmlReceipt: "receipt.json",
      lineageReceipt: "lineage-receipt.json",
    },
  };
  const latestSha256 = sha256Of(stableStringify(core));
  // completedAt is provenance metadata, deliberately OUTSIDE the bound core.
  return { ...core, ...(completedAt ? { completedAt } : {}), latestSha256 };
}

/**
 * Atomically write the latest pointer. Temp file in the SAME directory (so rename
 * is atomic on the same filesystem) then rename over the target. The caller has
 * already verified the lineage; this function does not decide verification.
 */
export async function writeLatestPointer(root, pointer) {
  const target = latestPath(root);
  await mkdir(path.dirname(target), { recursive: true });
  // A distinct, collision-resistant temp name that does not depend on Date.now()/
  // random (unavailable in the deterministic runtime): bind it to the content.
  const tmp = path.join(path.dirname(target), `.latest.${pointer.latestSha256.slice(0, 16)}.tmp`);
  await writeFile(tmp, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  await rename(tmp, target);
  return target;
}

/**
 * Read + verify the latest pointer. Returns a structured status:
 *   { present:false }                                   — no pointer yet
 *   { present:true, ok:false, reason:"unreadable"|"malformed"|"tampered" }
 *   { present:true, ok:true, stale:boolean, staleReasons:[...], pointer }
 * "tampered" = the pointer's own self-hash does not recompute (someone edited it).
 * "stale"    = the pointer is internally intact but an on-disk output it names no
 *              longer matches its bound hash (regenerated/edited without update).
 */
export async function readLatestPointer(root) {
  const target = latestPath(root);
  let raw;
  try {
    raw = await readFile(target, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") return { present: false };
    return { present: true, ok: false, reason: "unreadable", error: e?.message };
  }
  let pointer;
  try {
    pointer = JSON.parse(raw);
  } catch {
    return { present: true, ok: false, reason: "malformed" };
  }
  if (!pointer || typeof pointer !== "object" || typeof pointer.latestSha256 !== "string") {
    return { present: true, ok: false, reason: "malformed" };
  }
  const { latestSha256, completedAt, ...core } = pointer;
  if (sha256Of(stableStringify(core)) !== latestSha256) {
    return { present: true, ok: false, reason: "tampered" };
  }
  // Staleness: verify each named on-disk output still matches its bound hash. Only
  // artifact + package are bound by FILE-CONTENT hash (the receipt's bound hash is
  // a self-hash of its JSON core, not the file bytes), so those two are the honest
  // file-content staleness signals; an edit or regeneration of either flips stale.
  const dir = path.isAbsolute(pointer.outputDir) ? pointer.outputDir : path.join(root, pointer.outputDir || ".");
  const staleReasons = [];
  const checkFile = async (rel, boundSha, label) => {
    if (!boundSha || !rel) return;
    try {
      const text = await readFile(path.join(dir, rel), "utf8");
      if (sha256Of(text) !== boundSha) staleReasons.push(`${label} on disk no longer matches the verified hash`);
    } catch {
      staleReasons.push(`${label} is missing on disk`);
    }
  };
  await checkFile(pointer.files?.artifact, pointer.artifactSha256, "artifact (index.html)");
  await checkFile(pointer.files?.package, pointer.packageSha256, "package (workstream-package.json)");
  return { present: true, ok: true, stale: staleReasons.length > 0, staleReasons, pointer };
}
