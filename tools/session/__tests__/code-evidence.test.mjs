// Phase 1E CodeExcerpt derivation + v2 validator tests. These exercise the exact
// attack surface the design gate named: attempted≠landed (R1), no-clip exact code
// (R2), path joins + traversal, literal-symbol rule (R5), uncaptured-file behavior,
// and hash-bound referential integrity. Deterministic: no git, no network.

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { buildBundleFromTranscript } from "../claude-adapter.mjs";
import { validateBundle, hashCodeExcerpt, LIMITS } from "../bundle-schema.mjs";

const sha256 = (v) => createHash("sha256").update(v).digest("hex");

// Build a v2 bundle from a small Edit/Write transcript with explicit final content.
function build({ tools, changedFiles, finalContent, root = "/repo" }) {
  const records = [
    { type: "user", uuid: "u1", message: { role: "user", content: [{ type: "text", text: "Make the requested code change and cover it with a test." }] } },
  ];
  let n = 0;
  for (const t of tools) {
    n += 1;
    const id = `t${n}`;
    records.push({ type: "assistant", uuid: `a${n}`, message: { role: "assistant", content: [{ type: "tool_use", id, name: t.name, input: t.input }] } });
    records.push({ type: "user", uuid: `r${n}`, message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, is_error: Boolean(t.isError), content: t.result ?? "ok" }] } });
  }
  const jsonl = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  return buildBundleFromTranscript({
    transcript: jsonl,
    transcriptSha256: sha256(jsonl),
    session: { id: "s1", cwd: root, captureEvent: "stop" },
    repository: { root, dirty: true, changedFiles, finalContent },
    receipts: [],
  }).bundle;
}

const SLUG_BEFORE = "export function slugify(input) {\n  return String(input).toLowerCase();\n}";
const SLUG_AFTER = "export function slugify(input, { maxLength } = {}) {\n  let slug = String(input).toLowerCase();\n  if (maxLength != null) slug = slug.slice(0, maxLength).replace(/-+$/, \"\");\n  return slug;\n}";

test("R1: a successful Edit whose new_string is uniquely present in final content is landed with a codeLocator + symbol", () => {
  const final = SLUG_AFTER + "\n";
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/slugify.js", old_string: SLUG_BEFORE, new_string: SLUG_AFTER }, result: "updated" }],
    changedFiles: [{ path: "slugify.js", status: "modified", sha256: sha256(final) }],
    finalContent: { "slugify.js": final },
  });
  assert.equal(bundle.schemaVersion, 2);
  assert.equal(bundle.codeEvidence.length, 1);
  const c = bundle.codeEvidence[0];
  assert.equal(c.kind, "hunk");
  assert.equal(c.completeness, "landed");
  assert.equal(c.symbol, "slugify");
  assert.match(c.codeLocator, /^file:slugify\.js#L\d+-L\d+$/);
  assert.equal(c.transcriptLocator.startsWith("jsonl:"), true);
  assert.notEqual(c.codeLocator, c.transcriptLocator);
  assert.equal(validateBundle(bundle).ok, true);
});

test("R1: attempted≠landed — an Edit whose new_string is NOT in final content is superseded, never 'landed'", () => {
  const final = "export function slugify(x){ return x; }\n"; // a later edit replaced it
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/slugify.js", old_string: SLUG_BEFORE, new_string: SLUG_AFTER }, result: "updated" }],
    changedFiles: [{ path: "slugify.js", status: "modified", sha256: sha256(final) }],
    finalContent: { "slugify.js": final },
  });
  const c = bundle.codeEvidence[0];
  assert.equal(c.completeness, "superseded");
  assert.equal(c.codeLocator, undefined);
  assert.ok(c.unknownReason && c.unknownReason.length > 0);
});

test("R1: a FAILED Edit is not a candidate — no code excerpt is derived", () => {
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/slugify.js", old_string: SLUG_BEFORE, new_string: SLUG_AFTER }, isError: true, result: "permission denied" }],
    changedFiles: [{ path: "slugify.js", status: "modified", sha256: sha256("x") }],
    finalContent: { "slugify.js": "x" },
  });
  assert.equal(bundle.codeEvidence.length, 0);
});

