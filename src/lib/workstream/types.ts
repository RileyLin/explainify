// Shared types for the Phase B Workstream Brief product flow. These describe the
// shapes the proven Phase A engine (tools/workstream-brief) produces and consumes;
// the UI reads them but never reimplements the engine's logic.

export interface EvidenceLink {
  sourceId: string;
  receiptId?: string;
  locator: string;
  revision?: string;
  sha256: string;
  evidenceLevel: string;
  evidenceLabel: string;
}

export interface Claim {
  id: string;
  text: string;
  status: "observed" | "unknown" | "inferred";
  evidence: EvidenceLink[];
  unknownReason?: string;
  missingSourceIds?: string[];
  reclassifiedFromDecision?: string;
}

export interface DecisionNeeded {
  id: string;
  question: string;
  owner: string;
  status: string;
  evidence: EvidenceLink[];
  freshnessDependsOn?: string[];
  freshnessUnverifiable?: boolean;
  coverageCaveat?: string;
  freshnessUnverifiableFrom?: string[];
}

export interface CoverageReceipt {
  schemaVersion: number;
  workstreamId: string;
  requestedSourceCount: number;
  availableSourceCount: number;
  scannedSourceCount: number;
  excludedSourceCount: number;
  unsupportedSourceCount: number;
  unavailableSourceCount: number;
  scannedSpanCount: number;
  freshnessCursor: string;
  sourceIds: {
    scanned: string[];
    excluded: string[];
    unsupported: string[];
    unavailable: string[];
  };
  manifestSha256: string;
  fullyCovered: boolean;
}

export interface WorkstreamManifestSource {
  id: string;
  kind: string;
  locator: string;
  revision?: string;
  sha256: string;
  evidenceLevel: string;
  evidenceLabel: string;
  captured: boolean;
  exclusionReason?: string;
}

export interface WorkstreamManifest {
  schemaVersion: number;
  workstreamId: string;
  generatedAt: string;
  freshnessCursor: string;
  sources: WorkstreamManifestSource[];
  bundleSha256: string;
}

export interface BriefReceipt {
  semanticBriefSha256: string;
  sourceManifestSha256: string;
  coverageReceiptSha256: string;
  unsupportedObservedClaimCount: number;
  secretScan: string;
  publication: string;
}

export interface WorkstreamBrief {
  schemaVersion: number;
  workstreamId: string;
  checkpointId: string;
  correctionOf?: string;
  // On a corrected successor only: the sha256 of the WHOLE canonical original package this
  // checkpoint corrects. It lives in the SEMANTIC brief (so it is committed by `checkpointId`),
  // which is what actually closes the parent-swap attack (independent review finding #1): the
  // successor's identity binds the exact parent content, so re-hashing the embedded original to a
  // different-but-valid package changes this value and the recomputed checkpointId no longer
  // matches. Absent on non-correction briefs (stableStringify omits it), so existing packages are
  // unaffected.
  correctionOfPackageSha256?: string;
  freshnessCursor: string;
  objective: string;
  currentOutcome: Claim;
  sinceLastLooked: Claim[];
  reviewFirst: Claim[];
  verification: Claim[];
  risks: Claim[];
  blockers: Claim[];
  unknowns: Claim[];
  decisionsNeeded: DecisionNeeded[];
  coverageReceiptPath: string;
  sourceManifestPath: string;
  correctionReceiptPaths: string[];
  evidenceLabel: string;
  receipt: BriefReceipt;
}

export interface BriefLinkage {
  correctionOf?: string;
  correctionReceiptPaths?: string[];
  sourceManifestPath?: string;
}

export interface BuildBriefResult {
  brief: WorkstreamBrief;
  coverageReceipt: CoverageReceipt;
  manifest: WorkstreamManifest;
}

export type CorrectionKind = "wrong" | "missing" | "stale" | "misleading";

export interface CorrectionInput {
  correctionKind: CorrectionKind;
  note: string;
  submittedAt: string;
  originalClaimId?: string;
  evidence?: EvidenceLink[];
  successor?: { bundle: unknown; manifest: unknown; linkage?: BriefLinkage };
}

export interface CorrectionReceipt {
  schemaVersion: number;
  originalCheckpointId: string;
  originalClaimId?: string;
  correctionKind: string;
  note: string;
  evidence: EvidenceLink[];
  submittedAt: string;
  correctedCheckpointId: string;
  correctedSemanticBriefSha256: string;
  successorBundleSha256: string;
  sameInputCheckpoint: boolean;
  // Canonical content bindings of the ORIGINAL package (independent review finding #1). The
  // original's brief receipt, manifest and coverage receipt all live OUTSIDE the semantic hash,
  // so binding the parent only by its semantic checkpointId let an attacker swap in a parent with
  // a different (but re-hashed) manifest/receipt while the checkpointId stayed the same. These
  // hashes bind the parent by CONTENT: `originalPackageSha256` is the sha256 of the whole canonical
  // original (it subsumes the parent's brief receipt, manifest, coverage receipt, rawSources and
  // any nested lineage), and the three narrower hashes give precise fail-closed messages. The
  // reader recomputes each from the embedded `previousPackage` and any mismatch fails closed.
  originalSemanticBriefSha256: string;
  originalManifestSha256: string;
  originalCoverageReceiptSha256: string;
  originalPackageSha256: string;
  correctionReceiptSha256: string;
}

export interface ApplyCorrectionResult {
  original: WorkstreamBrief;
  corrected: WorkstreamBrief;
  correctionReceipt: CorrectionReceipt;
}
