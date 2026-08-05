import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256, stableStringify, writeJson } from "../comprehension/util.mjs";

// WP-A: freeze the bounded source bundle into an immutable, hash-pinned manifest.
// Every source's sha256 is computed over its recorded content string; the manifest
// bundle hash is computed over the stable-serialized source manifest. Reruns are
// deterministic, so a regenerated manifest with unchanged sources is byte-identical.

const VALID_KINDS = new Set([
  "raft_message",
  "raft_task_state",
  "git_commit",
  "git_span",
  "command_receipt",
  "test_receipt",
  "deployment_receipt",
  "decision",
]);

const VALID_EXCLUSIONS = new Set(["policy", "unavailable", "unsupported"]);

export function buildSourceManifest(bundle) {
  if (bundle.schemaVersion !== 1) throw new Error("bundle schemaVersion must be 1");
  if (!bundle.workstreamId) throw new Error("bundle workstreamId is required");
  if (!bundle.freshnessCursor) throw new Error("bundle freshnessCursor is required");
  const seen = new Set();
  const sources = bundle.sources.map((source) => {
    if (!source.id || seen.has(source.id)) throw new Error(`duplicate or missing source id: ${source.id}`);
    seen.add(source.id);
    if (!VALID_KINDS.has(source.kind)) throw new Error(`invalid source kind: ${source.kind}`);
    if (typeof source.content !== "string" || !source.content.length) {
      throw new Error(`source ${source.id} requires recorded content`);
    }
    if (typeof source.captured !== "boolean") throw new Error(`source ${source.id} needs an explicit captured boolean`);
    if (!source.captured && !VALID_EXCLUSIONS.has(source.exclusionReason || "")) {
      throw new Error(`uncaptured source ${source.id} needs a valid exclusionReason`);
    }
    if (source.captured && source.exclusionReason) {
      throw new Error(`captured source ${source.id} must not carry an exclusionReason`);
    }
    return {
      id: source.id,
      kind: source.kind,
      locator: source.locator,
      ...(source.revision ? { revision: source.revision } : {}),
      sha256: sha256(source.content),
      evidenceLevel: source.evidenceLevel,
      evidenceLabel: source.evidenceLabel,
      captured: source.captured,
      ...(source.exclusionReason ? { exclusionReason: source.exclusionReason } : {}),
    };
  });
  const manifest = {
    schemaVersion: 1,
    workstreamId: bundle.workstreamId,
    generatedAt: bundle.freshnessCursor,
    freshnessCursor: bundle.freshnessCursor,
    sources,
  };
  manifest.bundleSha256 = sha256(stableStringify({ ...manifest, bundleSha256: "" }));
  return manifest;
}

async function main() {
  const root = process.cwd();
  const bundlePath = path.join(root, "benchmarks/workstream/sources-v0.1.json");
  const manifestPath = path.join(root, "benchmarks/workstream/manifest-v0.1.json");
  const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
  const manifest = buildSourceManifest(bundle);
  await writeJson(manifestPath, manifest);
  const captured = manifest.sources.filter((s) => s.captured).length;
  console.log(JSON.stringify({
    status: "frozen",
    workstreamId: manifest.workstreamId,
    sourceCount: manifest.sources.length,
    capturedCount: captured,
    uncapturedCount: manifest.sources.length - captured,
    bundleSha256: manifest.bundleSha256,
    manifestPath,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
