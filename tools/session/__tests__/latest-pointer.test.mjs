// Phase 1E R6 — `.explainify/latest.json` reliability tests: atomic write, honest
// "last verified" semantics, self-hash tamper detection, on-disk staleness, and
// the invariant that a failed run never overwrites a good pointer.
// Deterministic: a real temp dir, no git, no network.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildLatestPointer,
  writeLatestPointer,
  readLatestPointer,
  latestPath,
} from "../latest-pointer.mjs";
import { captureAndSynthesize } from "../integrate.mjs";
import { createHash } from "node:crypto";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

const LINEAGE = {
  sessionId: "s1",
  checkpointId: "checkpoint-abc",
  bundleSha256: "1".repeat(64),
  packageSha256: "2".repeat(64),
  artifactSha256: "3".repeat(64),
  htmlReceiptSha256: "4".repeat(64),
  changeStorySha256: "5".repeat(64),
  lineageReceiptSha256: "6".repeat(64),
};

test("buildLatestPointer binds completedAt into the self-hash (finding #4)", () => {
  const a = buildLatestPointer({ lineage: LINEAGE, outputRelDir: ".explainify/out/s1", completedAt: "2026-08-07T10:00:00Z" });
  const b = buildLatestPointer({ lineage: LINEAGE, outputRelDir: ".explainify/out/s1", completedAt: "2026-08-07T23:59:00Z" });
  assert.equal(a.status, "verified");
  // completedAt is now part of the bound identity: a different time ⇒ a different
  // self-hash, so an edit of the recorded completion time is detectable.
  assert.notEqual(a.latestSha256, b.latestSha256, "the bound identity includes completedAt");
  assert.equal(a.completedAt, "2026-08-07T10:00:00Z");
  // The deterministic path (no completedAt) is still stable and self-consistent.
  const c = buildLatestPointer({ lineage: LINEAGE, outputRelDir: ".explainify/out/s1" });
  const d = buildLatestPointer({ lineage: LINEAGE, outputRelDir: ".explainify/out/s1" });
  assert.equal(c.latestSha256, d.latestSha256, "two completedAt-less runs compare equal");
  assert.equal(c.completedAt, undefined);
});

