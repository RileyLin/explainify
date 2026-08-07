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
 * that must stay deterministic under test/resume). It is BOUND into the pointer
 * identity (finding #4): a reader that recomputes the self-hash will catch any
 * edit of the recorded completion time. When it is omitted (the deterministic
 * path), it is absent from the core and two such runs still compare equal.
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
    // completedAt is bound provenance (finding #4): tampering it must be detected.
    ...(completedAt ? { completedAt } : {}),
    files: {
      artifact: "index.html",
      package: "workstream-package.json",
      htmlReceipt: "receipt.json",
      lineageReceipt: "lineage-receipt.json",
    },
  };
  const latestSha256 = sha256Of(stableStringify(core));
  return { ...core, latestSha256 };
}

// A bound output filename must be a plain basename within outputDir — never an
// absolute path, a parent traversal, or a nested path — so the pointer can only
// name files inside the repo's own output tree (finding #4).
function isSafeName(name) {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    !path.isAbsolute(name) &&
    !name.includes("/") &&
    !name.includes("\\") &&
    name !== ".." &&
    name !== "."
  );
}

// outputDir must be a relative path that stays under the repo root (no absolute
// path, no `..` escape). Returns the resolved absolute dir, or null if unsafe.
function safeOutputDir(root, outputDir) {
  if (typeof outputDir !== "string" || outputDir.length === 0) return null;
  if (path.isAbsolute(outputDir)) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, outputDir);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel === "" ) return resolvedRoot;
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
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
  const { latestSha256, ...core } = pointer;
  if (sha256Of(stableStringify(core)) !== latestSha256) {
    return { present: true, ok: false, reason: "tampered" };
  }
  // Shape/path integrity: the pointer may only name files under the repo's own
  // output tree. An absolute or traversing outputDir, or a bound filename that is
  // not a plain basename, is malformed — a self-consistent pointer that still
  // tries to read outside the repo (finding #4).
  const dir = safeOutputDir(root, pointer.outputDir);
  if (dir === null) {
    return { present: true, ok: false, reason: "malformed", error: "outputDir must be a relative path under the repo root" };
  }
  const files = pointer.files;
  if (!files || typeof files !== "object") {
    return { present: true, ok: false, reason: "malformed", error: "files map is required" };
  }
  for (const key of ["artifact", "package", "htmlReceipt", "lineageReceipt"]) {
    if (files[key] !== undefined && !isSafeName(files[key])) {
      return { present: true, ok: false, reason: "malformed", error: `files.${key} must be a plain filename under outputDir` };
    }
  }

  // Staleness: verify each named on-disk output still matches what the pointer
  // bound. artifact + package are bound by FILE-CONTENT hash. The two RECEIPTS are
  // bound by their own self-hash core, so for those we parse the file, strip the
  // self-hash field, recompute the core hash, and require it to match BOTH the
  // file's own self-hash field AND the hash the pointer bound — and we check the
  // lineage receipt's internal references still name the same bundle/package/
  // artifact/html-receipt the pointer trusts (finding #4). Any drift = stale.
  const staleReasons = [];
  const readOut = async (rel) => readFile(path.join(dir, rel), "utf8");

  const checkFileContent = async (rel, boundSha, label) => {
    if (!boundSha || !rel) return;
    try {
      const text = await readOut(rel);
      if (sha256Of(text) !== boundSha) staleReasons.push(`${label} on disk no longer matches the verified hash`);
    } catch {
      staleReasons.push(`${label} is missing on disk`);
    }
  };

  // Recompute a receipt file's self-hash: parse, remove its self-hash field,
  // stableStringify the remaining core, sha256 it. Returns { core, self } or null.
  const recomputeReceipt = async (rel, selfField, label) => {
    let obj;
    try {
      obj = JSON.parse(await readOut(rel));
    } catch (e) {
      staleReasons.push(e && e.code === "ENOENT" ? `${label} is missing on disk` : `${label} is not readable JSON`);
      return null;
    }
    if (!obj || typeof obj !== "object" || typeof obj[selfField] !== "string") {
      staleReasons.push(`${label} is malformed on disk`);
      return null;
    }
    const { [selfField]: self, ...core } = obj;
    if (sha256Of(stableStringify(core)) !== self) {
      staleReasons.push(`${label} self-hash no longer recomputes (edited on disk)`);
      return null;
    }
    return { core, self, obj };
  };

  await checkFileContent(files.artifact, pointer.artifactSha256, "artifact (index.html)");
  await checkFileContent(files.package, pointer.packageSha256, "package (workstream-package.json)");

  // HTML receipt: its recomputed self-hash must equal what the pointer bound, and
  // its own package/artifact hashes must match the pointer's (a receipt swapped in
  // from another run is stale even if internally self-consistent).
  if (pointer.receiptSha256 && files.htmlReceipt) {
    const r = await recomputeReceipt(files.htmlReceipt, "receiptSha256", "HTML receipt (receipt.json)");
    if (r) {
      if (r.self !== pointer.receiptSha256) staleReasons.push("HTML receipt self-hash does not match the verified pointer");
      if (r.core.packageSha256 !== pointer.packageSha256) staleReasons.push("HTML receipt no longer binds the verified package");
      if (r.core.artifactSha256 !== pointer.artifactSha256) staleReasons.push("HTML receipt no longer binds the verified artifact");
      if (pointer.changeStorySha256 && r.core.changeStorySha256 !== pointer.changeStorySha256) {
        staleReasons.push("HTML receipt no longer binds the verified change story");
      }
    }
  }

  // Lineage receipt: recompute its self-hash, match it to the pointer, and confirm
  // its internal references still name the same bundle/package/artifact/html-receipt
  // and belong to the same session (a stale prior-session pointer is caught here).
  if (pointer.lineageReceiptSha256 && files.lineageReceipt) {
    const l = await recomputeReceipt(files.lineageReceipt, "lineageReceiptSha256", "lineage receipt (lineage-receipt.json)");
    if (l) {
      if (l.self !== pointer.lineageReceiptSha256) staleReasons.push("lineage receipt self-hash does not match the verified pointer");
      if (l.core.bundleSha256 !== pointer.bundleSha256) staleReasons.push("lineage receipt no longer binds the verified bundle");
      if (l.core.packageSha256 !== pointer.packageSha256) staleReasons.push("lineage receipt no longer binds the verified package");
      if (l.core.artifactSha256 !== pointer.artifactSha256) staleReasons.push("lineage receipt no longer binds the verified artifact");
      if (l.core.htmlReceiptSha256 !== pointer.receiptSha256) staleReasons.push("lineage receipt no longer binds the verified HTML receipt");
      if (pointer.sessionId && l.core.sessionId !== pointer.sessionId) staleReasons.push("lineage receipt belongs to a different session (stale prior-session pointer)");
      if (pointer.checkpointId && l.core.checkpointId !== pointer.checkpointId) staleReasons.push("lineage receipt names a different checkpoint (stale prior-session pointer)");
    }
  }

  return { present: true, ok: true, stale: staleReasons.length > 0, staleReasons, pointer };
}
