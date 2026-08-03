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
  // Correction lineage (present only on a corrected successor package). A correction carries BOTH
  // the successor (this package's brief/manifest/coverage/rawSources) AND the canonical-content-immutable
  // original it corrects (`previousPackage`), bound by a correction receipt. `previousCheckpointId`
  // mirrors `brief.correctionOf` at the package header. The reader verifies the whole chain by
  // re-validating the embedded original and checking the receipt binds the two (see step 5).
  correctionReceipt?: CorrectionReceipt;
  previousCheckpointId?: string;
  previousPackage?: WorkstreamCheckpointPackage;
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

// Correction-chain resource limits (PM finding #4). A correction embeds its immutable original,
// so a long chain nests packages. Bound depth, total serialized size, and per-package source count
// BEFORE recursing, and scan only each package's OWN layer (the parent is scanned by its own
// recursive validation) so total cost stays linear in the chain length, not quadratic.
const MAX_CORRECTION_DEPTH = 24;
const MAX_PACKAGE_BYTES = 262_144; // 256 KiB canonical serialization for the whole nested package
const MAX_SOURCES_PER_PACKAGE = 512;
const MAX_SOURCE_BYTES = 65_536; // 64 KiB per raw source (re-review finding #2)

// Encoded UTF-8 byte length — NOT String.length, which counts UTF-16 code units and undercounts
// multi-byte content (a 255 KB UTF-8 source can sit under a 262,144 code-unit cap). Falls back to a
// conservative code-unit count if TextEncoder is unavailable.
function utf8Bytes(value: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value).length;
  return unescape(encodeURIComponent(value)).length;
}

// A claim's status is a strict runtime enum (PM finding #3). Anything else (e.g. "verified") is
// rejected, so unknown data can never slip through as a cosmetically-trusted claim. `not_comparable`
// (task #23) is a first-class non-observed comparative state — it is subject to the same
// non-observed reason requirement and the same evidence-link binding as unknown/inferred, so an
// evidence-backed not_comparable claim cannot bypass integrity or masquerade as observed.
const VALID_CLAIM_STATUSES = new Set(["observed", "unknown", "inferred", "not_comparable"]);

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

// Map every claim AND decision in a brief to its canonical (stable-stringified) serialization,
// keyed by id. Used by the correction step to diff a parent against its successor item-by-item so
// the "exactly one target changed" contract is enforced by real content comparison, not by
// checkpointId (which always differs on a correction because `correctionOf` changes). Ids are
// globally unique (enforced at import), so a single map with no collisions is well-defined.
function semanticItemsById(brief: WorkstreamBrief): Map<string, string> {
  const items = new Map<string, string>();
  const claims = [
    brief.currentOutcome,
    ...brief.sinceLastLooked,
    ...brief.reviewFirst,
    ...brief.verification,
    ...brief.risks,
    ...brief.blockers,
    ...brief.unknowns,
  ];
  for (const c of claims) items.set(c.id, stable(c));
  for (const d of brief.decisionsNeeded) items.set(d.id, stable(d));
  return items;
}

/**
 * Validate a checkpoint package with the proven generic engine primitives, recomputing every hash
 * from the package's own raw content. Portable across workstreams (never calls buildBrief). Never
 * throws — a tampered or malformed package returns `{ ok: false, error }` so the UI fails closed.
 */
export function validatePackage(input: unknown): ValidatePackageResult {
  return validatePackageAt(input, 0);
}

