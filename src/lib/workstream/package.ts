// WorkstreamCheckpointPackage — the ONLY supported product input for Phase B.
//
// The product does NOT generate briefs from arbitrary raw evidence (that is a Phase A engine
// capability tied to specific source ids, tracked as a separate future slice). Instead the
// product IMPORTS an explicit, self-contained checkpoint package — a semantic brief + its frozen
// manifest + coverage receipt + the verbatim raw-source excerpts the manifest hashes were
// computed over — and VALIDATES it before rendering.
//
// Validation is portable: it recomputes every hash from the package's own raw content using the
// proven generic engine primitives (buildSourceManifest / validateManifestAgainstBundle /
// buildCoverageReceipt / sha256 / scanOutput). It NEVER calls buildBrief, so it has no dependence
// on any workstream's specific source ids — a valid package for ANY workstream renders, and a
// tampered package fails closed.
import { buildSourceManifest } from "@engine/freeze.mjs";
import { validateManifestAgainstBundle, buildCoverageReceipt } from "@engine/brief.mjs";
import { sha256, stableStringify } from "@engine/../comprehension/util.mjs";
import { scanOutput } from "@engine/../comprehension/evidence.mjs";

import type {
  WorkstreamBrief,
  WorkstreamManifest,
  CoverageReceipt,
  CorrectionReceipt,
} from "./types";

// Note: verifyCorrectionChain is intentionally NOT imported. A single-brief package cannot bind
// both the immutable original and its successor, so this reader fails closed on any correction
// receipt (see step 5) rather than call a verifier that would false-positive on one side. Full
// chain verification arrives with the correction/export slice that extends the package contract.

// Narrow the generic .mjs primitives (tsc infers `any`) at this single boundary.
const freeze = buildSourceManifest as (bundle: unknown) => WorkstreamManifest;
const validateManifest = validateManifestAgainstBundle as (
  bundle: unknown,
  manifest: unknown,
) => WorkstreamManifest;
const coverageOf = buildCoverageReceipt as (manifest: unknown) => CoverageReceipt;
const hash = sha256 as (value: string) => string;
const stable = stableStringify as (value: unknown) => string;
const scan = scanOutput as (value: unknown) => void;

export interface RawSource {
  id: string;
  content: string;
}

// The raw freeze-bundle shape buildSourceManifest consumes (content + metadata per source).
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
interface FreezeBundle {
  schemaVersion: number;
  workstreamId: string;
  freshnessCursor: string;
  sources: FreezeBundleSource[];
}

/**
 * A self-contained, portable checkpoint package. Produced by the Phase A engine (or a mint tool
 * for fixtures) and consumed read-only by the product. `rawSources` carries the verbatim content
 * each manifest source hash was computed over, so the reader can re-derive the manifest and every
 * hash without trusting any stored field.
 */
export interface WorkstreamCheckpointPackage {
  packageVersion: number;
  workstreamId: string;
  checkpointId: string;
  brief: WorkstreamBrief;
  manifest: WorkstreamManifest;
  coverageReceipt: CoverageReceipt;
  rawSources: RawSource[];
  correctionReceipt?: CorrectionReceipt;
}

export interface PackageCoverage {
  requested: number;
  scanned: number;
  excluded: number;
  unavailable: number;
  unsupported: number;
  uncovered: number;
  fullyCovered: boolean;
}

export type ValidatePackageResult =
  | {
      ok: true;
      pkg: WorkstreamCheckpointPackage;
      workstreamId: string;
      freshnessCursor: string;
      coverage: PackageCoverage;
      exclusions: Array<{ id: string; kind: string; reason: string; locator: string }>;
      correctionVerified: boolean | null;
    }
  | { ok: false; error: string };

const SUPPORTED_PACKAGE_VERSION = 1;

// Source kinds whose evidence links use the task #15 receipt-scoped locator shape, mirroring the
// engine's evidenceLink() in brief.mjs. Kept in sync with that list; any other kind uses the
// manifest's own locator and carries no receiptId.
const RECEIPT_BACKED_KINDS = new Set([
  "command_receipt",
  "test_receipt",
  "deployment_receipt",
  "raft_message",
  "raft_task_state",
]);

function fail(message: string): never {
  throw new Error(message);
}

