"use server";

// Server actions for the local-first Workstream checkpoint reader (task #22, Phase B).
//
// The product IMPORTS an explicit WorkstreamCheckpointPackage and VALIDATES it — it does NOT
// generate a brief from arbitrary raw evidence (that Phase A capability is tied to specific
// source ids and is tracked as a separate future slice). Validation recomputes every hash from
// the package's own raw content and is portable across workstreams.
//
// EVERY action calls assertLocalWorkstreams() FIRST. In hosted Production the local flag is
// unset, so these fail closed and a private checkpoint package can never be processed on the
// server. The package is validated entirely in-process; nothing is persisted or forwarded.

import { assertLocalWorkstreams, HostedModeError } from "@/lib/workstream/local-mode";
import {
  validatePackage,
  type ValidatePackageResult,
  type WorkstreamCheckpointPackage,
} from "@/lib/workstream/package";
import {
  applyPackageCorrection,
  type PackageCorrectionInput,
} from "@/lib/workstream/correct";
import { compareCapsules } from "@engine/../comprehension/comparative/compare.mjs";
import { comparisonToPackage } from "@engine/../comprehension/comparative/workstream-package.mjs";
import { capsuleSemantic, validateCapsule } from "@engine/../comprehension/comparative/capsule.mjs";
import { sha256, stableStringify } from "@engine/../comprehension/util.mjs";
import {
  EXAMPLE_LEFT_CAPSULE_JSON,
  EXAMPLE_RIGHT_CAPSULE_JSON,
} from "../compare-runs/example-capsules";

// Reject an oversized raw payload BEFORE JSON.parse (re-review finding #2), so a multi-megabyte
// string can never be parsed into memory. The ceiling is generous relative to the reader's own
// MAX_PACKAGE_BYTES (256 KiB canonical) — a valid package serialized with indentation is larger
// than its canonical form — but still bounds the parse. Measured in encoded UTF-8 bytes.
const MAX_RAW_ACTION_BYTES = 1_048_576; // 1 MiB

