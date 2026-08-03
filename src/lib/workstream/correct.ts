// Portable, MUTATE-NOT-DERIVE correction builder for WorkstreamCheckpointPackages (task #22).
//
// A correction NEVER regenerates a brief from scratch and NEVER calls the Explainify-specific
// buildBrief (which derives claims from frozen source ids). Instead it takes an already-VALIDATED
// original package, MUTATES exactly one existing claim in a clone of its brief, ingests any new
// evidence into the successor's raw sources, and re-freezes the manifest / coverage / hashes with
// the SAME generic engine primitives the reader uses. The original package is treated as
// immutable by CANONICAL CONTENT: it is embedded in the successor as `previousPackage` and bound by
// its canonical content hash (correctionOfPackageSha256), so any change to its parsed content is
// caught. Serialized whitespace/property order is NOT preserved — the binding is over canonical
// content, which is stronger and portable across (de)serialization.
//
// Badge honesty (PM acceptance spec msg 80220692): the corrected claim's status is DERIVED, not
// trusted. A claim may be `observed` only when every cited source resolves to a CAPTURED manifest
// source in the successor; otherwise it is forced to `unknown` (or visibly `inferred` if the caller
// asks and supplies a reason) with an explicit reason. A correction can never keep a green
// `observed` badge without resolving, captured, exactly-hashed evidence.
import { buildSourceManifest } from "@engine/freeze.mjs";
import { buildCoverageReceipt } from "@engine/brief.mjs";
import { sha256, stableStringify } from "@engine/../comprehension/util.mjs";
import { scanOutput } from "@engine/../comprehension/evidence.mjs";

import { validatePackage, type WorkstreamCheckpointPackage } from "./package";
import type {
  Claim,
  CoverageReceipt,
  EvidenceLink,
  WorkstreamBrief,
  WorkstreamManifest,
  WorkstreamManifestSource,
  CorrectionKind,
} from "./types";

const freeze = buildSourceManifest as (bundle: unknown) => WorkstreamManifest;
const coverageOf = buildCoverageReceipt as (manifest: unknown) => CoverageReceipt;
const hash = sha256 as (value: string) => string;
const stable = stableStringify as (value: unknown) => string;
const scan = scanOutput as (value: unknown) => void;

// Kept in exact sync with the engine's evidenceLink() (brief.mjs) and the reader's binding
// (package.ts). Receipt-backed kinds carry receiptId=`receipt:<id>` and a receipt-scoped locator.
const RECEIPT_BACKED_KINDS = new Set([
  "command_receipt",
  "test_receipt",
  "deployment_receipt",
  "raft_message",
  "raft_task_state",
]);

// A new source ingested by a correction: the verbatim content plus the same metadata a freeze
// bundle source carries. `captured` decides whether the corrected claim may become `observed`.
export interface CorrectionSourceInput {
  id: string;
  kind: string;
  locator: string;
  revision?: string;
  evidenceLevel: string;
  evidenceLabel: string;
  captured: boolean;
  exclusionReason?: string;
  content: string;
}

export interface PackageCorrectionInput {
  correctionKind: CorrectionKind;
  note: string;
  submittedAt: string; // ISO, caller-supplied — the engine has no clock
  targetClaimId: string; // an existing claim (or decision) id in the original brief
  correctedText?: string; // optional replacement text for the claim
  // The status the caller INTENDS. Honored only if evidence supports it; otherwise downgraded.
  intendedStatus?: Claim["status"];
  newSources?: CorrectionSourceInput[]; // evidence to ingest into the successor bundle
  citeSourceIds?: string[]; // sources (existing or newly ingested) the corrected claim cites
  reason?: string; // explicit reason recorded when the claim is unknown/inferred
  freshnessCursor?: string; // optionally advance the cursor (defaults to the original's)
}

export type ApplyPackageCorrectionResult =
  | { ok: true; package: WorkstreamCheckpointPackage; downgraded: boolean }
  | { ok: false; error: string };

interface FreezeBundleSource {
  id: string;
  kind: string;
  locator: string;
  revision?: string;
  evidenceLevel: string;
  evidenceLabel: string;
  captured: boolean;
  exclusionReason?: string;
  content: string;
}

