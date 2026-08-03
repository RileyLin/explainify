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
import { validatePackage, type ValidatePackageResult } from "@/lib/workstream/package";
import {
  applyPackageCorrection,
  type PackageCorrectionInput,
} from "@/lib/workstream/correct";

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
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
 * the immutable original (never regenerates a brief), embeds the byte-immutable original, and
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