// Reconstruct the raw freeze-bundle from the package: manifest metadata + verbatim rawSources.
// buildSourceManifest hashes `content`, so pairing each manifest source with its raw content
// reproduces the exact bundle the package was frozen from. A missing/extra raw source, or content
// that does not hash to the manifest, is caught by validateManifestAgainstBundle below.
function reconstructBundle(pkg: WorkstreamCheckpointPackage): FreezeBundle {
  const contentById = new Map(pkg.rawSources.map((s) => [s.id, s.content]));
  if (contentById.size !== pkg.rawSources.length) fail("package has duplicate rawSource ids");
  const sources = pkg.manifest.sources.map((m) => {
    const content = contentById.get(m.id);
    if (content === undefined) fail(`manifest source ${m.id} has no matching rawSource content`);
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
  if (sources.length !== pkg.rawSources.length) {
    fail("package rawSources do not correspond one-to-one with manifest sources");
  }
  return {
    schemaVersion: 1,
    workstreamId: pkg.manifest.workstreamId,
    freshnessCursor: pkg.manifest.freshnessCursor,
    sources,
  };
}

// The brief hashes in two steps, mirroring buildBrief exactly:
//   - checkpointId  = "checkpoint-" + sha256(semantic WITH checkpointId="")[:12]
//   - semanticBriefSha256 = sha256(semantic WITH the derived checkpointId filled in)
// Both are recomputed from CONTENT (receipt stripped) so a mutated claim with a stale stored
// hash is caught.
function briefSemantic(brief: WorkstreamBrief): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...(brief as unknown as Record<string, unknown>) };
  delete rest.receipt;
  return rest;
}
function recomputeCheckpointId(brief: WorkstreamBrief): string {
  const draft = { ...briefSemantic(brief), checkpointId: "" };
  return `checkpoint-${hash(stable(draft)).slice(0, 12)}`;
}
function recomputeSemanticSha256(brief: WorkstreamBrief): string {
  return hash(stable(briefSemantic(brief)));
}

/**
 * Validate a checkpoint package with the proven generic engine primitives, recomputing every hash
 * from the package's own raw content. Portable across workstreams (never calls buildBrief). Never
 * throws — a tampered or malformed package returns `{ ok: false, error }` so the UI fails closed.
 */
