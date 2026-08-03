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
