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

const HEX64 = /^[0-9a-f]{64}$/;
// The exact, ordered set of core fields a pointer may carry (plus the optional
// changeStorySha256). The reader rejects any unknown or missing field so a pointer
// cannot smuggle extra state or omit a bound identity (blocker #2).
const REQUIRED_CORE_FIELDS = [
  "schemaVersion", "status", "sessionId", "checkpointId",
  "bundleSha256", "captureContentSha256", "packageSha256", "artifactSha256", "receiptSha256",
  "lineageReceiptSha256", "outputDir", "completedAt", "files",
];
const OPTIONAL_CORE_FIELDS = ["changeStorySha256"];
// The complete verified chain the lineage receipt promises: bundle → capture
// receipt → artifact/package → HTML receipt → lineage receipt. The pointer binds
// and the reader checks EVERY link, so deleting any one (e.g. bundle.json) is
// staleness, never a silent ok:true/stale:false (Codex blocker #4).
const REQUIRED_FILE_KEYS = ["bundle", "captureReceipt", "artifact", "package", "htmlReceipt", "lineageReceipt"];

/**
 * Build the canonical, self-binding latest pointer from a verified lineage.
 * `completedAt` is MANDATORY (blocker #2) and BOUND into the pointer identity
 * (finding #4): a reader recomputes the self-hash and catches any edit of the
 * recorded completion time. The caller sources it deterministically (transcript
 * endedAt), never Date.now(). Every identity/hash/file field is always present so
 * the reader can reject a pointer that omits any of them.
 */
