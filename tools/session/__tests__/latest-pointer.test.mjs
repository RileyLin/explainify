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

test("buildLatestPointer is self-binding and stable across completedAt (provenance is not bound)", () => {
  const a = buildLatestPointer({ lineage: LINEAGE, outputRelDir: ".explainify/out/s1", completedAt: "2026-08-07T10:00:00Z" });
  const b = buildLatestPointer({ lineage: LINEAGE, outputRelDir: ".explainify/out/s1", completedAt: "2026-08-07T23:59:00Z" });
  assert.equal(a.status, "verified");
  assert.equal(a.latestSha256, b.latestSha256, "the bound identity ignores completedAt");
  assert.notEqual(a.completedAt, b.completedAt, "completedAt is still recorded as provenance");
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
    const lineage = { ...LINEAGE, artifactSha256: sha256(artifact), packageSha256: sha256(pkg) };
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

test("end-to-end: captureAndSynthesize writes a verified, non-stale latest.json bound to the run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "explainify-e2e-"));
  const outDir = path.join(root, ".explainify", "out", "s1");
  const FEATURE = [
    { type: "user", uuid: "u1", timestamp: "2026-08-07T10:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "Add a maxLength option to slugify and test it." }] } },
    { type: "assistant", uuid: "a1", timestamp: "2026-08-07T10:01:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "Adding maxLength truncation then trimming a trailing hyphen." }] } },
    { type: "assistant", uuid: "a2", timestamp: "2026-08-07T10:02:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: path.join(root, "slugify.js"), content: "export const slugify = (s) => String(s).toLowerCase();" } }] } },
    { type: "user", uuid: "u2", timestamp: "2026-08-07T10:02:05.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "written" }] } },
    { type: "assistant", uuid: "a3", timestamp: "2026-08-07T10:04:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "slugify updated and covered." }] } },
  ].map((r) => JSON.stringify(r)).join("\n") + "\n";
  const finalContent = { "slugify.js": "export const slugify = (s) => String(s).toLowerCase();" };
  try {
    const result = await captureAndSynthesize({
      text: FEATURE,
      transcriptSha256: sha256(FEATURE),
      finalMessageSha256: sha256("slugify updated and covered."),
      session: { id: "s1", cwd: root, captureEvent: "stop" },
      request: { question: "What did this session do?", audience: { role: "engineer", technicalDepth: "working" } },
      repository: { root, dirty: false, changedFiles: [{ path: "slugify.js", status: "added", sha256: sha256(finalContent["slugify.js"]) }], finalContent },
      transcriptPath: path.join(root, "t.jsonl"),
      outDir,
    });
    assert.equal(result.status, "verified");
    assert.ok(result.latestPath, "the seam recorded a latest pointer path");
    const res = await readLatestPointer(root);
    assert.equal(res.ok, true);
    assert.equal(res.stale, false, "freshly written pointer matches its on-disk artifact/package");
    assert.equal(res.pointer.sessionId, "s1");
    assert.ok(res.pointer.changeStorySha256, "v2 run binds the change-story hash");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