function fail(message: string): never {
  throw new Error(message);
}

// Reconstruct the ORIGINAL freeze bundle (manifest metadata + verbatim rawSources) exactly as the
// reader does, so appending new sources yields a successor bundle we can re-freeze generically.
function reconstructBundleSources(pkg: WorkstreamCheckpointPackage): FreezeBundleSource[] {
  const contentById = new Map(pkg.rawSources.map((s) => [s.id, s.content]));
  return pkg.manifest.sources.map((m) => {
    const content = contentById.get(m.id);
    if (content === undefined) fail(`original manifest source ${m.id} has no matching rawSource`);
    return {
      id: m.id,
      kind: m.kind,
      locator: m.locator,
      ...(m.revision ? { revision: m.revision } : {}),
      evidenceLevel: m.evidenceLevel,
      evidenceLabel: m.evidenceLabel,
      captured: m.captured,
      ...(m.exclusionReason ? { exclusionReason: m.exclusionReason } : {}),
      content,
    };
  });
}

// Build an evidence link from a manifest source using the deterministic mapping the reader enforces.
function linkFor(source: WorkstreamManifestSource): EvidenceLink {
  const receiptBacked = RECEIPT_BACKED_KINDS.has(source.kind);
  return {
    sourceId: source.id,
    ...(receiptBacked ? { receiptId: `receipt:${source.id}` } : {}),
    locator: receiptBacked ? `${source.id}#receipt:${source.id}` : source.locator,
    ...(source.revision ? { revision: source.revision } : {}),
    sha256: source.sha256,
    evidenceLevel: source.evidenceLevel,
    evidenceLabel: source.evidenceLabel,
  };
}

// Locate a claim by id across every claim group (decisions are corrected via their own path).
function findClaimGroups(brief: WorkstreamBrief): Claim[][] {
  return [
    [brief.currentOutcome],
    brief.sinceLastLooked,
    brief.reviewFirst,
    brief.verification,
    brief.risks,
    brief.blockers,
    brief.unknowns,
  ];
}

/**
 * Apply a correction to a VALIDATED original package and return a new, self-validating successor
 * package that embeds the original bound by its canonical content hash. Never calls buildBrief. Never throws — a bad
 * correction returns { ok: false, error }.
 */