test("R1: MultiEdit/NotebookEdit are NOT candidates (stay tool events, no code excerpt)", () => {
  const bundle = build({
    tools: [{ name: "MultiEdit", input: { file_path: "/repo/a.js", edits: [{ old_string: "a", new_string: "b" }] }, result: "ok" }],
    changedFiles: [{ path: "a.js", status: "modified", sha256: sha256("b") }],
    finalContent: { "a.js": "b" },
  });
  assert.equal(bundle.codeEvidence.length, 0);
  assert.ok(bundle.toolEvents.some((t) => t.toolName === "MultiEdit"));
});

test("R1: a non-unique new_string yields unknown (no ambiguous span bound)", () => {
  const snippet = "const x = 1;";
  const final = `${snippet}\n${snippet}\n`; // appears twice
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/a.js", old_string: "const x = 0;", new_string: snippet }, result: "ok" }],
    changedFiles: [{ path: "a.js", status: "modified", sha256: sha256(final) }],
    finalContent: { "a.js": final },
  });
  const c = bundle.codeEvidence[0];
  assert.equal(c.completeness, "unknown");
  assert.match(c.unknownReason, /more than once|unique/);
});

test("R2: a secret in new_string makes the excerpt unsupported with a reason — never a clipped/secret hunk", () => {
  const secretAfter = "const token = \"ghp_ABCDEFGHIJKLMNOPQRST0123456789ABCD\";";
  const bundle = build({
    tools: [{ name: "Write", input: { file_path: "/repo/secret.js", content: secretAfter }, result: "ok" }],
    changedFiles: [{ path: "secret.js", status: "added", sha256: sha256(secretAfter) }],
    finalContent: { "secret.js": secretAfter },
  });
  const c = bundle.codeEvidence[0];
  assert.equal(c.kind, "unsupported");
  assert.equal(c.before, undefined);
  assert.equal(c.after, undefined);
  assert.ok(/secret/i.test(c.unknownReason));
  // The secret must not appear anywhere in the serialized bundle.
  assert.ok(!JSON.stringify(bundle).includes("ghp_ABCDEFGHIJKLMNOPQRST"));
});

test("R2: an over-limit new_string is unsupported (never clipped to look exact)", () => {
  const huge = "x".repeat(LIMITS.maxCodeExcerptBytes + 10);
  const bundle = build({
    tools: [{ name: "Write", input: { file_path: "/repo/big.js", content: huge }, result: "ok" }],
    changedFiles: [{ path: "big.js", status: "added", sha256: sha256(huge) }],
    finalContent: { "big.js": huge },
  });
  const c = bundle.codeEvidence[0];
  assert.equal(c.kind, "unsupported");
  assert.ok(/byte|line/.test(c.unknownReason));
});

test("path join: an Edit to a path NOT in changedFiles produces no code excerpt", () => {
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/not-tracked.js", old_string: "a", new_string: "b" }, result: "ok" }],
    changedFiles: [{ path: "other.js", status: "modified", sha256: sha256("z") }],
    finalContent: { "other.js": "z" },
  });
  assert.equal(bundle.codeEvidence.length, 0);
});

test("path join: an absolute/traversal file_path that escapes the repo root is not joined", () => {
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/etc/passwd", old_string: "a", new_string: "b" }, result: "ok" }],
    changedFiles: [{ path: "a.js", status: "modified", sha256: sha256("b") }],
    finalContent: { "a.js": "b" },
  });
  assert.equal(bundle.codeEvidence.length, 0);
});

test("R5: symbol is null when the hunk introduces two top-level declarations (ambiguous)", () => {
  const after = "export const a = 1;\nexport const b = 2;";
  const final = after + "\n";
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/m.js", old_string: "// x", new_string: after }, result: "ok" }],
    changedFiles: [{ path: "m.js", status: "modified", sha256: sha256(final) }],
    finalContent: { "m.js": final },
  });
  const c = bundle.codeEvidence[0];
  assert.equal(c.completeness, "landed");
  assert.equal(c.symbol, undefined);
});

test("R5: a literal token match inside a string is never resolved as a symbol", () => {
  const after = "  const msg = \"function slugify(x)\";"; // indented, and the decl is inside a string
  const final = after + "\n";
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/m.js", old_string: "// x", new_string: after }, result: "ok" }],
    changedFiles: [{ path: "m.js", status: "modified", sha256: sha256(final) }],
    finalContent: { "m.js": final },
  });
  assert.equal(bundle.codeEvidence[0].symbol, undefined);
});

