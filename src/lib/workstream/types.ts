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
  correctionReceiptSha256: string;
}

export interface ApplyCorrectionResult {
  original: WorkstreamBrief;
  corrected: WorkstreamBrief;
  correctionReceipt: CorrectionReceipt;
}