export function applyPackageCorrection(
  originalInput: unknown,
  input: PackageCorrectionInput,
): ApplyPackageCorrectionResult {
  try {
    // 1) The original must be a currently-valid package. We never correct an unvalidated artifact.
    const validated = validatePackage(originalInput);
    if (!validated.ok) fail(`original package does not validate: ${validated.error}`);
    const original = validated.pkg;

    if (!input || typeof input !== "object") fail("correction input required");
    if (!["wrong", "missing", "stale", "misleading"].includes(input.correctionKind)) {
      fail("correctionKind must be one of wrong, missing, stale, misleading");
    }
    if (!input.note || !input.note.trim()) fail("correction note is required");
    if (!input.submittedAt) fail("submittedAt is required (ISO timestamp, caller-supplied)");
    if (!input.targetClaimId) fail("targetClaimId is required");

    // 2) Build the successor bundle: the original sources + any newly-ingested sources. Duplicate
    //    ids are rejected so a correction cannot silently overwrite a frozen source.
    const originalSources = reconstructBundleSources(original);
    const existingIds = new Set(originalSources.map((s) => s.id));
    const newSources = input.newSources ?? [];
    for (const s of newSources) {
      if (existingIds.has(s.id)) fail(`new evidence source ${s.id} collides with an existing source id`);
    }
    const freshnessCursor = input.freshnessCursor ?? original.manifest.freshnessCursor;
    const successorBundle = {
      schemaVersion: 1,
      workstreamId: original.manifest.workstreamId,
      freshnessCursor,
      sources: [...originalSources, ...newSources],
    };

    // 3) Re-freeze GENERICALLY. buildSourceManifest is deterministic (no clock), so the successor
    //    manifest binds every source — old and new — to its content hash.
    const manifest = freeze(successorBundle);
    const coverageReceipt = coverageOf(manifest);
    const manifestById = new Map(manifest.sources.map((s) => [s.id, s]));

    // 4) Resolve the corrected claim's cited evidence. Links are CONSTRUCTED from the successor
    //    manifest via the deterministic mapping — never trusted from caller input — so a corrected
    //    claim cannot smuggle a forged locator/hash. A cited id must exist; whether it is captured
    //    decides the honest badge.
    const cited = input.citeSourceIds ?? [];
    const resolvedSources: WorkstreamManifestSource[] = [];
    for (const id of cited) {
      const src = manifestById.get(id);
      if (!src) fail(`corrected claim cites sourceId ${id} which is not in the successor manifest`);
      resolvedSources.push(src);
    }
    const allCitedCaptured = resolvedSources.length > 0 && resolvedSources.every((s) => s.captured);
    // Only CAPTURED sources may appear as bound evidence links (the reader rejects any uncaptured
    // evidence link on any claim). Uncaptured cited sources are recorded as missing/uncovered
    // context in the claim's reason + missingSourceIds, never as evidence.
    const capturedResolved = resolvedSources.filter((s) => s.captured);
    const uncapturedCitedIds = resolvedSources.filter((s) => !s.captured).map((s) => s.id);
    const evidence = capturedResolved.map(linkFor);

    // 5) Badge honesty. `observed` is permitted ONLY when there is at least one cited source and
    //    every one is captured. Otherwise the successor claim is forced to the caller's non-observed
    //    intent (inferred) or defaults to unknown, always with an explicit reason.
    let downgraded = false;
    let status: Claim["status"];
    if (input.intendedStatus === "observed") {
      if (allCitedCaptured) {
        status = "observed";
      } else {
        // Intended observed but evidence does not support it → forced non-observed. Prefer a
        // visible `inferred` when the caller gave a reason, else fall to `unknown`.
        status = input.reason ? "inferred" : "unknown";
        downgraded = true;
      }
    } else if (input.intendedStatus === "inferred") {
      status = "inferred";
    } else {
      status = input.intendedStatus ?? "unknown";
    }
    if (status !== "observed" && !input.reason && !input.correctedText) {
      fail("a non-observed corrected claim requires an explicit reason (or corrected text)");
    }

    // 6) MUTATE a deep clone of the original brief's SEMANTIC content (receipt stripped). We change
    //    only the targeted claim; every other claim (and its already-bound evidence) is untouched.
    const originalBrief = original.brief;
    const cloned = JSON.parse(stable(originalBrief)) as WorkstreamBrief;
    const semantic = cloned as unknown as Record<string, unknown>;
    delete semantic.receipt;

    let mutated = false;
    for (const group of findClaimGroups(cloned)) {
      for (const claim of group) {
        if (claim.id === input.targetClaimId) {
          claim.status = status;
          if (input.correctedText) claim.text = input.correctedText;
          claim.evidence = evidence;
          if (status === "observed") {
            delete claim.unknownReason;
            delete claim.missingSourceIds;
          } else {
            claim.unknownReason = input.reason ?? claim.unknownReason ?? `corrected (${input.correctionKind}): ${input.note}`;
            // Any uncaptured source the caller cited is recorded as missing context, not evidence.
            if (uncapturedCitedIds.length) {
              claim.missingSourceIds = [...new Set([...(claim.missingSourceIds ?? []), ...uncapturedCitedIds])];
            }
          }
          mutated = true;
        }
      }
    }
    if (!mutated) {
      // Decisions are intentionally NOT correctable in this claim-correction slice (PM finding #6).
      // The decision path used to replace only a decision's evidence while silently ignoring the
      // requested text/status/reason and still minting a successor — a control whose change is
      // dropped. Reject a decision target with a clear error; honest decision reclassification is a
      // separate, scoped slice.
      if (cloned.decisionsNeeded.some((d) => d.id === input.targetClaimId)) {
        fail(
          `targetClaimId ${input.targetClaimId} is a decision; decision correction is not supported in ` +
            "this claim-correction slice (target a claim instead)",
        );
      }
      fail(`targetClaimId ${input.targetClaimId} is not a claim in the original brief`);
    }

    // 7) Link the successor to the immutable original and re-finalize with the engine's hashing
    //    tail (checkpointId over semantic-with-blank-id, then the semantic hash). Mirrors buildBrief
    //    exactly, but never derives claims. We commit the WHOLE canonical original's hash into the
    //    SEMANTIC brief (correctionOfPackageSha256), so the successor's checkpointId binds the exact
    //    parent content — the reader recomputes it and a swapped/mutated parent fails closed
    //    (independent review finding #1).
    const originalPackageSha256 = hash(stable(original));
    cloned.correctionOf = originalBrief.checkpointId;
    cloned.correctionOfPackageSha256 = originalPackageSha256;
    cloned.correctionReceiptPaths = ["correction-receipt.json"];
    cloned.freshnessCursor = freshnessCursor;

    const draft = { ...semantic, checkpointId: "" };
    const checkpointId = `checkpoint-${hash(stable(draft)).slice(0, 12)}`;
    (cloned as { checkpointId: string }).checkpointId = checkpointId;
    if (checkpointId === originalBrief.checkpointId) {
      fail("corrected checkpoint id did not change — the correction is a no-op");
    }
    const semanticFilled = { ...(cloned as unknown as Record<string, unknown>) };
    delete semanticFilled.receipt;
    const semanticBriefSha256 = hash(stable(semanticFilled));

    // Recompute the unsupported-observed count generically from the mutated claims.
    const successorClaims = findClaimGroups(cloned).flat();
    const unsupportedObservedClaimCount = successorClaims.filter(
      (c) => c.status === "observed" && !c.evidence.length,
    ).length;

    const correctedBrief: WorkstreamBrief = {
      ...(cloned as WorkstreamBrief),
      receipt: {
        semanticBriefSha256,
        sourceManifestSha256: manifest.bundleSha256,
        coverageReceiptSha256: hash(stable(coverageReceipt)),
        unsupportedObservedClaimCount,
        secretScan: "pass",
        publication: "local_only",
      },
    };

    // 8) Correction receipt binds original ↔ successor from CONTENT (recomputed hashes). The four
    //    original* hashes bind the parent by content (independent review finding #1) so the reader
    //    can recompute each from the embedded original and fail closed on any parent swap/mutation.
    const receiptCore = {
      schemaVersion: 1,
      originalCheckpointId: originalBrief.checkpointId,
      originalClaimId: input.targetClaimId,
      correctionKind: input.correctionKind,
      note: input.note,
      evidence,
      submittedAt: input.submittedAt,
      correctedCheckpointId: checkpointId,
      correctedSemanticBriefSha256: semanticBriefSha256,
      successorBundleSha256: manifest.bundleSha256,
      sameInputCheckpoint: false,
      originalSemanticBriefSha256: originalBrief.receipt.semanticBriefSha256,
      originalManifestSha256: original.manifest.bundleSha256,
      originalCoverageReceiptSha256: hash(stable(original.coverageReceipt)),
      originalPackageSha256,
    };
    const correctionReceipt = {
      ...receiptCore,
      correctionReceiptSha256: hash(stable(receiptCore)),
    };

    // 9) Assemble the successor package embedding the original (bound by its canonical content hash).
    const successor: WorkstreamCheckpointPackage = {
      packageVersion: original.packageVersion,
      workstreamId: manifest.workstreamId,
      checkpointId,
      brief: correctedBrief,
      manifest,
      coverageReceipt,
      rawSources: successorBundle.sources.map((s) => ({ id: s.id, content: s.content })),
      correctionReceipt,
      previousCheckpointId: originalBrief.checkpointId,
      previousPackage: original,
    };

    // 10) Self-validate: the successor must pass the full reader (which re-validates the embedded
    //     original and verifies the correction chain end-to-end) before we hand it back.
    scan(stable(successor));
    const check = validatePackage(successor);
    if (!check.ok) fail(`assembled correction package failed self-validation: ${check.error}`);

    return { ok: true, package: successor, downgraded };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