test("R1: a REVERTED Edit is never 'landed' — the same text pre-existing elsewhere cannot attest this edit landed (blocker #1)", () => {
  // The edit tried to turn `const target = 0;` into `const shared = 1;`, but the
  // edit was later reverted. `const shared = 1;` DOES appear in the final file —
  // only because it pre-existed on another line. Binding the excerpt to that
  // occurrence would falsely attest a reverted edit as landed.
  const oldText = "const target = 0;";
  const newText = "const shared = 1;";
  const final = "const target = 0;\nconst shared = 1;\n"; // edit reverted; new_string pre-existed
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/m.js", old_string: oldText, new_string: newText }, result: "updated" }],
    changedFiles: [{ path: "m.js", status: "modified", sha256: sha256(final) }],
    finalContent: { "m.js": final },
  });
  const c = bundle.codeEvidence[0];
  assert.equal(c.completeness, "unknown", "a reverted edit must not be landed");
  assert.equal(c.codeLocator, undefined, "no codeLocator is bound when landing is unproven");
  assert.match(c.unknownReason, /replaced text still appears/);
  assert.equal(validateBundle(bundle).ok, true);
});

test("R1: a genuine unique landed Edit is still landed after the reverted-edit guard (no false negative)", () => {
  const oldText = "const target = 0;";
  const newText = "const shared = 1;";
  const final = "const shared = 1;\n"; // the replaced text is gone; the edit truly landed
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/m.js", old_string: oldText, new_string: newText }, result: "updated" }],
    changedFiles: [{ path: "m.js", status: "modified", sha256: sha256(final) }],
    finalContent: { "m.js": final },
  });
  const c = bundle.codeEvidence[0];
  assert.equal(c.completeness, "landed");
  assert.match(c.codeLocator, /^file:m\.js#L\d+-L\d+$/);
});

test("R5: a declaration inside a block comment is never resolved as a symbol (blocker #2)", () => {
  const after = "/*\nfunction fakeSymbol() {}\n*/\nexport const real = 1;";
  const final = after + "\n";
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/m.js", old_string: "// x", new_string: after }, result: "ok" }],
    changedFiles: [{ path: "m.js", status: "modified", sha256: sha256(final) }],
    finalContent: { "m.js": final },
  });
  const c = bundle.codeEvidence[0];
  assert.equal(c.completeness, "landed");
  assert.equal(c.symbol, "real", "the commented fakeSymbol is ignored; the one real decl resolves");
});

test("R5: a declaration inside a template literal is never resolved as a symbol (blocker #2)", () => {
  // The template literal's inner `function fakeSymbol` must be stripped; the only
  // real top-level decl is `tpl`, so that (never fakeSymbol) is what resolves.
  const after = "const tpl = `function fakeSymbol() {}`;";
  const final = after + "\n";
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/m.js", old_string: "// x", new_string: after }, result: "ok" }],
    changedFiles: [{ path: "m.js", status: "modified", sha256: sha256(final) }],
    finalContent: { "m.js": final },
  });
  assert.notEqual(bundle.codeEvidence[0].symbol, "fakeSymbol", "a decl inside a template literal is not a real symbol");
  assert.equal(bundle.codeEvidence[0].symbol, "tpl", "the real top-level declaration resolves instead");
});

test("R5: symbols are omitted for a language the parser does not support (blocker #2)", () => {
  const after = "def fake_symbol():\n    return 1";
  const final = after + "\n";
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/m.py", old_string: "# x", new_string: after }, result: "ok" }],
    changedFiles: [{ path: "m.py", status: "modified", sha256: sha256(final) }],
    finalContent: { "m.py": final },
  });
  const c = bundle.codeEvidence[0];
  assert.equal(c.completeness, "landed");
  assert.equal(c.symbol, undefined, "no JS-shaped regex symbol is invented for a .py file");
});

test("uncaptured final content → unknown (no fabricated landed classification)", () => {
  const bundle = build({
    tools: [{ name: "Edit", input: { file_path: "/repo/a.js", old_string: "a", new_string: "b" }, result: "ok" }],
    changedFiles: [{ path: "a.js", status: "modified", sha256: sha256("b") }],
    finalContent: {}, // final content unavailable (e.g. binary/oversized)
  });
  const c = bundle.codeEvidence[0];
  assert.equal(c.completeness, "unknown");
  assert.match(c.unknownReason, /final file content/);
});

// --- v2 validator: fail-closed referential integrity ---

