#!/usr/bin/env node
// Phase 1E Step 6 — regenerate the two vertical-slice artifacts (S1c feature,
// S2 debug) through the REAL synthesis path (captureAndSynthesize), so the
// committed sample artifacts are exactly what a user would get, not a bespoke
// render. Deterministic (no git, no network); the two slices are the same ones
// exercised end-to-end by __tests__/change-story.test.mjs.
//
// Output: <repo>/docs/product/eval-artifacts/phase-1e/{s1c-feature,s2-debug}/
// Each dir holds the full artifact set (index.html + workstream-package.json +
// bundle.json + the receipts). Prior (v1) eval-artifacts are left untouched as
// the "before" side of the before/after per the boundary.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { rm, readFile, writeFile } from "node:fs/promises";

import { captureAndSynthesize } from "./integrate.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const sha256 = (v) => createHash("sha256").update(v).digest("hex");

const jsonl = (records) => records.map((r) => JSON.stringify(r)).join("\n") + "\n";

// --- S1c: feature slice (slugify maxLength) ---
const SLUG_BEFORE = "export function slugify(input) {\n  return String(input).toLowerCase();\n}";
const SLUG_AFTER = "export function slugify(input, { maxLength } = {}) {\n  let slug = String(input).toLowerCase();\n  if (maxLength != null) slug = slug.slice(0, maxLength).replace(/-+$/, \"\");\n  return slug;\n}";
const TEST_FILE = "import { slugify } from \"./slugify.js\";\nif (slugify(\"Hello World\", { maxLength: 5 }) !== \"hello\") throw new Error(\"fail\");\nconsole.log(\"ok\");";