test("write is atomic (no leftover temp files) and read verifies a clean pointer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-latest-"));
  try {
    const pointer = buildLatestPointer({ lineage: LINEAGE, outputRelDir: "out" });
    const target = await writeLatestPointer(root, pointer);
    assert.equal(target, latestPath(root));
    const entries = await readdir(path.join(root, ".explainify"));
    assert.ok(entries.includes("latest.json"), "latest.json exists");
    assert.ok(!entries.some((e) => e.endsWith(".tmp")), "no temp file left behind");
    const res = await readLatestPointer(root);
    assert.equal(res.present, true);
    assert.equal(res.ok, true);
    assert.equal(res.pointer.sessionId, "s1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reader reports absent when there is no pointer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-latest-"));
  try {
    assert.deepEqual(await readLatestPointer(root), { present: false });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reader detects a TAMPERED pointer (self-hash no longer recomputes)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-latest-"));
  try {
    await writeLatestPointer(root, buildLatestPointer({ lineage: LINEAGE, outputRelDir: "out" }));
    const p = latestPath(root);
    const obj = JSON.parse(await readFile(p, "utf8"));
    obj.artifactSha256 = "0".repeat(64); // repoint without recomputing latestSha256
    await writeFile(p, JSON.stringify(obj, null, 2));
    const res = await readLatestPointer(root);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "tampered");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reader detects a MALFORMED pointer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-latest-"));
  try {
    const p = latestPath(root);
    await writeLatestPointer(root, buildLatestPointer({ lineage: LINEAGE, outputRelDir: "out" }));
    await writeFile(p, "{not json");
    const res = await readLatestPointer(root);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "malformed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reader flags STALENESS when an on-disk output no longer matches the verified hash", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-latest-"));
  try {
    // Lay down real outputs whose hashes the pointer will bind.
    const outRel = "out";
    const outAbs = path.join(root, outRel);
    await rm(outAbs, { recursive: true, force: true });
    const { mkdir } = await import("node:fs/promises");
    await mkdir(outAbs, { recursive: true });
    const artifact = "<html>ok</html>";
    const pkg = "{\"packageVersion\":2}";
    await writeFile(path.join(outAbs, "index.html"), artifact);
    await writeFile(path.join(outAbs, "workstream-package.json"), pkg);
    const { sha256Of, stableStringify } = await import("../receipt.mjs");
    const artifactSha256 = sha256(artifact);
    const packageSha256 = sha256(pkg);
    // Real self-consistent receipt files so the clean read is genuinely non-stale
    // under the stricter reader (it recomputes both receipts' self-hashes).
    const htmlReceiptCore = { schemaVersion: 1, status: "verified", checkpointId: "checkpoint-abc", packageSha256, artifactSha256, sessionSha256: "9".repeat(64), changeStorySha256: LINEAGE.changeStorySha256 };
    const htmlReceipt = { ...htmlReceiptCore, receiptSha256: sha256Of(stableStringify(htmlReceiptCore)) };
    await writeFile(path.join(outAbs, "receipt.json"), `${JSON.stringify(htmlReceipt, null, 2)}\n`);
    const lineageCore = { schemaVersion: 1, status: "verified", sessionId: "s1", checkpointId: "checkpoint-abc", bundleSha256: LINEAGE.bundleSha256, packageSha256, artifactSha256, htmlReceiptSha256: htmlReceipt.receiptSha256 };
    const lineageReceipt = { ...lineageCore, lineageReceiptSha256: sha256Of(stableStringify(lineageCore)) };
    await writeFile(path.join(outAbs, "lineage-receipt.json"), `${JSON.stringify(lineageReceipt, null, 2)}\n`);
    const lineage = { ...LINEAGE, artifactSha256, packageSha256, htmlReceiptSha256: htmlReceipt.receiptSha256, lineageReceiptSha256: lineageReceipt.lineageReceiptSha256 };
    await writeLatestPointer(root, buildLatestPointer({ lineage, outputRelDir: outRel }));
    // Clean read: not stale.
    let res = await readLatestPointer(root);
    assert.equal(res.ok, true);
    assert.equal(res.stale, false);
    // Edit the artifact on disk without updating the pointer → stale.
    await writeFile(path.join(outAbs, "index.html"), "<html>EDITED</html>");
    res = await readLatestPointer(root);
    assert.equal(res.ok, true, "pointer itself is still intact");
    assert.equal(res.stale, true);
    assert.ok(res.staleReasons.some((r) => /artifact/.test(r)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed run never overwrites a good pointer (best-effort write only on verified lineage)", async () => {
  // The seam only calls writeLatestPointer AFTER a verified lineage, and wraps it
  // best-effort. Prove the good pointer survives a subsequent write to an
  // unwritable root (simulating a failed attempt's environment).
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-latest-"));
  try {
    const good = buildLatestPointer({ lineage: LINEAGE, outputRelDir: "out" });
    await writeLatestPointer(root, good);
    const before = await readFile(latestPath(root), "utf8");
    // A failed attempt would not reach writeLatestPointer at all; simulate a
    // write that throws (nonexistent nested root the caller catches) and confirm
    // the existing pointer is untouched.
    let threw = false;
    try {
      await writeLatestPointer(path.join(root, "no", "such", "\0bad"), good);
    } catch {
      threw = true;
    }
    assert.ok(threw, "an unwritable target throws (the seam catches this)");
    const after = await readFile(latestPath(root), "utf8");
    assert.equal(before, after, "the previously-verified pointer is unchanged");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Shared e2e helper: run a real capture+synthesis into <root>/.explainify/out/s1
// so a verified receipt.json + lineage-receipt.json + latest.json exist on disk.
const FEATURE = [
  { type: "user", uuid: "u1", timestamp: "2026-08-07T10:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "Add a maxLength option to slugify and test it." }] } },
  { type: "assistant", uuid: "a1", timestamp: "2026-08-07T10:01:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "Adding maxLength truncation then trimming a trailing hyphen." }] } },
  { type: "assistant", uuid: "a3", timestamp: "2026-08-07T10:04:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "slugify updated and covered." }] } },
];
async function runE2E(root) {
  const outDir = path.join(root, ".explainify", "out", "s1");
  const records = [
    FEATURE[0],
    FEATURE[1],
    { type: "assistant", uuid: "a2", timestamp: "2026-08-07T10:02:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: path.join(root, "slugify.js"), content: "export const slugify = (s) => String(s).toLowerCase();" } }] } },
    { type: "user", uuid: "u2", timestamp: "2026-08-07T10:02:05.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "written" }] } },
    FEATURE[2],
  ];
  const text = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const finalContent = { "slugify.js": "export const slugify = (s) => String(s).toLowerCase();" };
  const result = await captureAndSynthesize({
    text,
    transcriptSha256: sha256(text),
    finalMessageSha256: sha256("slugify updated and covered."),
    session: { id: "s1", cwd: root, captureEvent: "stop" },
    request: { question: "What did this session do?", audience: { role: "engineer", technicalDepth: "working" } },
    repository: { root, dirty: false, changedFiles: [{ path: "slugify.js", status: "added", sha256: sha256(finalContent["slugify.js"]) }], finalContent },
    transcriptPath: path.join(root, "t.jsonl"),
    outDir,
    completedAt: "2026-08-07T10:05:00.000Z",
  });
  return { result, outDir };
}

test("end-to-end: captureAndSynthesize writes a verified, non-stale latest.json bound to the run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-e2e-"));
  try {
    const { result } = await runE2E(root);
    assert.equal(result.status, "verified");
    assert.ok(result.latestPath, "the seam recorded a latest pointer path");
    const res = await readLatestPointer(root);
    assert.equal(res.ok, true);
    assert.equal(res.stale, false, "freshly written pointer matches its on-disk artifact/package");
    assert.equal(res.pointer.sessionId, "s1");
    assert.ok(res.pointer.changeStorySha256, "v2 run binds the change-story hash");
    assert.equal(res.pointer.completedAt, "2026-08-07T10:05:00.000Z", "completedAt is recorded and bound");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reader detects a tampered completedAt (now bound into the self-hash) (finding #4)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-e2e-"));
  try {
    await runE2E(root);
    const p = latestPath(root);
    const obj = JSON.parse(await readFile(p, "utf8"));
    obj.completedAt = "2099-01-01T00:00:00.000Z"; // edit without recomputing latestSha256
    await writeFile(p, JSON.stringify(obj, null, 2));
    const res = await readLatestPointer(root);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "tampered");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reader flags STALENESS when receipt.json is replaced with junk (finding #4)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-e2e-"));
  try {
    const { outDir } = await runE2E(root);
    await writeFile(path.join(outDir, "receipt.json"), "{\"receiptSha256\":\"deadbeef\"}");
    const res = await readLatestPointer(root);
    assert.equal(res.ok, true, "the pointer itself is intact");
    assert.equal(res.stale, true);
    assert.ok(res.staleReasons.some((r) => /HTML receipt/.test(r)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reader flags STALENESS when lineage-receipt.json is replaced with junk (finding #4)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-e2e-"));
  try {
    const { outDir } = await runE2E(root);
    await writeFile(path.join(outDir, "lineage-receipt.json"), "{\"lineageReceiptSha256\":\"deadbeef\"}");
    const res = await readLatestPointer(root);
    assert.equal(res.ok, true, "the pointer itself is intact");
    assert.equal(res.stale, true);
    assert.ok(res.staleReasons.some((r) => /lineage receipt/.test(r)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reader flags STALENESS when a receipt is internally re-hashed but no longer binds the verified package (finding #4)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-e2e-"));
  try {
    const { outDir } = await runE2E(root);
    // Rebuild receipt.json so it is INTERNALLY self-consistent (self-hash recomputes)
    // but points at a different package — the swapped-in-from-another-run case.
    const rp = path.join(outDir, "receipt.json");
    const obj = JSON.parse(await readFile(rp, "utf8"));
    const { receiptSha256, ...core } = obj;
    core.packageSha256 = "0".repeat(64);
    const { sha256Of, stableStringify } = await import("../receipt.mjs");
    const rebuilt = { ...core, receiptSha256: sha256Of(stableStringify(core)) };
    await writeFile(rp, `${JSON.stringify(rebuilt, null, 2)}\n`);
    const res = await readLatestPointer(root);
    assert.equal(res.ok, true, "the pointer itself is intact and the receipt self-hash recomputes");
    assert.equal(res.stale, true);
    assert.ok(res.staleReasons.some((r) => /HTML receipt no longer binds the verified package/.test(r)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reader rejects a pointer whose outputDir escapes the repo via traversal (finding #4)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-e2e-"));
  try {
    // A self-consistent pointer whose outputDir tries to escape the repo root.
    const pointer = buildLatestPointer({ lineage: LINEAGE, outputRelDir: "../../etc" });
    await writeLatestPointer(root, pointer);
    const res = await readLatestPointer(root);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "malformed");
    assert.match(res.error, /under the repo root/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reader rejects a pointer that names an absolute output path (finding #4)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-e2e-"));
  try {
    const pointer = buildLatestPointer({ lineage: LINEAGE, outputRelDir: "/etc" });
    await writeLatestPointer(root, pointer);
    const res = await readLatestPointer(root);
    assert.equal(res.ok, false);
    assert.equal(res.reason, "malformed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