function landedBundle() {
  const final = SLUG_AFTER + "\n";
  return build({
    tools: [{ name: "Edit", input: { file_path: "/repo/slugify.js", old_string: SLUG_BEFORE, new_string: SLUG_AFTER }, result: "updated" }],
    changedFiles: [{ path: "slugify.js", status: "modified", sha256: sha256(final) }],
    finalContent: { "slugify.js": final },
  });
}

test("validator rejects a CodeExcerpt whose hash does not bind its fields (tampered completeness)", () => {
  const bundle = landedBundle();
  bundle.codeEvidence[0].completeness = "superseded"; // relabel without rehash
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /hash mismatch/.test(e)));
});

test("validator rejects a CodeExcerpt with a dangling toolEventId", () => {
  const bundle = landedBundle();
  const c = bundle.codeEvidence[0];
  c.toolEventId = "tool-does-not-exist";
  c.sha256 = hashCodeExcerpt(c); // rehash so only the reference is wrong
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /dangling reference/.test(e)));
});

test("validator rejects a CodeExcerpt whose path is not in changedFiles", () => {
  const bundle = landedBundle();
  const c = bundle.codeEvidence[0];
  c.path = "ghost.js";
  c.sha256 = hashCodeExcerpt(c);
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /not in repository\.changedFiles/.test(e)));
});

test("validator rejects codeEvidence on a v1 bundle, and requires it on a v2 bundle", () => {
  const v2 = landedBundle();
  // Downgrade to v1 while carrying codeEvidence → rejected.
  const asV1 = { ...v2, schemaVersion: 1 };
  assert.equal(validateBundle(asV1).ok, false);
  // v2 without codeEvidence → rejected.
  const missing = { ...v2 };
  delete missing.codeEvidence;
  assert.equal(validateBundle(missing).ok, false);
});

test("validator rejects a landed excerpt missing its codeLocator", () => {
  const bundle = landedBundle();
  const c = bundle.codeEvidence[0];
  delete c.codeLocator;
  c.sha256 = hashCodeExcerpt(c);
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /codeLocator/.test(e)));
});

// --- observedOrder attested timeline (findings #1/#2) ---

test("v2 bundle emits an observedOrder that is a bijection over every excerpt, tool event, and receipt", () => {
  const bundle = landedBundle();
  assert.ok(Array.isArray(bundle.observedOrder), "observedOrder is present on a v2 bundle");
  const expected = bundle.excerpts.length + bundle.toolEvents.length + bundle.receipts.length;
  assert.equal(bundle.observedOrder.length, expected, "one entry per attested item");
  const seen = new Set();
  for (const o of bundle.observedOrder) {
    assert.ok(["excerpt", "tool_event", "receipt"].includes(o.kind));
    const key = `${o.kind}:${o.id}`;
    assert.ok(!seen.has(key), "no duplicate timeline entry");
    seen.add(key);
  }
  // Every excerpt/toolEvent/receipt id resolves in the timeline.
  for (const e of bundle.excerpts) assert.ok(seen.has(`excerpt:${e.id}`));
  for (const t of bundle.toolEvents) assert.ok(seen.has(`tool_event:${t.id}`));
  for (const r of bundle.receipts) assert.ok(seen.has(`receipt:${r.id}`));
  assert.equal(validateBundle(bundle).ok, true);
});

test("validator forbids observedOrder on a v1 bundle", () => {
  const v2 = landedBundle();
  const asV1 = { ...v2, schemaVersion: 1 };
  const { ok, errors } = validateBundle(asV1);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /observedOrder/.test(e)));
});

test("validator rejects an observedOrder with a dangling id", () => {
  const bundle = landedBundle();
  bundle.observedOrder = [...bundle.observedOrder, { kind: "excerpt", id: "excerpt-does-not-exist" }];
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /observedOrder/.test(e)));
});

test("validator rejects an observedOrder that is not a complete bijection (missing an item)", () => {
  const bundle = landedBundle();
  bundle.observedOrder = bundle.observedOrder.slice(1); // drop one entry
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /observedOrder/.test(e)));
});

test("validator rejects a duplicated observedOrder entry", () => {
  const bundle = landedBundle();
  bundle.observedOrder = [...bundle.observedOrder, bundle.observedOrder[0]];
  const { ok, errors } = validateBundle(bundle);
  assert.equal(ok, false);
  assert.ok(errors.some((e) => /observedOrder/.test(e)));
});
