import { scanOutput } from "../comprehension/evidence.mjs";
import { sha256, stableStringify } from "../comprehension/util.mjs";
import { buildBrief } from "./brief.mjs";

// WP-D: correction + bounded-signal loop.
//
// A correction never mutates the original checkpoint. It records a CorrectionReceipt against
// an immutable originalCheckpointId, then regenerates the brief so the corrected checkpoint is
// a NEW, linked artifact. The task #15 tamper model applies: changing a source receipt,
// revision, evidence locator, correction link, or the semantic brief without regenerating the
// corresponding hash must fail validation.
//
// The signal emitter is a PURE payload builder. It never posts on its own; the dogfood harness
// is the only thing that posts one bounded signal through the existing Raft CLI and records the
// resulting message id. This is deliberately not a notification platform.

const CORRECTION_KINDS = ["wrong", "missing", "stale", "misleading"];

function fail(message) {
  throw new Error(`Invalid correction: ${message}`);
}

// Build a CorrectionReceipt against an immutable original checkpoint and regenerate a genuinely
// distinct, linked corrected checkpoint. `submittedAt` is caller-supplied (no clock in the engine,
// so the receipt stays deterministic and testable); the CLI passes an ISO timestamp.
//
// The corrected checkpoint is built with a `correctionOf` linkage to the immutable original, so its
// hashed semantic state (and therefore its checkpointId) ALWAYS differs from the original — a
// correction can never silently reuse the parent's id. When `correction.successor` supplies a
// successor {bundle, manifest} (the real WP-D case: new owner evidence ingested into a v0.2
// bundle), the corrected brief is built from those inputs so its semantic content also changes;
// otherwise it rebuilds the same frozen inputs and the linkage alone makes it distinct.
export function applyCorrection(bundle, manifest, correction) {
  const original = buildBrief(bundle, manifest);
  if (!correction || typeof correction !== "object") fail("correction payload required");
  if (!CORRECTION_KINDS.includes(correction.correctionKind)) {
    fail(`correctionKind must be one of ${CORRECTION_KINDS.join(", ")}`);
  }
  if (!correction.note || !correction.note.trim()) fail("note is required");
  if (!correction.submittedAt) fail("submittedAt is required (ISO timestamp, caller-supplied)");

  // If a specific claim is corrected, it must exist in the original brief.
  const allClaimIds = new Set([
    original.brief.currentOutcome.id,
    ...original.brief.sinceLastLooked.map((c) => c.id),
    ...original.brief.reviewFirst.map((c) => c.id),
    ...original.brief.verification.map((c) => c.id),
    ...original.brief.risks.map((c) => c.id),
    ...original.brief.blockers.map((c) => c.id),
    ...original.brief.unknowns.map((c) => c.id),
    ...original.brief.decisionsNeeded.map((d) => d.id),
  ]);
  if (correction.originalClaimId && !allClaimIds.has(correction.originalClaimId)) {
    fail(`originalClaimId ${correction.originalClaimId} is not in the original checkpoint`);
  }

  // Correction evidence, when supplied, must resolve to a frozen manifest (same integrity rule as
  // an observed claim). When the correction ingests successor evidence, that evidence lives in the
  // successor manifest, so accept a hash present in EITHER the original or the successor manifest;
  // otherwise only the original manifest applies. A correction can also be a pure "missing"/"stale"
  // note with no new evidence, which is allowed but recorded as unverified supporting evidence.
  const manifestHashes = new Set(manifest.sources.map((x) => x.sha256));
  if (correction.successor?.manifest?.sources) {
    for (const x of correction.successor.manifest.sources) manifestHashes.add(x.sha256);
  }
  const evidence = (correction.evidence || []).map((link) => {
    if (!manifestHashes.has(link.sha256)) fail(`correction evidence ${link.sourceId || "?"} is outside the frozen manifest`);
    return link;
  });

  // The corrected checkpoint is a fresh brief build LINKED to the immutable original via
  // `correctionOf`. That linkage is embedded in the hashed semantic state, so the corrected
  // checkpointId is always genuinely distinct from the original — a correction can never silently
  // reuse the parent id. When a successor {bundle, manifest} is supplied (new owner evidence), the
  // corrected brief is built from those inputs so the content changes too; otherwise the linkage
  // alone distinguishes it. The original checkpoint id is preserved verbatim.
  const successor = correction.successor;
  if (successor && (!successor.bundle || !successor.manifest)) {
    fail("correction.successor requires both bundle and manifest");
  }
  const corrected = successor
    ? buildBrief(successor.bundle, successor.manifest, { correctionOf: original.brief.checkpointId, ...(successor.linkage || {}) })
    : buildBrief(bundle, manifest, { correctionOf: original.brief.checkpointId });
  if (corrected.brief.checkpointId === original.brief.checkpointId) {
    fail("corrected checkpoint id must differ from the original (linkage/content did not change it)");
  }
  const receiptCore = {
    schemaVersion: 1,
    originalCheckpointId: original.brief.checkpointId,
    ...(correction.originalClaimId ? { originalClaimId: correction.originalClaimId } : {}),
    correctionKind: correction.correctionKind,
    note: correction.note,
    evidence,
    submittedAt: correction.submittedAt,
    correctedCheckpointId: corrected.brief.checkpointId,
    correctedSemanticBriefSha256: corrected.brief.receipt.semanticBriefSha256,
    successorBundleSha256: successor ? successor.manifest.bundleSha256 : manifest.bundleSha256,
    sameInputCheckpoint: false,
  };
  const correctionReceipt = {
    ...receiptCore,
    correctionReceiptSha256: sha256(stableStringify(receiptCore)),
  };

  scanOutput(stableStringify(correctionReceipt));
  return { original: original.brief, corrected: corrected.brief, correctionReceipt };
}

