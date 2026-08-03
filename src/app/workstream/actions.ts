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