export function buildLatestPointer({ lineage, outputRelDir, completedAt }) {
  if (!completedAt || typeof completedAt !== "string") {
    throw new Error("buildLatestPointer: completedAt (ISO string) is required");
  }
  const core = {
    schemaVersion: LATEST_SCHEMA_VERSION,
    status: "verified",
    sessionId: lineage.sessionId,
    checkpointId: lineage.checkpointId,
    // The bound artifact identities (any of these missing/mismatched ⇒ stale).
    // bundle + capture receipt are the lineage ROOTS; binding them here means a
    // deleted/edited bundle.json or capture-receipt.json is caught as stale
    // (blocker #4), not silently reported fresh.
    bundleSha256: lineage.bundleSha256,
    captureContentSha256: lineage.captureContentSha256,
    packageSha256: lineage.packageSha256,
    artifactSha256: lineage.artifactSha256,
    receiptSha256: lineage.htmlReceiptSha256,
    ...(lineage.changeStorySha256 ? { changeStorySha256: lineage.changeStorySha256 } : {}),
    lineageReceiptSha256: lineage.lineageReceiptSha256,
    outputDir: outputRelDir,
    // completedAt is bound provenance (finding #4): tampering it must be detected.
    completedAt,
    files: {
      bundle: "bundle.json",
      captureReceipt: "capture-receipt.json",
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

// outputDir must be the run's own `.explainify/out/<sessionId>` subtree — a
// relative path, no absolute path, no `..` escape, and exactly the expected
// segments for this session (blocker #2). Returns the resolved absolute dir, or
// null if it is anything else.
function safeOutputDir(root, outputDir, sessionId) {
  if (typeof outputDir !== "string" || outputDir.length === 0) return null;
  if (path.isAbsolute(outputDir)) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, outputDir);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  // Constrain to the expected .explainify/out/<sessionId> location, not merely
  // anywhere under the repo. Compare on normalized path segments.
  const expected = path.join(".explainify", "out", String(sessionId || ""));
  if (path.normalize(rel) !== path.normalize(expected)) return null;
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
  // Strict shape: a self-consistent pointer must still carry EXACTLY the expected
  // fields with the right types/values before any staleness check runs (blocker
  // #2). Reject unknown or missing fields, a wrong schema/status, non-hex hashes,
  // a missing/blank completedAt, or a malformed files map — fail closed.
  const bad = (error) => ({ present: true, ok: false, reason: "malformed", error });
  const coreKeys = Object.keys(core);
  for (const k of coreKeys) {
    if (!REQUIRED_CORE_FIELDS.includes(k) && !OPTIONAL_CORE_FIELDS.includes(k)) return bad(`unknown field "${k}"`);
  }
  for (const k of REQUIRED_CORE_FIELDS) {
    if (!(k in core)) return bad(`missing required field "${k}"`);
  }
  if (core.schemaVersion !== LATEST_SCHEMA_VERSION) return bad(`unsupported schemaVersion ${core.schemaVersion}`);
  if (core.status !== "verified") return bad(`status must be "verified" (a pointer is only written for a verified run)`);
  if (typeof core.sessionId !== "string" || core.sessionId.length === 0) return bad("sessionId is required");
  if (typeof core.checkpointId !== "string" || core.checkpointId.length === 0) return bad("checkpointId is required");
  for (const hk of ["bundleSha256", "captureContentSha256", "packageSha256", "artifactSha256", "receiptSha256", "lineageReceiptSha256"]) {
    if (!HEX64.test(core[hk])) return bad(`${hk} must be a sha-256 hex string`);
  }
  if ("changeStorySha256" in core && !HEX64.test(core.changeStorySha256)) return bad("changeStorySha256 must be a sha-256 hex string");
  if (typeof core.completedAt !== "string" || core.completedAt.length === 0) return bad("completedAt is required");

  const files = core.files;
  if (!files || typeof files !== "object" || Array.isArray(files)) return bad("files map is required");
  for (const key of Object.keys(files)) {
    if (!REQUIRED_FILE_KEYS.includes(key)) return bad(`unknown files entry "${key}"`);
  }
  for (const key of REQUIRED_FILE_KEYS) {
    if (!isSafeName(files[key])) return bad(`files.${key} must be a plain filename under outputDir`);
  }

  // Path integrity: outputDir must be exactly this run's .explainify/out/<sessionId>
  // subtree — not merely anywhere under the repo (blocker #2).
  const dir = safeOutputDir(root, core.outputDir, core.sessionId);
  if (dir === null) {
    return bad("outputDir must be the run's .explainify/out/<sessionId> subtree");
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

  await checkFileContent(files.artifact, core.artifactSha256, "artifact (index.html)");
  await checkFileContent(files.package, core.packageSha256, "package (workstream-package.json)");
  // Bundle is written as canonical text and bound by whole-file content hash, so a
  // deleted or edited bundle.json is stale (blocker #4) — never silently fresh.
  await checkFileContent(files.bundle, core.bundleSha256, "bundle (bundle.json)");

  // Capture receipt is bound by its location-independent CONTENT identity
  // (contentSha256), not a whole-file hash (it carries absolute provenance paths).
  // A deleted, unreadable, malformed, or content-drifted capture receipt is stale.
  {
    try {
      const obj = JSON.parse(await readOut(files.captureReceipt));
      if (!obj || typeof obj !== "object" || typeof obj.contentSha256 !== "string") {
        staleReasons.push("capture receipt (capture-receipt.json) is malformed on disk");
      } else if (obj.contentSha256 !== core.captureContentSha256) {
        staleReasons.push("capture receipt no longer binds the verified capture content");
      }
    } catch (e) {
      staleReasons.push(e && e.code === "ENOENT" ? "capture receipt (capture-receipt.json) is missing on disk" : "capture receipt (capture-receipt.json) is not readable JSON");
    }
  }

  // HTML receipt: it is always bound (strict shape guaranteed it above), so its
  // absence is a stale signal. Its recomputed self-hash must equal what the pointer
  // bound, and its own package/artifact/story hashes must match — a receipt deleted
  // or swapped in from another run is stale even if internally self-consistent.
  {
    const r = await recomputeReceipt(files.htmlReceipt, "receiptSha256", "HTML receipt (receipt.json)");
    if (r) {
      if (r.self !== core.receiptSha256) staleReasons.push("HTML receipt self-hash does not match the verified pointer");
      if (r.core.packageSha256 !== core.packageSha256) staleReasons.push("HTML receipt no longer binds the verified package");
      if (r.core.artifactSha256 !== core.artifactSha256) staleReasons.push("HTML receipt no longer binds the verified artifact");
      if ("changeStorySha256" in core && r.core.changeStorySha256 !== core.changeStorySha256) {
        staleReasons.push("HTML receipt no longer binds the verified change story");
      }
    }
  }

  // Lineage receipt: recompute its self-hash, match it to the pointer, and confirm
  // its internal references still name the same bundle/package/artifact/html-receipt
  // and belong to the same session (a stale prior-session pointer is caught here).
  {
    const l = await recomputeReceipt(files.lineageReceipt, "lineageReceiptSha256", "lineage receipt (lineage-receipt.json)");
    if (l) {
      if (l.self !== core.lineageReceiptSha256) staleReasons.push("lineage receipt self-hash does not match the verified pointer");
      if (l.core.bundleSha256 !== core.bundleSha256) staleReasons.push("lineage receipt no longer binds the verified bundle");
      if (l.core.packageSha256 !== core.packageSha256) staleReasons.push("lineage receipt no longer binds the verified package");
      if (l.core.artifactSha256 !== core.artifactSha256) staleReasons.push("lineage receipt no longer binds the verified artifact");
      if (l.core.htmlReceiptSha256 !== core.receiptSha256) staleReasons.push("lineage receipt no longer binds the verified HTML receipt");
      if (l.core.sessionId !== core.sessionId) staleReasons.push("lineage receipt belongs to a different session (stale prior-session pointer)");
      if (l.core.checkpointId !== core.checkpointId) staleReasons.push("lineage receipt names a different checkpoint (stale prior-session pointer)");
    }
  }

  return { present: true, ok: true, stale: staleReasons.length > 0, staleReasons, pointer };
}