// Recompute a brief's semantic hash from the brief object with its `receipt` stripped, exactly as
// buildBrief hashes it (checkpointId is already embedded in the semantic before hashing). This lets
// verification RECOMPUTE the hash from content rather than trusting the stored `receipt` field, so
// a mutated claim (with a stale stored hash) is caught.
function recomputeSemanticSha256(brief) {
  const { receipt, ...semantic } = brief;
  void receipt;
  return sha256(stableStringify(semantic));
}

// Verify a correction chain under the #15 tamper model. Both sides are attested from CONTENT, not
// from stored hash fields:
//   - the receipt hash must recompute from the receipt core;
//   - the linked original checkpoint id must match the immutable original brief, and the original
//     brief's semantic hash must recompute to its own stored receipt hash (original not tampered);
//   - when the corrected brief is supplied it must be a genuinely distinct successor whose embedded
//     `correctionOf` links back, and whose semantic hash RECOMPUTES to both the receipt's
//     `correctedSemanticBriefSha256` and its own stored `receipt.semanticBriefSha256` — so a
//     claim-text mutation with a stale stored hash is rejected.
export function verifyCorrectionChain(originalBrief, correctionReceipt, correctedBrief = null) {
  const { correctionReceiptSha256, ...core } = correctionReceipt;
  if (sha256(stableStringify(core)) !== correctionReceiptSha256) {
    fail("correction receipt hash mismatch (tampered receipt)");
  }
  if (correctionReceipt.originalCheckpointId !== originalBrief.checkpointId) {
    fail("correction is not linked to the provided original checkpoint");
  }
  // Original side: recompute from content and cross-check its own stored hash.
  const originalRecomputed = recomputeSemanticSha256(originalBrief);
  if (originalRecomputed !== originalBrief.receipt.semanticBriefSha256) {
    fail("original brief semantic hash does not recompute (tampered original)");
  }
  if (correctedBrief) {
    if (correctedBrief.checkpointId === originalBrief.checkpointId) {
      fail("corrected checkpoint id must differ from the original");
    }
    if (correctedBrief.checkpointId !== correctionReceipt.correctedCheckpointId) {
      fail("corrected brief checkpoint id does not match the receipt");
    }
    if (correctedBrief.correctionOf !== originalBrief.checkpointId) {
      fail("corrected brief is not linked back to the original checkpoint");
    }
    // Recompute the corrected semantic hash from CONTENT and require it to match BOTH the receipt's
    // recorded hash and the corrected brief's own stored hash. A mutated claim breaks this even if
    // the stored fields were left untouched.
    const correctedRecomputed = recomputeSemanticSha256(correctedBrief);
    if (correctedRecomputed !== correctedBrief.receipt.semanticBriefSha256) {
      fail("corrected brief semantic hash does not recompute (tampered corrected brief)");
    }
    if (correctedRecomputed !== correctionReceipt.correctedSemanticBriefSha256) {
      fail("corrected brief semantic hash does not match the receipt");
    }
  }
  return true;
}