// Internal recursive validator. `depth` counts correction-chain hops (0 = the package the caller
// handed in). Correction chains embed their immutable original, so the reader recurses into each
// `previousPackage`; `depth` and the size/source bounds below are enforced BEFORE recursing so a
// crafted deep or huge chain fails closed instead of exhausting the process (PM finding #4).
function validatePackageAt(input: unknown, depth: number): ValidatePackageResult {
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

    // Correction-chain bounds (PM finding #4). Depth is checked at the ROOT once against the whole
    // nested serialization; per-layer we cap the source count. A crafted chain that exceeds any
    // bound fails closed before doing expensive work.
    if (depth > MAX_CORRECTION_DEPTH) {
      fail(`correction chain exceeds the maximum depth of ${MAX_CORRECTION_DEPTH}`);
    }
    if (!Array.isArray(pkg.manifest.sources) || pkg.manifest.sources.length > MAX_SOURCES_PER_PACKAGE) {
      fail(`package exceeds the maximum of ${MAX_SOURCES_PER_PACKAGE} manifest sources`);
    }
    // Per-source byte cap (re-review finding #2): a single huge raw source is refused before any
    // hashing work, measured in encoded UTF-8 bytes.
    if (Array.isArray(pkg.rawSources)) {
      for (const s of pkg.rawSources) {
        if (typeof s?.content === "string" && utf8Bytes(s.content) > MAX_SOURCE_BYTES) {
          fail(`raw source ${s.id} exceeds the maximum of ${MAX_SOURCE_BYTES} bytes`);
        }
      }
    }
    if (depth === 0) {
      // Bound the WHOLE nested package once at the root, in ENCODED UTF-8 BYTES (not UTF-16 code
      // units); combined with the depth cap this makes the total validation cost bounded regardless
      // of how the chain is shaped.
      const totalBytes = utf8Bytes(stable(pkg));
      if (totalBytes > MAX_PACKAGE_BYTES) {
        fail(`package (with its correction chain) exceeds the maximum size of ${MAX_PACKAGE_BYTES} bytes`);
      }
    }

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
    // 4a) Global id uniqueness (PM finding #5). Duplicate claim/decision ids let a correction's
    //     "exactly one claim" contract mutate two items at once, and make evidence/target binding
    //     ambiguous. Reject any duplicate across ALL claims and decisions at import, so an ambiguous
    //     package never renders and never becomes a correction source.
    const allIds = [...claimGroups.flat().map((c) => c.id), ...pkg.brief.decisionsNeeded.map((d) => d.id)];
    const seenIds = new Set<string>();
    for (const id of allIds) {
      if (seenIds.has(id)) fail(`duplicate claim/decision id ${id} (ids must be globally unique)`);
      seenIds.add(id);
    }
    for (const group of claimGroups) {
      for (const claim of group) {
        // Status is a strict runtime enum (PM finding #3) — reject "verified" or any value outside
        // observed|unknown|inferred, so untrusted data can never render as a cosmetically-trusted
        // claim.
        if (!VALID_CLAIM_STATUSES.has(claim.status)) {
          fail(`claim ${claim.id} has invalid status ${JSON.stringify(claim.status)} (expected observed, unknown, or inferred)`);
        }
        // Observed claims MUST carry evidence; every NON-observed claim MUST carry an explicit
        // reason/confounder (an unknownReason or at least one missingSourceId) — a reasonless
        // unknown/inferred is refused (PM finding #3).
        if (claim.status === "observed") {
          if (!claim.evidence.length) fail(`observed claim ${claim.id} has no evidence`);
        } else if (!(claim.unknownReason && claim.unknownReason.trim()) && !claim.missingSourceIds?.length) {
          fail(`${claim.status} claim ${claim.id} has no reason or missing-source confounder (non-observed claims must explain themselves)`);
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

    // 5) Correction chain. A corrected successor package carries BOTH sides: this package's own
    //    (already-validated) brief/manifest/coverage AND the canonical-content-immutable original it corrects,
    //    embedded as `previousPackage` and bound by a `correctionReceipt`. Sound verification (PM
    //    finding #3) requires proving the chain end-to-end from CONTENT, never trusting a stored
    //    flag:
    //      - the receipt hash recomputes from its core;
    //      - the embedded original RE-VALIDATES fully on its own (its checkpointId recomputes from
    //        its own raw sources → byte-immutability is proven, not asserted). It is validated
    //        recursively, so a tampered original fails closed exactly like a top-level package;
    //      - the header lineage agrees: previousCheckpointId == brief.correctionOf ==
    //        receipt.originalCheckpointId == original.checkpointId;
    //      - the receipt binds THIS package as the successor: correctedCheckpointId +
    //        correctedSemanticBriefSha256 + successorBundleSha256 all reference this brief/manifest;
    //      - a cited originalClaimId, if present, exists in the original brief.
    //    Only when every check passes is correctionVerified true. Any correctionReceipt WITHOUT an
    //    embedded, re-validating original still fails closed (a bare receipt can claim an arbitrary
    //    successor). Badge honesty for the successor's own claims is already enforced by step 4 —
    //    an observed corrected claim must carry captured, exactly-bound evidence, so a correction
    //    cannot keep a green badge without resolving evidence.
    let correctionVerified: boolean | null = null;
    if (pkg.correctionReceipt || pkg.previousPackage || pkg.previousCheckpointId) {
      const receipt = pkg.correctionReceipt;
      if (!receipt) fail("correction lineage present but correctionReceipt is missing");
      if (!pkg.previousPackage) {
        fail(
          "correction receipt requires the original bound in the package by its canonical content hash " +
            "(previousPackage); a bare receipt cannot attest a correction chain",
        );
      }
      const { correctionReceiptSha256, ...core } = receipt;
      if (hash(stable(core)) !== correctionReceiptSha256) {
        fail("correction receipt hash does not recompute (tampered correction receipt)");
      }
      // Re-validate the embedded original end-to-end (recursing one hop deeper). Its own
      // checkpointId recomputes from its raw sources, so any mutation of the "immutable" original is
      // caught here (fails closed).
      const originalResult = validatePackageAt(pkg.previousPackage, depth + 1);
      if (!originalResult.ok) {
        fail(`embedded original package does not validate: ${originalResult.error}`);
      }
      const original = pkg.previousPackage;

      // 5a) Bind the parent by CONTENT, not just by its semantic checkpointId (independent review
      //     finding #1). The parent's brief receipt, manifest and coverage receipt all live OUTSIDE
      //     its semantic hash, so binding by checkpointId alone let an attacker embed a parent with
      //     a re-hashed manifest/receipt while keeping the same checkpointId. Recompute the parent's
      //     canonical hashes from the embedded original and require each to match the receipt's
      //     recorded value. The whole-package hash subsumes the parent's receipt, rawSources and any
      //     nested lineage; the three narrower hashes give precise fail-closed messages.
      const originalPackageSha256 = hash(stable(original));
      if (receipt.originalSemanticBriefSha256 !== original.brief.receipt.semanticBriefSha256) {
        fail("correction receipt originalSemanticBriefSha256 does not match the embedded original");
      }
      if (receipt.originalManifestSha256 !== original.manifest.bundleSha256) {
        fail("correction receipt originalManifestSha256 does not match the embedded original");
      }
      if (receipt.originalCoverageReceiptSha256 !== hash(stable(original.coverageReceipt))) {
        fail("correction receipt originalCoverageReceiptSha256 does not match the embedded original");
      }
      if (receipt.originalPackageSha256 !== originalPackageSha256) {
        fail("correction receipt originalPackageSha256 does not match the embedded original (parent swapped or mutated)");
      }
      // The successor's SEMANTIC brief commits the parent's whole-package hash, so the successor's
      // checkpointId (already verified in step 3) binds the exact parent content. Swapping the
      // embedded parent for a different-but-valid package changes originalPackageSha256, which no
      // longer matches this committed value → fails closed even though the parent revalidates.
      if (pkg.brief.correctionOfPackageSha256 !== originalPackageSha256) {
        fail("successor brief correctionOfPackageSha256 does not match the embedded original (parent not bound into successor identity)");
      }

      const lineage = [
        pkg.previousCheckpointId,
        pkg.brief.correctionOf,
        receipt.originalCheckpointId,
        original.brief.checkpointId,
      ];
      if (new Set(lineage).size !== 1) {
        fail(
          "correction lineage disagrees (previousCheckpointId / brief.correctionOf / " +
            "receipt.originalCheckpointId / original.checkpointId must all reference the same original)",
        );
      }
      // The receipt must bind THIS package as the corrected successor.
      if (
        receipt.correctedCheckpointId !== pkg.brief.checkpointId ||
        receipt.correctedSemanticBriefSha256 !== pkg.brief.receipt.semanticBriefSha256 ||
        receipt.successorBundleSha256 !== pkg.manifest.bundleSha256
      ) {
        fail(
          "correction receipt does not bind this package as the corrected successor " +
            "(correctedCheckpointId / correctedSemanticBriefSha256 / successorBundleSha256)",
        );
      }
      // A distinct successor: a correction must actually change something.
      if (original.brief.checkpointId === pkg.brief.checkpointId) {
        fail("corrected checkpoint id must differ from the original");
      }

      // 5b) The WHOLE allowed delta (re-review finding #1). A correction may change EXACTLY one
      //     claim — the receipt's originalClaimId — plus the lineage/freshness bookkeeping that a
      //     correction is defined to update, and it may add ONLY the sources that the corrected
      //     target (or the receipt) actually cites. Everything else — every other claim/decision,
      //     the objective and any other semantic brief field, and every parent source (metadata AND
      //     raw content) — must be canonically identical to the parent. The earlier check compared
      //     only claims/decisions, so a changed `objective` or an unreferenced added source slipped
      //     through with correctionVerified:true. We now diff the entire package.
      if (!receipt.originalClaimId) {
        fail("correction receipt must name the originalClaimId it targets");
      }
      const originalItems = semanticItemsById(original.brief);
      const successorItems = semanticItemsById(pkg.brief);
      if (!originalItems.has(receipt.originalClaimId)) {
        fail(`correction cites originalClaimId ${receipt.originalClaimId} absent from the original checkpoint`);
      }
      if (!successorItems.has(receipt.originalClaimId)) {
        fail(`correction target ${receipt.originalClaimId} is absent from the corrected successor`);
      }
      // (i) Claim/decision id set may not change, and exactly the target claim may differ.
      const originalKeys = [...originalItems.keys()].sort();
      const successorKeys = [...successorItems.keys()].sort();
      if (stable(originalKeys) !== stable(successorKeys)) {
        fail("correction changed the set of claim/decision ids (a correction may only mutate one existing item)");
      }
      const changedIds: string[] = [];
      for (const id of originalKeys) {
        if (originalItems.get(id) !== successorItems.get(id)) changedIds.push(id);
      }
      if (changedIds.length === 0) {
        fail("correction is a no-op: no claim or decision changed between the original and the successor");
      }
      if (changedIds.length > 1 || changedIds[0] !== receipt.originalClaimId) {
        fail(
          `correction changed ${changedIds.join(", ")} but the receipt targets ${receipt.originalClaimId} ` +
            "(a correction may mutate only its single named target)",
        );
      }
      // (ii) Every OTHER semantic brief field must be canonically identical. We compare the two
      //      briefs with the target claim, all claim/decision groups, and the fields a correction is
      //      allowed to update (lineage + freshness + receipt) removed; anything left that differs
      //      (e.g. `objective`) is a disallowed change. Removing the claim GROUPS avoids re-flagging
      //      the target we already validated, and the id-set check above already proved no
      //      claim/decision was added or removed.
      // NOTE: freshnessCursor is deliberately NOT mutable across a correction (final review
      // finding). A mutate-one-claim correction that added no whole-brief-covering evidence must
      // not advance currency; leaving the cursor in briefResidue forces the successor's cursor to
      // equal the parent's. Combined with step 3b (brief/manifest/coverage cursors must agree
      // within a package) and the parent re-validating, the manifest/coverage cursors are pinned
      // too. A caller that sets freshnessCursor: "2099-..." with zero new sources fails closed.
      const CORRECTION_MUTABLE_FIELDS = new Set([
        "checkpointId",
        "correctionOf",
        "correctionOfPackageSha256",
        "correctionReceiptPaths",
        "receipt",
      ]);
      const CLAIM_GROUP_FIELDS = new Set([
        "currentOutcome",
        "sinceLastLooked",
        "reviewFirst",
        "verification",
        "risks",
        "blockers",
        "unknowns",
        "decisionsNeeded",
      ]);
      function briefResidue(brief: WorkstreamBrief): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(brief as unknown as Record<string, unknown>)) {
          if (CORRECTION_MUTABLE_FIELDS.has(k) || CLAIM_GROUP_FIELDS.has(k)) continue;
          out[k] = v;
        }
        return out;
      }
      if (stable(briefResidue(original.brief)) !== stable(briefResidue(pkg.brief))) {
        fail("correction changed a non-target brief field (only the named claim, lineage, and freshness may change)");
      }

      // (iii) Sources: every parent source must be UNCHANGED (manifest entry + raw content), and the
      //       only sources the successor may ADD are exactly those newly cited by the corrected
      //       target claim or the receipt evidence. No parent source may be removed or mutated, and
      //       no unreferenced source may be added (the added-unreferenced-source attack).
      const originalManifestById = new Map(original.manifest.sources.map((s) => [s.id, stable(s)]));
      const originalRawById = new Map(original.rawSources.map((s) => [s.id, s.content]));
      const successorManifestById = new Map(pkg.manifest.sources.map((s) => [s.id, stable(s)]));
      const successorRawById = new Map(pkg.rawSources.map((s) => [s.id, s.content]));
      for (const [id, entry] of originalManifestById) {
        if (!successorManifestById.has(id)) fail(`correction removed parent source ${id} (sources are immutable)`);
        if (successorManifestById.get(id) !== entry) fail(`correction mutated parent source ${id} (sources are immutable)`);
        if (successorRawById.get(id) !== originalRawById.get(id)) {
          fail(`correction mutated the raw content of parent source ${id} (sources are immutable)`);
        }
      }
      const addedSourceIds = [...successorManifestById.keys()].filter((id) => !originalManifestById.has(id));
      // The set of source ids legitimately introduced by the correction = cited-by-target ∪
      // cited-by-receipt, restricted to ids the parent did not already have.
      const target = successorItems.get(receipt.originalClaimId)!;
      const targetEvidence = ((JSON.parse(target) as { evidence?: Array<{ sourceId: string }> }).evidence ?? []);
      const referencedIds = new Set<string>();
      for (const link of targetEvidence) referencedIds.add(link.sourceId);
      for (const link of receipt.evidence) referencedIds.add(link.sourceId);
      for (const id of addedSourceIds) {
        if (!referencedIds.has(id)) {
          fail(`correction added source ${id} that the corrected claim/receipt does not cite (unreferenced addition)`);
        }
      }

      // 5c) Bind the receipt's own evidence through the SAME rules as claim evidence, and require it
      //     to equal the corrected target's evidence (independent review finding #2). Otherwise the
      //     receipt could cite a ghost source or attest evidence unrelated to what actually changed.
      for (const link of receipt.evidence) bindLink(`correction receipt`, link);
      if (stable(receipt.evidence) !== stable(targetEvidence)) {
        fail("correction receipt evidence does not match the corrected target claim's evidence");
      }

      correctionVerified = true;
    }

    // 6) Secret scan THIS layer only (defense in depth; the engine already scanned on mint). The
    //    embedded original is scanned by its own recursive validation above, so we scan the package
    //    WITHOUT its previousPackage to keep total cost linear in the chain length (PM finding #4)
    //    rather than re-scanning the full nested tree at every level.
    const { previousPackage: _omitParent, ...ownLayer } = pkg;
    void _omitParent;
    scan(stable(ownLayer));

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