export function validatePackage(input: unknown): ValidatePackageResult {
  try {
    if (!input || typeof input !== "object") fail("package must be a JSON object");
    const pkg = input as WorkstreamCheckpointPackage;
    if (pkg.packageVersion !== SUPPORTED_PACKAGE_VERSION) {
      fail(`unsupported packageVersion (expected ${SUPPORTED_PACKAGE_VERSION})`);
    }
    for (const key of ["brief", "manifest", "coverageReceipt", "rawSources"] as const) {
      if (!pkg[key]) fail(`package is missing "${key}"`);
    }
    if (!Array.isArray(pkg.rawSources)) fail("package rawSources must be an array");

    // 1) Re-derive the manifest from raw content and require an EXACT match to the package manifest.
    //    This binds every integrity/coverage/privacy field (kinds, exclusions, per-source sha256,
    //    the source set and order) to the raw evidence — coverage cannot be forged.
    const bundle = reconstructBundle(pkg);
    const rederived = freeze(bundle);
    if (stable(rederived) !== stable(pkg.manifest)) {
      fail("manifest does not match the manifest re-derived from the package raw sources (tampered)");
    }
    // Also run the engine's own bundle↔manifest binding check (self-consistency + exact match).
    validateManifest(bundle, pkg.manifest);

    // 2) Coverage receipt must recompute from the manifest.
    const rederivedCoverage = coverageOf(pkg.manifest);
    if (stable(rederivedCoverage) !== stable(pkg.coverageReceipt)) {
      fail("coverage receipt does not recompute from the manifest (tampered)");
    }

    // 3) Brief integrity: checkpointId + semantic hash recompute from content; receipt fields agree.
    const expectedCheckpointId = recomputeCheckpointId(pkg.brief);
    if (pkg.brief.checkpointId !== expectedCheckpointId) {
      fail("brief checkpointId does not match its recomputed semantic hash (tampered)");
    }
    const semanticSha = recomputeSemanticSha256(pkg.brief);
    if (semanticSha !== pkg.brief.receipt.semanticBriefSha256) {
      fail("brief semantic hash does not recompute (tampered brief)");
    }
    if (pkg.brief.receipt.sourceManifestSha256 !== pkg.manifest.bundleSha256) {
      fail("brief receipt sourceManifestSha256 does not match the manifest (tampered)");
    }
    if (pkg.brief.receipt.coverageReceiptSha256 !== hash(stable(pkg.coverageReceipt))) {
      fail("brief receipt coverageReceiptSha256 does not match the coverage receipt (tampered)");
    }

    // 3b) Identity binding: the package header, brief, manifest, AND coverage receipt must all agree
    //     on workstreamId and freshnessCursor, and the header/brief on checkpointId. Otherwise a
    //     brief could claim a different workstream or a fabricated future freshness while the result
    //     still reports the manifest's real identity (PM finding #2).
    if (pkg.checkpointId !== pkg.brief.checkpointId || pkg.workstreamId !== pkg.brief.workstreamId) {
      fail("package header does not match its brief (checkpointId/workstreamId)");
    }
    const wsIds = [
      pkg.brief.workstreamId,
      pkg.manifest.workstreamId,
      pkg.coverageReceipt.workstreamId,
    ];
    if (new Set(wsIds).size !== 1) {
      fail("workstreamId disagrees across brief, manifest, and coverage receipt (tampered identity)");
    }
    const cursors = [
      pkg.brief.freshnessCursor,
      pkg.manifest.freshnessCursor,
      pkg.coverageReceipt.freshnessCursor,
    ];
    if (new Set(cursors).size !== 1) {
      fail("freshnessCursor disagrees across brief, manifest, and coverage receipt (tampered identity)");
    }

    // 4) Evidence binding. Every evidence link must bind to a SPECIFIC manifest source by id, and
    //    that source's hash + provenance must match the link exactly. Set-membership on the hash
    //    alone is not enough: it would let a link cite sourceId "A" while carrying source B's hash
    //    (or any hash present in the bundle), relabeling evidence while still "looking cited".
    //    Binding sourceId -> the exact manifest entry ties each link to the real source it names.
    //    Provenance integrity is governed by the PRESENCE of an evidence link, not by the claim's
    //    status badge (PM ruling msg b6ef351f): ANY present link on ANY claim OR decision must
    //    resolve to a captured manifest source with an exact hash/locator/receiptId/revision/level/
    //    label match. Status controls badge semantics, not whether integrity applies — otherwise a
    //    future non-observed state (`not_comparable`/`inferred`) could carry a relabeled link and
    //    bypass the check. Empty evidence is allowed only for the non-observed states (which surface
    //    their own explicit reason/confounder); an observed claim must carry at least one link.
    const manifestById = new Map(pkg.manifest.sources.map((s) => [s.id, s]));
    function bindLink(ownerLabel: string, link: WorkstreamBrief["currentOutcome"]["evidence"][number]): void {
      const source = manifestById.get(link.sourceId);
      if (!source) {
        fail(`${ownerLabel} cites sourceId ${link.sourceId} absent from the frozen manifest`);
      }
      if (!source.captured) {
        fail(`${ownerLabel} cites ${link.sourceId}, which was not captured (uncaptured sources cannot back a claim or decision)`);
      }
      if (link.sha256 !== source.sha256) {
        fail(`${ownerLabel} evidence hash does not match manifest source ${link.sourceId} (relabeled evidence)`);
      }
      // Locator/receiptId must follow the engine's DETERMINISTIC evidenceLink mapping (brief.mjs).
      // The link locator is not literally the manifest locator for receipt-backed kinds, but it is
      // not free either: receipt-backed kinds require receiptId=`receipt:<id>` and
      // locator=`<id>#receipt:<id>`; every other kind requires the manifest's own locator and no
      // receiptId. Enforcing this closes the escape path where a fabricated locator ("fabricated://
      // not-the-hashed-source") rides along with a valid hash and the UI's raw-evidence link lies.
      const receiptBacked = RECEIPT_BACKED_KINDS.has(source.kind);
      const expectedLocator = receiptBacked ? `${source.id}#receipt:${source.id}` : source.locator;
      if (link.locator !== expectedLocator) {
        fail(`${ownerLabel} evidence locator does not match the deterministic mapping for ${link.sourceId} (forged locator)`);
      }
      const expectedReceiptId = receiptBacked ? `receipt:${source.id}` : undefined;
      if ((link.receiptId ?? undefined) !== expectedReceiptId) {
        fail(`${ownerLabel} evidence receiptId does not match the deterministic mapping for ${link.sourceId} (forged receipt id)`);
      }
      if ((link.revision ?? undefined) !== (source.revision ?? undefined)) {
        fail(`${ownerLabel} evidence revision does not match manifest source ${link.sourceId}`);
      }
      if (link.evidenceLevel !== source.evidenceLevel || link.evidenceLabel !== source.evidenceLabel) {
        fail(`${ownerLabel} evidence level/label does not match manifest source ${link.sourceId} (relabeled evidence)`);
      }
    }
    const claimGroups = [
      [pkg.brief.currentOutcome],
      pkg.brief.sinceLastLooked,
      pkg.brief.reviewFirst,
      pkg.brief.verification,
      pkg.brief.risks,
      pkg.brief.blockers,
      pkg.brief.unknowns,
    ];
    for (const group of claimGroups) {
      for (const claim of group) {
        // Observed claims MUST carry evidence; other states may be empty (they surface a reason).
        if (claim.status === "observed" && !claim.evidence.length) {
          fail(`observed claim ${claim.id} has no evidence`);
        }
        // Any present link is bound regardless of status — integrity follows evidence, not badge.
        for (const link of claim.evidence) bindLink(`claim ${claim.id}`, link);
      }
    }
    // decisionsNeeded evidence is bound identically: any present link must resolve to a captured
    // manifest source (PM ruling msg 1e30fbbe — an active decision is supported by captured
    // evidence; excluded inputs belong in the coverage caveat, not as a decision's cited link).
    for (const decision of pkg.brief.decisionsNeeded) {
      for (const link of decision.evidence) bindLink(`decision ${decision.id}`, link);
    }

    // 4b) Receipt trust labels are OUTSIDE the semantic hash (they describe the mint environment,
    //     not brief content), so a tampered package could display "public"/"not-run"/inflated
    //     counts. Enforce the values the engine guarantees, and recompute the unsupported-observed
    //     count from the claims themselves (PM finding #4).
    if (pkg.brief.receipt.publication !== "local_only") {
      fail(`brief receipt publication must be "local_only" (got ${JSON.stringify(pkg.brief.receipt.publication)})`);
    }
    if (pkg.brief.receipt.secretScan !== "pass") {
      fail(`brief receipt secretScan must be "pass" (got ${JSON.stringify(pkg.brief.receipt.secretScan)})`);
    }
    const observedWithoutEvidence = claimGroups
      .flat()
      .filter((c) => c.status === "observed" && !c.evidence.length).length;
    if (pkg.brief.receipt.unsupportedObservedClaimCount !== observedWithoutEvidence) {
      fail("brief receipt unsupportedObservedClaimCount does not match the claims (tampered receipt)");
    }

    // 5) Correction receipt handling. PM finding #3: a bare correctionReceipt cannot prove a
    //    correction. verifyChain(pkg.brief, receipt) mistakes THIS brief for the original and, with
    //    no corrected brief supplied, returns true for a receipt that merely *claims* an arbitrary
    //    successor — a false positive. Sound verification requires BOTH the immutable original and
    //    the successor bound together (previousCheckpointId + old/new semantic and manifest hashes,
    //    verified with both sides). A single-brief WorkstreamCheckpointPackage cannot carry both, so
    //    the current contract cannot attest a correction chain at all.
    //
    //    Therefore, until the correction/export slice extends the package to carry a verifiable
    //    original snapshot, we FAIL CLOSED on any correctionReceipt rather than return a misleading
    //    correctionVerified:true. We still validate what is checkable so the error is precise: the
    //    receipt must be internally consistent (hash recomputes) and must bind THIS brief as the
    //    successor (correctionOf + correctedCheckpointId + correctedSemanticBriefSha256). Whatever
    //    the outcome, correctionVerified is never set true here.
    const correctionVerified: boolean | null = null;
    if (pkg.correctionReceipt) {
      const receipt = pkg.correctionReceipt;
      const { correctionReceiptSha256, ...core } = receipt;
      if (hash(stable(core)) !== correctionReceiptSha256) {
        fail("correction receipt hash does not recompute (tampered correction receipt)");
      }
      const thisIsSuccessor =
        receipt.correctedCheckpointId === pkg.brief.checkpointId &&
        pkg.brief.correctionOf === receipt.originalCheckpointId &&
        receipt.correctedSemanticBriefSha256 === pkg.brief.receipt.semanticBriefSha256;
      if (!thisIsSuccessor) {
        fail(
          "correction receipt does not bind this package as the corrected successor " +
            "(correctedCheckpointId / correctionOf / correctedSemanticBriefSha256 must reference this brief)",
        );
      }
      // Well-formed successor receipt, but the original snapshot is not carried by this package
      // contract, so the chain cannot be verified end-to-end. Fail closed rather than overclaim.
      fail(
        "correction verification requires the immutable original to be bound in the package; " +
          "the single-brief contract cannot attest a correction chain (pending the correction/export slice)",
      );
    }

    // 6) Secret scan the full package (defense in depth; the engine already scanned on mint).
    scan(stable(pkg));

    const sources = pkg.manifest.sources;
    const scanned = sources.filter((s) => s.captured);
    const excluded = sources.filter((s) => !s.captured && s.exclusionReason === "policy");
    const unavailable = sources.filter((s) => !s.captured && s.exclusionReason === "unavailable");
    const unsupported = sources.filter((s) => !s.captured && s.exclusionReason === "unsupported");
    const uncovered = sources.length - scanned.length;
    return {
      ok: true,
      pkg,
      workstreamId: pkg.manifest.workstreamId,
      freshnessCursor: pkg.manifest.freshnessCursor,
      coverage: {
        requested: sources.length,
        scanned: scanned.length,
        excluded: excluded.length,
        unavailable: unavailable.length,
        unsupported: unsupported.length,
        uncovered,
        fullyCovered: uncovered === 0,
      },
      exclusions: sources
        .filter((s) => !s.captured)
        .map((s) => ({ id: s.id, kind: s.kind, reason: s.exclusionReason || "unspecified", locator: s.locator })),
      correctionVerified,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