function s1c(root) {
  const slugFinal = SLUG_AFTER + "\n";
  const records = [
    { type: "user", uuid: "u1", timestamp: "2026-08-07T10:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "Add an optional maxLength option to slugify and cover it with a test." }] } },
    { type: "assistant", uuid: "a1", timestamp: "2026-08-07T10:01:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "I'll add a maxLength option that truncates then trims a trailing hyphen, then add a test." }] } },
    { type: "assistant", uuid: "a2", timestamp: "2026-08-07T10:02:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Edit", input: { file_path: join(root, "slugify.js"), old_string: SLUG_BEFORE, new_string: SLUG_AFTER } }] } },
    { type: "user", uuid: "r1", timestamp: "2026-08-07T10:02:05.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "updated" }] } },
    { type: "assistant", uuid: "a3", timestamp: "2026-08-07T10:03:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "Write", input: { file_path: join(root, "slugify.test.js"), content: TEST_FILE } }] } },
    { type: "user", uuid: "r2", timestamp: "2026-08-07T10:03:05.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "written" }] } },
    { type: "assistant", uuid: "a4", timestamp: "2026-08-07T10:04:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "t3", name: "Bash", input: { command: "node slugify.test.js" } }] } },
    { type: "user", uuid: "r3", timestamp: "2026-08-07T10:04:05.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", is_error: false, content: "ok" }] } },
    { type: "assistant", uuid: "a5", timestamp: "2026-08-07T10:05:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "slugify now supports maxLength and the test passes." }] } },
  ];
  const text = jsonl(records);
  return {
    text,
    transcriptSha256: sha256(text),
    finalMessageSha256: sha256("slugify now supports maxLength and the test passes."),
    session: { id: "s1c-feature", cwd: root, captureEvent: "stop" },
    request: { question: "What did this session change and why?", audience: { role: "engineer", technicalDepth: "working" } },
    repository: {
      root, dirty: false,
      changedFiles: [
        { path: "slugify.js", status: "modified", sha256: sha256(slugFinal) },
        { path: "slugify.test.js", status: "added", sha256: sha256(TEST_FILE) },
      ],
      finalContent: { "slugify.js": slugFinal, "slugify.test.js": TEST_FILE },
    },
    transcriptPath: join(root, "t.jsonl"),
  };
}

// --- S2: debugging slice (paginate off-by-one) ---
const PAGINATE_BEFORE = "export function paginate(items, page, pageSize) {\n  const start = page * pageSize;\n  return items.slice(start, start + pageSize);\n}";
const PAGINATE_AFTER = "export function paginate(items, page, pageSize) {\n  const start = (page - 1) * pageSize;\n  return items.slice(start, start + pageSize);\n}";

function s2(root) {
  const finalPaginate = PAGINATE_AFTER + "\n";
  const records = [
    { type: "user", uuid: "u1", timestamp: "2026-08-07T11:00:00.000Z", message: { role: "user", content: [{ type: "text", text: "Page 1 of paginate returns the wrong items — please debug and fix it." }] } },
    { type: "assistant", uuid: "a1", timestamp: "2026-08-07T11:01:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "node paginate.test.js" } }] } },
    { type: "user", uuid: "r1", timestamp: "2026-08-07T11:01:05.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: "AssertionError: expected [3,4] to equal [1,2]" }] } },
    { type: "assistant", uuid: "a2", timestamp: "2026-08-07T11:02:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "The bug is that page is treated as 0-indexed; page 1 should map to offset 0, so start must be (page-1)*pageSize." }] } },
    { type: "assistant", uuid: "a3", timestamp: "2026-08-07T11:03:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "Edit", input: { file_path: join(root, "paginate.js"), old_string: PAGINATE_BEFORE, new_string: PAGINATE_AFTER } }] } },
    { type: "user", uuid: "r2", timestamp: "2026-08-07T11:03:05.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "updated" }] } },
    { type: "assistant", uuid: "a4", timestamp: "2026-08-07T11:04:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "t3", name: "Bash", input: { command: "node paginate.test.js" } }] } },
    { type: "user", uuid: "r3", timestamp: "2026-08-07T11:04:05.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t3", is_error: false, content: "2 tests passed" }] } },
    { type: "assistant", uuid: "a5", timestamp: "2026-08-07T11:05:00.000Z", message: { role: "assistant", content: [{ type: "text", text: "Fixed the off-by-one; the test now passes." }] } },
  ];
  const text = jsonl(records);
  return {
    text,
    transcriptSha256: sha256(text),
    finalMessageSha256: sha256("Fixed the off-by-one; the test now passes."),
    session: { id: "s2-debug", cwd: root, captureEvent: "stop" },
    request: { question: "What was broken and how was it fixed?", audience: { role: "engineer", technicalDepth: "working" } },
    repository: {
      root, dirty: false,
      changedFiles: [{ path: "paginate.js", status: "modified", sha256: sha256(finalPaginate) }],
      finalContent: { "paginate.js": finalPaginate },
    },
    transcriptPath: join(root, "t.jsonl"),
  };
}

async function main() {
  const outRoot = join(REPO, "docs", "product", "eval-artifacts", "phase-1e");
  await rm(outRoot, { recursive: true, force: true });
  for (const [name, make] of [["s1c-feature", s1c], ["s2-debug", s2]]) {
    // Mirror the REAL runtime layout: each slice is its own sample "repo root"
    // (kept inside docs/ so nothing is written outside the committed tree), and
    // artifacts land in the run's own `.explainify/out/<sessionId>` subtree —
    // exactly where a live capture writes them. This keeps latest.json readable
    // under the stricter reader, which constrains outputDir to that subtree.
    const sampleRoot = join(outRoot, name);
    const outDir = join(sampleRoot, ".explainify", "out", name);
    const a = make(sampleRoot);
    a.outDir = outDir;
    a.repository.root = sampleRoot;
    a.session.cwd = sampleRoot;
    const res = await captureAndSynthesize(a);
    process.stdout.write(`${name}: ${res.status} → ${res.artifactPath}\n`);

    // The runtime layout (.explainify/) is gitignored — generated output is not
    // committed. So also emit a flat, tracked "as-a-reader-sees-it" text snapshot
    // of the rendered artifact next to the prior v1 grader snapshots, giving PM +
    // Riley a durable, reviewable v2 before/after without committing the runtime
    // tree. This is the visible change-of-result evidence, not the build output.
    const html = await readFile(res.artifactPath, "utf8");
    const readable = html
      .replace(/<style>[\s\S]*?<\/style>/g, "")
      .replace(/<script>[\s\S]*?<\/script>/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n\s*\n+/g, "\n\n")
      // Strip per-line trailing whitespace (tag→space substitution leaves spaces
      // before newlines) so the committed snapshot is `git diff --check` clean.
      .replace(/[ \t]+$/gm, "")
      .trim();
    await writeFile(join(outRoot, `${name}_v2-artifact-as-seen-by-reader.txt`), readable + "\n", "utf8");
  }
}

main().catch((e) => {
  process.stderr.write(`regen failed: ${e.stack || e.message}\n`);
  process.exit(1);
});