// Build a bounded Raft signal payload for a single decision-needed or blocking claim. Pure:
// returns the payload plus the exact CLI argv the dogfood harness would run. It does not post.
//
// Freshness guard (WP-D dogfood correction): a decision whose current-ness depends on a source
// outside coverage (e.g. an owner DM excluded by policy) MUST NOT be emitted as an unqualified
// `decision_needed`. By default such a decision is SUPPRESSED. With `qualifyStale: true` it may
// instead be emitted as a `decision_needed_unverified` signal that carries the coverage caveat,
// so a reader is told to verify freshness rather than treating it as a fresh open decision.
export function buildSignal(brief, { target, briefPath, qualifyStale = false } = {}) {
  if (!target) fail("signal requires a target thread");

  // Pick the first decision whose freshness IS verifiable from coverage; only fall back to a
  // freshness-unverifiable one when explicitly asked to qualify it.
  const decisions = brief.decisionsNeeded || [];
  const freshDecision = decisions.find((d) => !d.freshnessUnverifiable);
  const staleDecision = decisions.find((d) => d.freshnessUnverifiable);
  const blocker = (brief.blockers || [])[0];

  let kind; let label; let claimId; let coverageCaveat;
  if (freshDecision) {
    kind = "decision_needed"; label = freshDecision.question; claimId = freshDecision.id;
  } else if (staleDecision && qualifyStale) {
    kind = "decision_needed_unverified";
    label = staleDecision.question;
    claimId = staleDecision.id;
    coverageCaveat = staleDecision.coverageCaveat;
  } else if (staleDecision) {
    // A stale-synthesis decision with no fresh alternative: suppress rather than misinform.
    return {
      emitted: false,
      reason: "decision freshness is unverifiable from covered sources; signal suppressed (pass qualifyStale to emit a caveated decision_needed_unverified)",
      suppressedClaimId: staleDecision.id,
      freshnessUnverifiableFrom: staleDecision.freshnessUnverifiableFrom,
    };
  } else if (blocker) {
    kind = "blocking"; label = blocker.text; claimId = blocker.id;
  } else {
    return { emitted: false, reason: "no decision-needed or blocking claim in this brief" };
  }

  // Bound the label so a signal stays a pointer, not a data dump.
  const boundedLabel = label.length > 140 ? `${label.slice(0, 137)}...` : label;
  const payload = {
    target,
    kind,
    label: boundedLabel,
    briefPath: briefPath || brief.checkpointId,
    claimId,
    ...(coverageCaveat ? { coverageCaveat } : {}),
  };
  // The harness posts the label as the message body via the existing CLI; the structured
  // fields travel as a fenced json block for the reader. argv is returned for auditability.
  return {
    emitted: true,
    payload,
    cliArgv: ["message", "send", "--target", target],
  };
}
