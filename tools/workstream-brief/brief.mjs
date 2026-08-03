import { readFile } from "node:fs/promises";
import path from "node:path";
import { scanOutput } from "../comprehension/evidence.mjs";
import { sha256, stableStringify } from "../comprehension/util.mjs";
import { buildSourceManifest } from "./freeze.mjs";

// WP-B: brief + coverage engine. Validates the frozen source manifest against the raw
// bundle, then builds claims, a coverage receipt, and a workstream brief. Integrity rules
// mirror task #15: an observed claim whose evidence is absent, unresolved, hash-mismatched,
// or mutable fails validation; unknown/uncovered states are first-class, not weak observed.
// No cloud/comparative/bilateral semantics are imported.

const RECEIPT_ATTESTED = "receipt_attested";
const INDEPENDENTLY_VERIFIED = "independently_verified";

function fail(message) {
  throw new Error(`Invalid workstream brief: ${message}`);
}

// A locator for a receipt-backed source uses the task #15 shape: <source-id>#receipt:<id>.
// For non-receipt spans (git spans, task-state) the locator is the source's own locator.
function evidenceLink(source) {
  const receiptBacked = ["command_receipt", "test_receipt", "deployment_receipt", "raft_message", "raft_task_state"]
    .includes(source.kind);
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

// Validate the manifest against the verbatim bundle. The manifest is only accepted if it is
// byte-for-byte the manifest that freezing the raw bundle would produce. This binds EVERY
// integrity/coverage/privacy field (kind, locator, revision, evidenceLabel, captured,
// exclusionReason, sha256, evidenceLevel, and the source set/order) to the frozen bundle — not
// just content hash + evidenceLevel. An attacker who flips `captured`, drops an `exclusionReason`,
// rewrites a `locator`, and recomputes `bundleSha256` no longer passes, so coverage cannot be
// forged from 14/16 to full-green and an excluded owner-DM decision cannot be revived.
export function validateManifestAgainstBundle(bundle, manifest) {
  if (manifest.schemaVersion !== 1) fail("manifest schemaVersion must be 1");

  // The self-consistency check (recomputed bundleSha256) still runs first as a cheap tamper
  // tripwire, but it is NOT sufficient on its own — a self-consistent forged manifest is caught
  // by the bundle-derived comparison below.
  const recomputed = sha256(stableStringify({ ...manifest, bundleSha256: "" }));
  if (manifest.bundleSha256 !== recomputed) fail("manifest bundleSha256 mismatch (tampered manifest)");

  // Rebuild the expected manifest from the raw bundle and require an exact match. buildSourceManifest
  // is deterministic, so the frozen manifest must equal it byte-for-byte (stable serialization).
  const expected = buildSourceManifest(bundle);
  if (manifest.bundleSha256 !== expected.bundleSha256) {
    fail("manifest does not match the manifest derived from the frozen bundle (coverage/privacy/integrity metadata mismatch)");
  }
  if (stableStringify(manifest) !== stableStringify(expected)) {
    // Same bundle hash but a differing field is a hash collision attempt or an out-of-band field;
    // pinpoint the first divergent source field so the failure is auditable.
    const byId = new Map(expected.sources.map((s) => [s.id, s]));
    for (const source of manifest.sources) {
      const exp = byId.get(source.id);
      if (!exp) fail(`manifest source ${source.id} is not derivable from the frozen bundle`);
      for (const field of ["kind", "locator", "revision", "sha256", "evidenceLevel", "evidenceLabel", "captured", "exclusionReason"]) {
        if (stableStringify(source[field] ?? null) !== stableStringify(exp[field] ?? null)) {
          fail(`source ${source.id} field ${field} was mutated relative to the frozen bundle`);
        }
      }
    }
    if (manifest.sources.length !== expected.sources.length) fail("manifest source set differs from the frozen bundle");
    fail("manifest differs from the frozen bundle");
  }

  for (const source of manifest.sources) {
    if (source.evidenceLevel !== RECEIPT_ATTESTED && source.evidenceLevel !== INDEPENDENTLY_VERIFIED) {
      fail(`source ${source.id} has an invalid evidenceLevel`);
    }
  }
  return manifest;
}

function claim(id, text, status, sources, extra = {}) {
  const evidence = sources.map(evidenceLink);
  if (status === "observed" && !evidence.length) fail(`observed claim ${id} has no evidence`);
  if (status === "unknown" && !extra.unknownReason && !(extra.missingSourceIds || []).length) {
    fail(`unknown claim ${id} needs unknownReason or missingSourceIds`);
  }
  return { id, text, status, evidence, ...extra };
}

function sourcesByIds(manifest, ids) {
  return ids.map((id) => {
    const source = manifest.sources.find((s) => s.id === id);
    if (!source) fail(`claim references unknown source ${id}`);
    if (!source.captured) fail(`claim references uncaptured source ${id}`);
    return source;
  });
}

export function buildCoverageReceipt(manifest) {
  const scanned = manifest.sources.filter((s) => s.captured);
  const excluded = manifest.sources.filter((s) => !s.captured && s.exclusionReason === "policy");
  const unsupported = manifest.sources.filter((s) => !s.captured && s.exclusionReason === "unsupported");
  const unavailable = manifest.sources.filter((s) => !s.captured && s.exclusionReason === "unavailable");
  const receipt = {
    schemaVersion: 1,
    workstreamId: manifest.workstreamId,
    requestedSourceCount: manifest.sources.length,
    availableSourceCount: manifest.sources.length,
    scannedSourceCount: scanned.length,
    excludedSourceCount: excluded.length,
    unsupportedSourceCount: unsupported.length,
    unavailableSourceCount: unavailable.length,
    scannedSpanCount: scanned.length,
    freshnessCursor: manifest.freshnessCursor,
    sourceIds: {
      scanned: scanned.map((s) => s.id),
      excluded: excluded.map((s) => s.id),
      unsupported: unsupported.map((s) => s.id),
      unavailable: unavailable.map((s) => s.id),
    },
    manifestSha256: manifest.bundleSha256,
  };
  // A coverage receipt with any uncaptured source cannot render as fully green.
  receipt.fullyCovered = receipt.scannedSourceCount === receipt.requestedSourceCount;
  return receipt;
}

// Build the Explainify Phase-2 workstream brief from the frozen manifest. Claims are
// derived deterministically from captured sources; the two uncaptured sources drive the
// unknowns/coverage story rather than any observed claim.
// `linkage.correctionOf`, when set, is the immutable parent checkpoint id this build corrects.
// It is embedded verbatim into the hashed semantic state so a correction ALWAYS produces a
// genuinely distinct, linked successor checkpoint (correctedCheckpointId !== originalCheckpointId),
// even before any source content changes. The default build (no linkage) omits the field entirely,
// so an uncorrected brief hashes exactly as before.
export function buildBrief(bundle, manifestInput, linkage = {}) {
  const manifest = validateManifestAgainstBundle(bundle, manifestInput);
  const s = (id) => sourcesByIds(manifest, [id])[0];
  const correctionOf = linkage.correctionOf || null;
  // A corrected checkpoint carries its correction-receipt lineage INSIDE the hashed semantic state
  // (a stable relative path — not a hash, so no hash cycle), so the linkage travels with the brief
  // and is not merely a co-located file. Default (uncorrected) builds keep the empty array.
  const correctionReceiptPaths = correctionOf ? (linkage.correctionReceiptPaths || ["correction-receipt.json"]) : [];

  // The public support/privacy contact blocker/decision is RESOLVED only when BOTH provenance
  // sources are captured: (a) the owner's decision itself (receipt-attested at Riley's message)
  // AND (b) the independent MX/task-#8 re-verification (independently verified at its own review
  // locator). A single owner-message locator proves the owner's choice, not that the mailbox is
  // deliverable or that it was applied — so trust is only claimed when both resolvable sources are
  // present. This is the real WP-D correction; the brief then drops the blocker/decision instead
  // of continuing to present a resolved item as open.
  const ownerContactDecision = manifest.sources.find((x) => x.id === "t8-owner-contact-decision" && x.captured);
  const contactVerification = manifest.sources.find((x) => x.id === "t8-contact-verification" && x.captured);
  const contactResolved = Boolean(ownerContactDecision && contactVerification);

  const currentOutcome = claim(
    "outcome",
    "Explainify's current Phase A outcome is ONE trustworthy, local-first Workstream Brief: a returning human should understand what autonomous agents did — the objective, progress, evidence, unknowns, and the decision needed — from this single artifact, without replaying task threads. The Phase 2 primitives behind it are proven building blocks, not the outcome: a single-run checkpoint spike (#12), an independent product gate (#13), and a comparative evidence spike (#15), with the release gate (#17) in review.",
    "observed",
    sourcesByIds(manifest, ["t12-task-state", "t15-review-go", "t17-task-state"]),
  );

  const sinceLastLooked = [
    claim("since-15-go", "Task #15 comparative evidence spike reached an independent GO at commit 896bb23 and was marked done.", "observed", sourcesByIds(manifest, ["t15-review-go", "t15-commit-spike"])),
    claim("since-12-13", "Tasks #12 and #13 closed: the checkpoint spike landed and its C01 reproducibility defect was fixed and independently re-verified.", "observed", sourcesByIds(manifest, ["t12-commit-c01fix", "t13-review-finding"])),
  ];

  if (contactResolved) {
    sinceLastLooked.push(claim(
      "since-contact-resolved",
      "The public support/privacy contact blocker is resolved: owner @riley-lin set the contact to admin@driftworks.dev (receipt-attested owner decision), and it was independently re-verified — the domain has an MX record (deliverable) and the change was applied across the pricing/privacy/terms surfaces at task #8 with the undeliverable support@explainify.dev fully removed.",
      "observed",
      // Cite BOTH provenance sources: the owner decision (receipt-attested) and the independent
      // MX/task-#8 re-verification (independently verified). The claim's trust is the floor of the
      // two — the resolution stands on both, not on the owner message alone.
      sourcesByIds(manifest, ["t8-owner-contact-decision", "t8-contact-verification"]),
    ));
  }

  // Review-first must stay non-actionable/coverage-supported. When the contact blocker is resolved
  // there is NO freshness-verifiable current action to lead with, so review-first points the reader
  // at the resolution + the reclassified Preview unknown rather than re-introducing the
  // freshness-unverifiable Preview state as "the remaining path" (which the covered bundle cannot
  // establish is still open). The stale Preview state lives ONLY in unknowns.
  const reviewFirst = contactResolved
    ? [claim("review-resolved", "Nothing coverage-supported requires an owner action first: the public-contact blocker is resolved (see since-last-looked). The Preview-deployment state remains an unknown — its freshness depends on an excluded owner DM — so verify it against that source before acting; it is not a current review-first action.", "observed", sourcesByIds(manifest, ["t8-owner-contact-decision", "t8-contact-verification"]))]
    : [claim("review-17-blocker", "Review the task #17 release blocker first: the public support/privacy contact support@explainify.dev is undeliverable, which is the one coverage-supported item blocking production.", "observed", sourcesByIds(manifest, ["t17-blocker-decision"]))];

  const verification = [
    claim("verify-15-tests", "Task #15 comparative tests pass 7/7 and the app suite is 96/96 on the reviewed commit; this is receipt-attested and independently reviewed.", "observed", sourcesByIds(manifest, ["t15-test-receipt", "t15-review-go"])),
    claim("verify-17-gates", "Task #17 combined release revision passes 101/101 tests, lint, tsc, audit, and a clean-env build; receipt-attested, not yet independently verified.", "observed", sourcesByIds(manifest, ["t17-test-receipt"])),
  ];

  const risks = [
    claim("risk-preview-freshness", "As of the freshness cursor, the frozen bundle recorded the Preview deployment returning 200 while serving the Vercel SSO login. Whether that protection is still in place — or was already resolved by the owner — cannot be confirmed from covered sources, because the owner's Preview-access decision lives in an excluded owner DM. Treat the Preview state as unverified, not as a pending owner action.", "observed", sourcesByIds(manifest, ["t17-deploy-status"])),
  ];

  const blockers = contactResolved
    ? []
    : [claim("blocker-contact", "The public support/privacy contact support@explainify.dev has no MX record and is undeliverable, which blocks production per the release gate.", "observed", sourcesByIds(manifest, ["t17-blocker-decision"]))];

  const unknowns = [
    claim("unknown-omission", "One real load-profile parity source for the comparative work was not scanned in this bundle, so coverage is incomplete.", "unknown", [], { missingSourceIds: ["t15-seeded-omission-loadprofile"] }),
    claim("unknown-owner-dm", "Owner direct-message context is intentionally excluded by policy and is not represented in any claim.", "unknown", [], { unknownReason: "owner DMs and private channels are out of the frozen bundle by policy" }),
  ];

  // A decision may depend for its freshness on a source that is NOT in the captured set
  // (e.g. an owner DM excluded by policy). When it does, the covered bundle cannot prove the
  // decision is still open, so the signal layer must qualify or suppress it — it may not assert
  // an unqualified decision_needed. `freshnessDependsOn` lists those out-of-coverage sources.
  const uncapturedIds = new Set(manifest.sources.filter((x) => !x.captured).map((x) => x.id));
  const rawDecisions = [
    {
      id: "decision-preview-protection",
      question: "Should Vercel deployment protection be lifted (or a bypass token issued) so the Phase 1 Preview can be validated?",
      owner: "@riley-lin",
      status: "needed",
      evidence: [evidenceLink(s("t17-deploy-status")), evidenceLink(s("t17-blocker-decision"))],
      // The owner's acceptance/rejection of the Preview lives in an excluded owner DM, so this
      // decision's current-ness cannot be confirmed from the frozen bundle.
      freshnessDependsOn: ["t17-owner-dm-thread"],
    },
    // The public-contact decision is only OPEN while the contact is unresolved. Once the owner's
    // captured decision resolves it (successor bundle), it must NOT reappear as a decision needed.
    ...(contactResolved ? [] : [{
      id: "decision-public-contact",
      question: "What reachable public support/privacy contact should replace the undeliverable support@explainify.dev before production?",
      owner: "@riley-lin",
      status: "needed",
      // Evidenced entirely by a captured blocker decision; its freshness does not hinge on the
      // excluded owner DM, so it remains a coverage-supported open decision.
      evidence: [evidenceLink(s("t17-blocker-decision"))],
    }]),
  ];
  // Partition the decisions by freshness. A decision whose current-ness cannot be confirmed from
  // covered sources is NOT presented as an active owner action: it leaves `decisionsNeeded`
  // entirely and is reclassified as a non-actionable unknown, so the reader never sees a stale
  // decision rendered as a fresh `decision_needed`. Only coverage-supported decisions remain.
  const decisionsNeeded = [];
  for (const d of rawDecisions) {
    const unverifiableFrom = (d.freshnessDependsOn || []).filter((id) => uncapturedIds.has(id));
    if (!unverifiableFrom.length) {
      decisionsNeeded.push(d);
      continue;
    }
    unknowns.push(claim(
      `unknown-stale-${d.id}`,
      `A decision was recorded in the source bundle ("${d.question}") but cannot be confirmed as still open from covered sources: its freshness depends on ${unverifiableFrom.join(", ")}, which is excluded from coverage. It is therefore NOT listed as a current decision needed; verify freshness against the excluded source before acting.`,
      "unknown",
      [],
      {
        unknownReason: "decision freshness is unverifiable from covered sources; owner DMs excluded by policy",
        missingSourceIds: unverifiableFrom,
        reclassifiedFromDecision: d.id,
      },
    ));
  }

  if (!manifest.freshnessCursor) fail("manifest is missing a freshnessCursor");
  const semantic = {
    schemaVersion: 1,
    workstreamId: manifest.workstreamId,
    checkpointId: "",
    ...(correctionOf ? { correctionOf } : {}),
    freshnessCursor: manifest.freshnessCursor,
    objective: "Give a returning reader Explainify's current outcome, what changed, what to review first, verification state, and the open blocker/decision — without reconstructing task threads.",
    currentOutcome,
    sinceLastLooked,
    reviewFirst,
    verification,
    risks,
    blockers,
    unknowns,
    decisionsNeeded,
    coverageReceiptPath: "coverage-receipt.json",
    sourceManifestPath: linkage.sourceManifestPath || "manifest-v0.1.json",
    correctionReceiptPaths,
    evidenceLabel: "receipt-attested unless a claim is marked independently verified",
  };

  // Integrity gate: no observed claim may carry an evidence link whose hash is not present
  // in the validated manifest (defends against a fabricated or mutated locator).
  const manifestHashes = new Set(manifest.sources.map((x) => x.sha256));
  const allClaims = [semantic.currentOutcome, ...semantic.sinceLastLooked, ...semantic.reviewFirst,
    ...semantic.verification, ...semantic.risks, ...semantic.blockers, ...semantic.unknowns];
  for (const c of allClaims.filter((x) => x.status === "observed")) {
    for (const link of c.evidence) {
      if (!manifestHashes.has(link.sha256)) fail(`observed claim ${c.id} has evidence outside the frozen manifest`);
    }
  }
  const unsupportedObservedClaimCount = allClaims.filter((c) => c.status === "observed" && !c.evidence.length).length;
  if (unsupportedObservedClaimCount !== 0) fail("brief contains an unsupported observed claim");

  const coverageReceipt = buildCoverageReceipt(manifest);
  const checkpointId = `checkpoint-${sha256(stableStringify(semantic)).slice(0, 12)}`;
  semantic.checkpointId = checkpointId;
  const semanticBriefSha256 = sha256(stableStringify(semantic));
  const brief = {
    ...semantic,
    receipt: {
      semanticBriefSha256,
      sourceManifestSha256: manifest.bundleSha256,
      coverageReceiptSha256: sha256(stableStringify(coverageReceipt)),
      unsupportedObservedClaimCount: 0,
      secretScan: "pass",
      publication: "local_only",
    },
  };
  scanOutput(stableStringify(brief));
  return { brief, coverageReceipt, manifest };
}

async function loadInputs(root) {
  const bundle = JSON.parse(await readFile(path.join(root, "benchmarks/workstream/sources-v0.1.json"), "utf8"));
  const manifest = JSON.parse(await readFile(path.join(root, "benchmarks/workstream/manifest-v0.1.json"), "utf8"));
  return { bundle, manifest };
}

export { loadInputs };