function rawByteLength(raw: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(raw).length;
  return unescape(encodeURIComponent(raw)).length;
}

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (rawByteLength(raw) > MAX_RAW_ACTION_BYTES) {
    return { ok: false, error: `Package exceeds the maximum accepted size of ${MAX_RAW_ACTION_BYTES} bytes.` };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: `Package is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function guardLocal(): HostedModeError | null {
  try {
    assertLocalWorkstreams();
    return null;
  } catch (e) {
    if (e instanceof HostedModeError) return e;
    throw e;
  }
}

/**
 * Validate a pasted/uploaded checkpoint package: recompute all hashes, report coverage,
 * exclusions, freshness, correction-chain status, and any tamper/validation failure. Fails
 * closed in hosted mode.
 */
export async function validatePackageAction(rawPackage: string): Promise<ValidatePackageResult> {
  const blocked = guardLocal();
  if (blocked) return { ok: false, error: blocked.message };
  const parsed = parseJson(rawPackage);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return validatePackage(parsed.value);
}

export type CorrectionActionResult =
  | { ok: true; packageJson: string; checkpointId: string; previousCheckpointId: string; downgraded: boolean }
  | { ok: false; error: string };

/**
 * Apply a correction to a validated checkpoint package and return the new successor package as
 * JSON, ready to download/export or re-open. Guards local mode BEFORE parsing any input, so a
 * private package can never be processed on the hosted server. The correction mutates one claim in
 * the original (never regenerates a brief), embeds the original bound by its canonical content hash, and
 * self-validates the full chain before returning. `downgraded` is true when an intended-observed
 * badge was forced to a non-observed status for lack of captured evidence.
 */
export async function applyCorrectionAction(
  rawPackage: string,
  correction: PackageCorrectionInput,
): Promise<CorrectionActionResult> {
  const blocked = guardLocal();
  if (blocked) return { ok: false, error: blocked.message };
  const parsed = parseJson(rawPackage);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const r = applyPackageCorrection(parsed.value, correction);
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    packageJson: JSON.stringify(r.package, null, 2),
    checkpointId: r.package.checkpointId,
    previousCheckpointId: r.package.previousCheckpointId ?? "",
    downgraded: r.downgraded,
  };
}

// Narrow the generic comparative .mjs primitives at this single server boundary (tsc infers `any`).
const engineCompare = compareCapsules as (
  left: unknown,
  right: unknown,
  question: string,
) => { artifact: unknown; left: unknown; right: unknown };
const engineToPackage = comparisonToPackage as (
  artifact: unknown,
  left: unknown,
  right: unknown,
) => WorkstreamCheckpointPackage;

export type CompareRunsActionResult =
  | { ok: true; packageJson: string; result: ValidatePackageResult }
  | { ok: false; error: string };

/**
 * Compare two local run capsules (task #23, Compare Runs). Local-first, like every other action:
 * guards local mode BEFORE parsing, so private capsules can never be processed on the hosted
 * server. The comparative engine validates BOTH capsules from content, judges equivalence and
 * confounders, and the adapter mints a WorkstreamCheckpointPackage; the result is then run through
 * the SAME `validatePackage` reader the /workstream flow uses, so a swapped/tampered/self-compared
 * or falsely-equivalent pair fails closed exactly as it would on import. The minted package JSON is
 * returned so the reader can render it (and the user can export/open it in /workstream) with no
 * separate trust path. `question` is a short, user-supplied framing recorded verbatim in the
 * artifact.
 */
export async function compareRunsAction(
  rawLeft: string,
  rawRight: string,
  question: string,
): Promise<CompareRunsActionResult> {
  const blocked = guardLocal();
  if (blocked) return { ok: false, error: blocked.message };
  const left = parseJson(rawLeft);
  if (!left.ok) return { ok: false, error: `Left capsule: ${left.error}` };
  const right = parseJson(rawRight);
  if (!right.ok) return { ok: false, error: `Right capsule: ${right.error}` };
  const q = (question || "").trim() || "Compare two agent runs on the same frozen workload.";
  try {
    // compareCapsules validates both capsules (fails closed on tamper/dirty/secret); the adapter
    // then re-verifies the artifact↔capsule binding from content before minting.
    const { artifact, left: vLeft, right: vRight } = engineCompare(left.value, right.value, q);
    const pkg = engineToPackage(artifact, vLeft, vRight);
    // Authoritative gate: the minted package must pass the SAME reader as an imported checkpoint.
    const result = validatePackage(pkg);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, packageJson: JSON.stringify(pkg, null, 2), result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Compare Runs before/after demo (task #23, founder-visible delivery bar) ───────────────────
// A returning reader (Riley) opens ONE stable entry and sees, for each red-team case, the old wrong
// result the engine used to produce, the current honest result the SHIPPING engine produces right
// now (computed live from the same capsules — not a hardcoded string), and why the old result was
// dishonest. This is a rendering of the real engine on real fixtures; the "after" text below is
// whatever the current build actually emits, so a regression would visibly change this page.

// Narrow the two extra generic .mjs primitives at this single server boundary (tsc infers `any`).
const engineCapsuleSemantic = capsuleSemantic as (capsule: unknown) => unknown;
const engineValidateCapsule = validateCapsule as (capsule: unknown) => unknown;

// A run capsule, structurally — only the fields the demo mutations touch are named; the rest is
// carried opaquely so we re-serialize the exact validated shape.
type DemoCapsule = {
  id: string;
  environment: { provider: string };
  provenance: { capsuleSha256: string };
  verification: Array<{ kind: string; value?: number; scope?: string; evidence: string[] }>;
  receipts: Array<{ id: string; content: string; sha256: string }>;
  inputs?: Array<{ id: string; sha256: string }>;
  [key: string]: unknown;
};

function cloneExample(json: string): DemoCapsule {
  return JSON.parse(json) as DemoCapsule;
}

// Re-bind a capsule's semantic content hash after a mutation and assert it still validates, exactly
// as a real capture would. A mutation that broke schema validity would throw here.
function rehashCapsule(capsule: DemoCapsule): DemoCapsule {
  capsule.provenance.capsuleSha256 = sha256(stableStringify(engineCapsuleSemantic(capsule)));
  engineValidateCapsule(capsule);
  return capsule;
}

// Overwrite one measured dimension (metric|cost) and re-bind its receipt content + hash, so the
// engine reads the new value from validated evidence (mirrors the red-team test helper).
function setMeasure(capsule: DemoCapsule, kind: "metric" | "cost", value: number): void {
  const measure = capsule.verification.find((v) => v.kind === kind);
  if (!measure) throw new Error(`demo capsule missing ${kind} measure`);
  measure.value = value;
  const receipt = capsule.receipts.find((r) => r.id === measure.evidence[0]);
  if (!receipt) throw new Error(`demo capsule missing ${kind} receipt`);
  receipt.content = `${kind}=${value}; ${measure.scope}`;
  receipt.sha256 = sha256(receipt.content);
}

export type DemoCase = {
  id: string;
  title: string;
  scenario: string;
  before: string;
  after: string;
  status: string;
  supported: boolean;
  reason: string;
};

export type CompareRunsDemoResult =
  | { ok: true; cases: DemoCase[] }
  | { ok: false; error: string };

// Build the three red-team cases live and read the CURRENT engine's verdict for each. The "before"
// strings are the exact wrong outputs earlier builds produced (proven by the PM's reproduction
// tests); the "after"/status/supported come from the running engine, so this page is a live
// regression witness, not a static claim.
// NOT local-gated: the demo processes ONLY bundled synthetic fixture capsules (no user upload, no
// private run evidence), so it is safe to render on a hosted preview — exactly the "safe synthetic
// evidence" a hosted entry is allowed to show. The live Compare Runs flow that ingests real
// capsules stays local-gated (compareRunsAction above).
export async function compareRunsDemoAction(): Promise<CompareRunsDemoResult> {
  try {
    const cases: DemoCase[] = [];

    // 1) TIE — AWS and GCP tie on BOTH p95 latency and cost. Equal evidence supports no winner.
    {
      const left = cloneExample(EXAMPLE_LEFT_CAPSULE_JSON);
      const right = cloneExample(EXAMPLE_RIGHT_CAPSULE_JSON);
      const awsMetric = left.verification.find((v) => v.kind === "metric")!.value!;
      const awsCost = left.verification.find((v) => v.kind === "cost")!.value!;
      setMeasure(right, "metric", awsMetric);
      setMeasure(right, "cost", awsCost);
      rehashCapsule(right);
      const { artifact, left: vl, right: vr } = engineCompare(left, right, "Which provider should we adopt for this workload?");
      const pkg = engineToPackage(artifact, vl, vr);
      const rec = (artifact as { recommendation: { text: string; supported: boolean } }).recommendation;
      cases.push({
        id: "tie",
        title: "Tie on every measure",
        scenario: `AWS and GCP tie exactly — p95 ${awsMetric}ms each and $${awsCost} each.`,
        before: `“aws is supported” — a green, observed winner.`,
        after: rec.text,
        status: pkg.brief.currentOutcome.status,
        supported: rec.supported,
        reason:
          "Equal latency and equal cost is evidence of parity, not a win. The old lexicographic tie-break picked a provider by name, which has no evidentiary basis. Now a tie supports neither side.",
      });
    }

    // 2) SAME PROVIDER — two distinct AWS runs. A cross-provider recommendation needs one aws + one gcp.
    {
      const left = cloneExample(EXAMPLE_LEFT_CAPSULE_JSON);
      const dup = cloneExample(EXAMPLE_LEFT_CAPSULE_JSON);
      dup.id = "C01-left-aws-copy";
      rehashCapsule(dup);
      const { artifact, left: vl, right: vr } = engineCompare(left, dup, "Which provider should we adopt for this workload?");
      const pkg = engineToPackage(artifact, vl, vr);
      const rec = (artifact as { recommendation: { text: string; supported: boolean } }).recommendation;
      cases.push({
        id: "same-provider",
        title: "Same provider on both sides",
        scenario: "Two distinct AWS runs compared as though they were a cross-provider pair.",
        before: `“aws is supported” — a forced winner from a same-provider pair.`,
        after: rec.text,
        status: pkg.brief.currentOutcome.status,
        supported: rec.supported,
        reason:
          "A cross-provider recommendation may rest only on exactly one AWS and one GCP run. Two AWS runs can never yield an AWS-vs-GCP winner; the outcome is not_comparable with the reason shown.",
      });
    }

    // 3) EVIDENCE INSUFFICIENT — the two runs used different load profiles, so they aren't equivalent.
    {
      const left = cloneExample(EXAMPLE_LEFT_CAPSULE_JSON);
      const right = cloneExample(EXAMPLE_RIGHT_CAPSULE_JSON);
      const lp = right.receipts.find((r) => r.id === "receipt:input-load-profile");
      if (!lp) throw new Error("demo capsule missing load-profile receipt");
      lp.content = "requests=500; concurrency=5; duration=30s";
      lp.sha256 = sha256(lp.content);
      const inp = right.inputs?.find((i) => i.id === "load-profile");
      if (inp) inp.sha256 = lp.sha256;
      rehashCapsule(right);
      const { artifact, left: vl, right: vr } = engineCompare(left, right, "Which provider should we adopt for this workload?");
      const pkg = engineToPackage(artifact, vl, vr);
      const rec = (artifact as { recommendation: { text: string; supported: boolean } }).recommendation;
      cases.push({
        id: "not-equivalent",
        title: "Evidence isn’t comparable",
        scenario: "The GCP run used a lighter load profile (500 vs 1000 requests), so the two runs aren’t equivalent.",
        before: `A confident recommendation, as if the two runs were measured the same way.`,
        after: pkg.brief.currentOutcome.text,
        status: pkg.brief.currentOutcome.status,
        supported: rec.supported,
        reason:
          "A recommendation is only honest when the two sides ran the same bounded workload. A differing load profile is a confounder, so the comparison is blocked as not_comparable until the runs are aligned.",
      });
    }

    return { ok: true, cases };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
