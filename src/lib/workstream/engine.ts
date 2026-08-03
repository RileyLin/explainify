// Server-only bridge to the proven Phase A Workstream Brief engine.
//
// This is a THIN wrapper: it reuses the immutable engine (buildSourceManifest /
// buildBrief / applyCorrection / verifyCorrectionChain) as a library and adds NO
// brief/coverage/integrity/correction logic of its own. The engine's secret-scan,
// manifest-binding, and integrity gates run unchanged, so the product flow inherits
// the same trust guarantees as the offline Phase A generator.
//
// Server-only by construction: the engine imports node built-ins (node:crypto,
// node:child_process) that cannot run in a browser bundle, and every caller is a
// server action / route handler gated by assertLocalWorkstreams().
import { buildSourceManifest } from "@engine/freeze.mjs";
import { buildBrief } from "@engine/brief.mjs";
import { applyCorrection, verifyCorrectionChain } from "@engine/correct.mjs";

import type {
  WorkstreamBrief,
  WorkstreamManifest,
  CoverageReceipt,
  CorrectionInput,
  CorrectionReceipt,
} from "./types";

// The engine modules are validated `.mjs` JavaScript reused verbatim as a library, so
// tsc infers their return values as `any`. We narrow them to the shared types at this
// single boundary; the engine's own runtime gates (manifest binding, integrity,
// secret-scan) remain the source of truth for correctness.
const freeze = buildSourceManifest as (bundle: unknown) => WorkstreamManifest;
const build = buildBrief as (
  bundle: unknown,
  manifest: unknown,
) => { brief: WorkstreamBrief; coverageReceipt: CoverageReceipt; manifest: WorkstreamManifest };
const correct = applyCorrection as (
  bundle: unknown,
  manifest: unknown,
  correction: CorrectionInput,
) => { original: WorkstreamBrief; corrected: WorkstreamBrief; correctionReceipt: CorrectionReceipt };
const verifyChain = verifyCorrectionChain as (
  original: WorkstreamBrief,
  receipt: CorrectionReceipt,
  corrected?: WorkstreamBrief | null,
) => boolean;

export interface PreflightResult {
  ok: boolean;
  workstreamId?: string;
  freshnessCursor?: string;
  manifest?: WorkstreamManifest;
  coverage?: {
    requested: number;
    scanned: number;
    excluded: number;
    unavailable: number;
    unsupported: number;
    uncovered: number;
    fullyCovered: boolean;
  };
  exclusions?: Array<{ id: string; kind: string; reason: string; locator: string }>;
  error?: string;
}

export interface BriefResult {
  ok: boolean;
  brief?: WorkstreamBrief;
  coverageReceipt?: CoverageReceipt;
  manifest?: WorkstreamManifest;
  error?: string;
}

export interface CorrectionResult {
  ok: boolean;
  original?: WorkstreamBrief;
  corrected?: WorkstreamBrief;
  correctionReceipt?: CorrectionReceipt;
  verified?: boolean;
  error?: string;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Preflight a raw evidence bundle BEFORE any brief is generated. Freezes the
 * bundle into a hash-pinned manifest (the same deterministic manifest buildBrief
 * validates against) and reports freshness, coverage, exclusions, and any
 * validation failure — without synthesizing claims. Never throws; failures are
 * returned as `{ ok: false, error }` so the UI can render them.
 */
export function preflightBundle(bundle: unknown): PreflightResult {
  let manifest: WorkstreamManifest;
  try {
    manifest = freeze(bundle);
  } catch (e) {
    return { ok: false, error: message(e) };
  }
  const sources = manifest.sources;
  const scanned = sources.filter((s) => s.captured);
  const excluded = sources.filter((s) => !s.captured && s.exclusionReason === "policy");
  const unavailable = sources.filter((s) => !s.captured && s.exclusionReason === "unavailable");
  const unsupported = sources.filter((s) => !s.captured && s.exclusionReason === "unsupported");
  const uncovered = sources.length - scanned.length;
  return {
    ok: true,
    workstreamId: manifest.workstreamId,
    freshnessCursor: manifest.freshnessCursor,
    manifest,
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
      .map((s) => ({
        id: s.id,
        kind: s.kind,
        reason: s.exclusionReason || "unspecified",
        locator: s.locator,
      })),
  };
}

/**
 * Build the trusted brief from a raw bundle. Derives the manifest from the bundle
 * and runs the full engine integrity + secret-scan gate. Never throws.
 */
export function generateBrief(bundle: unknown): BriefResult {
  try {
    const manifest = freeze(bundle);
    const { brief, coverageReceipt } = build(bundle, manifest);
    return { ok: true, brief, coverageReceipt, manifest };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}

/**
 * Apply a correction to a brief built from `bundle`, producing an immutable,
 * linked successor checkpoint (correctedCheckpointId !== originalCheckpointId).
 * The chain is verified before returning. Never throws.
 */
export function correctBrief(bundle: unknown, correction: CorrectionInput): CorrectionResult {
  try {
    const manifest = freeze(bundle);
    const { original, corrected, correctionReceipt } = correct(bundle, manifest, correction);
    const verified = verifyChain(original, correctionReceipt, corrected);
    return { ok: true, original, corrected, correctionReceipt, verified };
  } catch (e) {
    return { ok: false, error: message(e) };
  }
}
