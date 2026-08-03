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
import { verifyCorrectionChain } from "@engine/correct.mjs";
import { sha256, stableStringify } from "@engine/../comprehension/util.mjs";
import { scanOutput } from "@engine/../comprehension/evidence.mjs";

import type {
  WorkstreamBrief,
  WorkstreamManifest,
  CoverageReceipt,
  CorrectionReceipt,
} from "./types";

// Narrow the generic .mjs primitives (tsc infers `any`) at this single boundary.
const freeze = buildSourceManifest as (bundle: unknown) => WorkstreamManifest;
const validateManifest = validateManifestAgainstBundle as (
  bundle: unknown,
  manifest: unknown,
) => WorkstreamManifest;
const coverageOf = buildCoverageReceipt as (manifest: unknown) => CoverageReceipt;
const verifyChain = verifyCorrectionChain as (
  original: WorkstreamBrief,
  receipt: CorrectionReceipt,
  corrected?: WorkstreamBrief | null,
) => boolean;
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
    if (pkg.checkpointId !== pkg.brief.checkpointId || pkg.workstreamId !== pkg.brief.workstreamId) {
      fail("package header does not match its brief (checkpointId/workstreamId)");
    }

    // 4) Every observed claim's evidence must reference a hash present in the validated manifest.
    const manifestHashes = new Set(pkg.manifest.sources.map((s) => s.sha256));
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
        if (claim.status === "observed") {
          if (!claim.evidence.length) fail(`observed claim ${claim.id} has no evidence`);
          for (const link of claim.evidence) {
            if (!manifestHashes.has(link.sha256)) {
              fail(`observed claim ${claim.id} cites evidence outside the frozen manifest`);
            }
          }
        }
      }
    }

    // 5) If the package carries a correction receipt, verify the chain (generic, content-attested).
    let correctionVerified: boolean | null = null;
    if (pkg.correctionReceipt) {
      correctionVerified = verifyChain(pkg.brief, pkg.correctionReceipt);
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
