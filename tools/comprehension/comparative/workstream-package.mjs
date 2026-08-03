// Task #23 adapter: mint a Phase B WorkstreamCheckpointPackage from a comparative artifact.
//
// The comparative engine (task #15) produces a comparison ARTIFACT over two run capsules, with
// claims whose evidence refs are shaped `<capsuleId>#<receiptId>` (e.g. "C01-left#receipt:metric").
// The Phase B product only renders a self-contained WorkstreamCheckpointPackage validated by the
// reader in src/lib/workstream/package.ts. This adapter bridges the two WITHOUT reimplementing
// either: it reuses the proven generic engine primitives (buildSourceManifest / buildCoverageReceipt
// / validateManifestAgainstBundle / sha256 / stableStringify / scanOutput) and mirrors buildBrief's
// exact two-step hashing, but it NEVER calls buildBrief (which is hardwired to Explainify's own
// source ids). It emits a package that round-trips losslessly through validatePackage.
//
// HONESTY INVARIANTS (task #23, non-negotiable):
//   - Every artifact evidence ref resolves to EXACTLY ONE manifest source, id `cmp:<capsule>:<rid>`.
//   - Both sides' capsule receipts are bound by content; a swapped/mutated capsule changes a hash
//     and fails closed.
//   - An observed comparison claim retains BILATERAL (left AND right) source links; a one-sided
//     "observed" claim is downgraded to not_comparable rather than presented as a real comparison.
//   - Any non-equivalent dimension surfaces as not_comparable (amber), never a forced-green observed.
//   - Provider verification is ALWAYS an explicit unknown: these runs are receipt-attested by the
//     agent, not independently provider-verified, so cross-provider claims remain unverified. A
//     local run is never relabeled as genuine cross-cloud proof.

import { buildSourceManifest } from "../../workstream-brief/freeze.mjs";
import { validateManifestAgainstBundle, buildCoverageReceipt } from "../../workstream-brief/brief.mjs";
import { sha256, stableStringify } from "../util.mjs";
import { publicSecretScan } from "./capsule.mjs";
import { compareCapsules } from "./compare.mjs";

const RECEIPT_ATTESTED = "receipt_attested";

// Deterministic map from a capsule receipt kind to a valid engine source kind (freeze.mjs
// VALID_KINDS). Comparative receipts are all agent-captured command/test receipts, so they map onto
// the receipt-backed engine kinds whose evidenceLink locator is `<id>#receipt:<id>`. The ORIGINAL
// capsule kind is preserved verbatim inside each source's content envelope (below), so the mapping
// is lossless — nothing about the source is discarded, only its engine-kind label is normalized.
// This must cover EVERY receipt kind a validated capsule can carry (PM red-team #3): sources are
// minted from ALL receipts on both capsules, not only those an artifact ref happens to cite, so a
// missing kind here would drop a real receipt and misreport coverage.
const RECEIPT_KIND_MAP = {
  command: "command_receipt",
  load_profile: "command_receipt",
  config: "command_receipt",
  environment: "command_receipt",
  git_status: "command_receipt",
  git_diff: "command_receipt",
  resource_inventory: "command_receipt",
  metric: "command_receipt",
  cost: "command_receipt",
  agent_note: "command_receipt",
  provider_export: "command_receipt",
  test: "test_receipt",
  deployment: "deployment_receipt",
};

// The exactly-one-aws-plus-one-gcp provider pair a cross-provider recommendation is allowed to rest
// on (PM red-team #1 + precision). Any other pairing — self, same-provider, or a pair involving
// azure/local/other — can never yield an AWS/GCP provider recommendation; the outcome degrades to an
// evidence-bearing not_comparable. Role order (which side is aws) does not matter: {aws,gcp} is a
// set, so a role-swapped AWS/GCP pair stays semantically equivalent.
function isAwsGcpPair(left, right) {
  const providers = new Set([left.environment.provider, right.environment.provider]);
  return providers.size === 2 && providers.has("aws") && providers.has("gcp");
}

function fail(message) {
  throw new Error(`Invalid comparison→package mapping: ${message}`);
}

// Split an artifact evidence ref "<capsuleId>#<receiptId>" into its parts. receiptId itself contains
// a colon ("receipt:metric"), so we split ONLY on the first "#".
function splitRef(ref) {
  const hash = ref.indexOf("#");
  if (hash < 0) fail(`evidence ref ${JSON.stringify(ref)} is not shaped <capsuleId>#<receiptId>`);
  return { capsuleId: ref.slice(0, hash), receiptId: ref.slice(hash + 1) };
}

function sourceIdForRef(ref) {
  const { capsuleId, receiptId } = splitRef(ref);
  return `cmp:${capsuleId}:${receiptId}`;
}

// Recursively collect every evidence ref anywhere in the artifact so EVERY ref resolves to a
// manifest source (handoff point 2). Refs live in claims/equivalence/recommendation/views/brief,
// all under keys ending in "Evidence" or the plain "evidence" array.
function collectRefs(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, out);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if ((key === "evidence" || key.endsWith("Evidence")) && Array.isArray(value)) {
        for (const ref of value) {
          if (typeof ref === "string") out.add(ref);
        }
      } else {
        collectRefs(value, out);
      }
    }
  }
}

// The semantic core of a comparison artifact: everything EXCEPT the non-deterministic generatedAt
// timestamp and the receipt (which carries the self-hash). Mirrors compare.mjs's own semanticArtifact
// so the two hash the same bytes. Used only to compare a caller-supplied artifact against the
// canonical one we recompute — the caller's derived semantics are never trusted directly.
function semanticArtifact(artifact) {
  const semantic = { ...artifact };
  delete semantic.generatedAt;
  delete semantic.receipt;
  return semantic;
}

// PM red-team #2: the ONLY trustworthy comparison for two capsules is the one the validated engine
// derives from them. We recompute the canonical artifact from the two validated capsules + the
// question and require the caller-supplied artifact to be SEMANTICALLY IDENTICAL. A forged
// recommendation, an inflated evidenceLabel, dropped confounders, or injected prose (an ARN, a
// private-map id) all differ from the canonical bytes and fail closed here — the caller cannot smuggle
// derived semantics past the engine. generatedAt and the receipt self-hash are excluded (they are not
// semantic), so a legitimately re-generated artifact still matches.
function verifyMatchesCanonical(provided, canonical) {
  if (stableStringify(semanticArtifact(provided)) !== stableStringify(semanticArtifact(canonical))) {
    fail(
      "provided comparison artifact does not match the canonical comparison recomputed from the two " +
        "capsules (tampered or forged artifact semantics)",
    );
  }
  // Trust labels live outside the semantic core, so pin them explicitly to what the engine guarantees.
  if (provided.evidenceLevel !== RECEIPT_ATTESTED) {
    fail(`artifact evidenceLevel must be ${RECEIPT_ATTESTED} (a local comparison is never provider-verified)`);
  }
  if (canonical.receipt?.publication !== "local_only") fail("canonical artifact publication must be local_only");
  if (canonical.receipt?.providerApiCalled !== false) fail("canonical artifact must not have called a provider API");
}

// The deterministic evidence link the Phase B reader expects for a receipt-backed source (mirrors
// engine evidenceLink() in brief.mjs). Our sources carry no revision, so revision is omitted.
function linkFor(source) {
  return {
    sourceId: source.id,
    receiptId: `receipt:${source.id}`,
    locator: `${source.id}#receipt:${source.id}`,
    sha256: source.sha256,
    evidenceLevel: source.evidenceLevel,
    evidenceLabel: source.evidenceLabel,
  };
}

/**
 * Convert a comparison artifact + its two validated capsules into a WorkstreamCheckpointPackage.
 * Deterministic and clock-free. Throws (fails closed) on any integrity violation.
 *
 * @param {object} artifact - the comparison artifact from compareCapsules().
 * @param {object} leftInput - the left run capsule (artifact.capsules[0]).
 * @param {object} rightInput - the right run capsule (artifact.capsules[1]).
 * @returns {object} a WorkstreamCheckpointPackage (packageVersion 1).
 */
export function comparisonToPackage(artifact, leftInput, rightInput) {
  if (!leftInput || !rightInput) fail("a comparison needs two capsules (a side is missing)");
  // PM red-team #2: recompute the CANONICAL comparison from the two capsules ourselves and trust
  // only that. compareCapsules re-validates both capsules from content (a tampered/dirty/leaky
  // capsule fails closed here) and derives the equivalence gate, claims, confounders, and
  // recommendation deterministically — the caller's supplied `artifact` is then required to match it
  // semantically (below), so no forged recommendation/label/prose can pass. We use the VALIDATED
  // capsules compareCapsules returns as the authoritative sides.
  const { artifact: canonical, left, right } = compareCapsules(leftInput, rightInput, artifact.question);
  if (!Array.isArray(canonical.capsules) || canonical.capsules.length !== 2) {
    fail("artifact must reference exactly two capsules");
  }
  if (left.id !== artifact.capsules?.[0] || right.id !== artifact.capsules?.[1]) {
    fail("provided capsules do not match artifact.capsules order (left,right)");
  }
  // PM red-team #1: the two sides must be DISTINCT runs — reject identical ids AND identical content
  // hashes BEFORE the source map can collapse. isBilateral() keys on capsule id, so equal ids let one
  // run's evidence satisfy the both-sides requirement; equal content hashes are the same run under two
  // ids. Either collapse would render a self/duplicate comparison as a fully-observed, recommendation-
  // supported result. (Two genuinely DIFFERENT runs remain a legitimate comparison.)
  if (left.id === right.id) {
    fail("cannot compare a run to itself: the two capsules must have distinct ids (self-comparison)");
  }
  if (left.provenance.capsuleSha256 === right.provenance.capsuleSha256) {
    fail("cannot compare a run to itself: the two capsules have identical content hashes (self-comparison)");
  }
  verifyMatchesCanonical(artifact, canonical);
  // From here on we mint ONLY from the canonical artifact and the validated capsules.
  artifact = canonical;

  const evidenceLabel = artifact.evidenceLabel || "receipt_attested, not provider-verified";

  // 1) Mint a manifest source for EVERY receipt on BOTH capsules (PM red-team #3), not only the
  //    receipts an artifact ref happens to cite — otherwise coverage reports fullyCovered while
  //    silently dropping real receipts. Each source's content is a self-describing, provenance-bound
  //    envelope of the exact capsule receipt (binding capsule + receipt + original kind + verbatim
  //    content), so a swapped capsule or mutated receipt changes the source hash and fails closed.
  //    Evidence refs are then resolved against this COMPLETE set (below).
  const sourceById = new Map();
  for (const capsule of [left, right]) {
    for (const receipt of capsule.receipts || []) {
      const engineKind = RECEIPT_KIND_MAP[receipt.kind];
      if (!engineKind) fail(`capsule receipt kind ${JSON.stringify(receipt.kind)} has no engine-kind mapping`);
      const id = `cmp:${capsule.id}:${receipt.id}`;
      if (sourceById.has(id)) fail(`duplicate receipt id ${receipt.id} on capsule ${capsule.id}`);
      const content = stableStringify({
        capsuleId: capsule.id,
        capsuleSha256: capsule.provenance.capsuleSha256,
        provider: capsule.environment.provider,
        receiptId: receipt.id,
        kind: receipt.kind,
        content: receipt.content,
      });
      sourceById.set(id, {
        id,
        kind: engineKind,
        // Deterministic <capsuleId>#<receiptId> locator (the reader derives the evidence-link locator
        // independently from the source id for receipt-backed kinds; this manifest locator only needs
        // to re-derive identically from raw content, which it does).
        locator: `${capsule.id}#${receipt.id}`,
        evidenceLevel: RECEIPT_ATTESTED,
        evidenceLabel,
        captured: true,
        content,
      });
    }
  }
  if (!sourceById.size) fail("capsules carry no receipts to mint");
  // Every evidence ref anywhere in the artifact must resolve to one of these minted sources.
  const refs = new Set();
  collectRefs(artifact, refs);
  for (const ref of refs) {
    if (!sourceById.has(sourceIdForRef(ref))) {
      const { capsuleId, receiptId } = splitRef(ref);
      fail(`evidence ref ${ref} names receipt ${receiptId} absent from capsule ${capsuleId}`);
    }
  }

  // Sorted for deterministic manifest ordering; buildSourceManifest hashes the content and pins the
  // whole set. validateManifestAgainstBundle re-derives it byte-for-byte.
  const bundleSources = [...sourceById.keys()].sort().map((id) => sourceById.get(id));
  const freshnessCursor = maxCompletion(left, right);
  const workstreamId = `compare:${artifact.id}`;
  const bundle = { schemaVersion: 1, workstreamId, freshnessCursor, sources: bundleSources };
  const manifest = buildSourceManifest(bundle);
  validateManifestAgainstBundle(bundle, manifest);
  const coverageReceipt = buildCoverageReceipt(manifest);

  const manifestBySourceId = new Map(manifest.sources.map((s) => [s.id, s]));
  // Build the bilateral evidence-link list for a set of artifact refs, deduped by sourceId and
  // stable-ordered. Each link binds the exact manifest source the ref resolves to.
  function linksForRefs(artifactRefs) {
    const seen = new Set();
    const links = [];
    for (const ref of artifactRefs || []) {
      const id = sourceIdForRef(ref);
      if (seen.has(id)) continue;
      seen.add(id);
      const source = manifestBySourceId.get(id);
      if (!source) fail(`ref ${ref} did not resolve to a manifest source`);
      links.push(linkFor(source));
    }
    return links;
  }
  // Does a ref list carry evidence from BOTH capsules? A real comparison must.
  function isBilateral(artifactRefs) {
    let hasLeft = false;
    let hasRight = false;
    for (const ref of artifactRefs || []) {
      if (ref.startsWith(`${left.id}#`)) hasLeft = true;
      if (ref.startsWith(`${right.id}#`)) hasRight = true;
    }
    return hasLeft && hasRight;
  }

  const VALID_STATUSES = new Set(["observed", "unknown", "inferred", "not_comparable"]);
  // Map one artifact claim to a brief claim. An "observed" claim that is not bilateral is downgraded
  // to not_comparable (a one-sided measurement is not a comparison). not_comparable always carries
  // its confounders and an explicit reason.
  function briefClaim(id, artifactClaim, fallbackText) {
    const refs2 = [...(artifactClaim.leftEvidence || []), ...(artifactClaim.rightEvidence || [])];
    let status = artifactClaim.status || "observed";
    if (!VALID_STATUSES.has(status)) fail(`artifact claim ${id} has unmappable status ${JSON.stringify(status)}`);
    const bilateral = isBilateral(refs2);
    if (status === "observed" && !bilateral) status = "not_comparable";
    const evidence = linksForRefs(refs2);
    const confounders = Array.isArray(artifactClaim.confounders) ? artifactClaim.confounders : [];
    const claim = { id, text: artifactClaim.text || fallbackText, status, evidence };
    if (status !== "observed") {
      claim.unknownReason = confounders.length
        ? `Comparison blocked by non-equivalent dimensions: ${confounders.join(", ")}.`
        : "The two sides are not directly comparable for this dimension.";
      if (confounders.length) claim.confounders = confounders;
    } else if (!evidence.length) {
      fail(`observed claim ${id} has no evidence`);
    }
    return claim;
  }

  const claimsById = new Map((artifact.claims || []).map((c) => [c.id, c]));
  const observedClaimIds = new Set(
    (artifact.claims || []).filter((c) => c.status === "observed").map((c) => c.id),
  );

  // currentOutcome — the conditional recommendation, or an honest not_comparable when confounders
  // block it (or the engine did not support it). Bilateral evidence from the recommendation.
  const rec = artifact.recommendation || {};
  const recRefs = [...(rec.leftEvidence || []), ...(rec.rightEvidence || [])];
  // PM red-team #1 precision: a provider recommendation may ONLY rest on exactly one aws plus one gcp
  // capsule. Same-provider, azure/local/other, or any other pairing can never yield an AWS/GCP
  // provider recommendation, so it degrades to an evidence-bearing not_comparable regardless of what
  // the recommendation claims. Role order does not matter ({aws,gcp} is a set), so a role-swapped
  // AWS/GCP pair stays observed-eligible. This is defense in depth over the canonical-artifact match:
  // even if the engine ever supported a same-provider recommendation, the package never renders it as
  // an observed provider winner.
  const providerPairAllowed = isAwsGcpPair(left, right);
  const recBlocked =
    (artifact.confounders || []).length > 0 || rec.supported === false || !providerPairAllowed;
  const recBilateral = isBilateral(recRefs);
  const currentOutcome = (() => {
    let status = recBlocked || !recBilateral ? "not_comparable" : "observed";
    const evidence = linksForRefs(recRefs);
    if (status === "observed" && !evidence.length) status = "not_comparable";
    const conf = (artifact.confounders || []).map((c) => c.dimension || c);
    // DEFENSE IN DEPTH (PM re-review): a not_comparable outcome must NEVER reuse the recommendation's
    // winner prose (rec.text). Even though the engine now emits neutral no-winner text on a disallowed
    // pair, the adapter independently substitutes a neutral, provider-free sentence for any
    // non-observed outcome so a browser can never render "aws is supported" next to an amber "no
    // winner" badge. rec.text is used ONLY when the outcome is genuinely observed.
    const text =
      status === "observed"
        ? rec.text ||
          `Comparison of ${left.environment.provider} vs ${right.environment.provider} on the frozen workload.`
        : conf.length
          ? `No provider recommendation: the comparison is blocked by non-equivalent dimensions (${conf.join(", ")}).`
          : !providerPairAllowed
            ? `No provider recommendation: a cross-provider comparison requires exactly one aws and one gcp run, but this pair is ${left.environment.provider} vs ${right.environment.provider}.`
            : "No provider recommendation is supported from the current bilateral evidence.";
    const claim = { id: "outcome", text, status, evidence };
    if (status !== "observed") {
      // The reason mirrors the (already neutral) text so a reader sees a consistent explanation.
      claim.unknownReason = conf.length
        ? `No provider can be recommended: comparison blocked by non-equivalent dimensions (${conf.join(", ")}).`
        : !providerPairAllowed
          ? `A cross-provider recommendation requires exactly one aws and one gcp run; this pair is ${left.environment.provider} vs ${right.environment.provider}, so no provider winner is asserted.`
          : "No provider recommendation is supported from the current bilateral evidence.";
      if (conf.length) claim.confounders = conf;
    }
    return claim;
  })();

  // sinceLastLooked — the observed comparative deltas a returning reader most needs (architecture,
  // performance, cost), each with bilateral evidence. Only include the ones the artifact carries.
  const sinceLastLooked = [];
  for (const id of ["architecture", "performance", "cost"]) {
    const c = claimsById.get(id);
    if (c) sinceLastLooked.push(briefClaim(id, c));
  }

  // reviewFirst — equivalence FAILURES (the confounders the reader must resolve first), plus the
  // artifact's own review-first item. Each non-equivalent dimension is a not_comparable claim with
  // bilateral evidence and the dimension as its confounder.
  const reviewFirst = [];
  for (const eq of artifact.equivalence || []) {
    if (eq.status === "equivalent") continue;
    reviewFirst.push({
      id: `equiv-${eq.dimension}`,
      text: `Equivalence check failed on ${eq.dimension} (status: ${eq.status}); resolve before relying on any comparison.`,
      status: "not_comparable",
      evidence: linksForRefs(eq.evidence),
      unknownReason: `The ${eq.dimension} dimension is not equivalent across the two runs, so comparisons that depend on it are not valid.`,
      confounders: [eq.dimension],
    });
  }
  for (const item of artifact.brief?.reviewFirst || []) {
    reviewFirst.push(briefClaim(`review-${item.id}`, item));
  }

  // verification — capsule/test integrity. The behavior (smoke test) claim if present, plus a
  // bilateral capsule-integrity claim citing both runs' git-status receipts.
  const verification = [];
  const behavior = claimsById.get("behavior");
  if (behavior) verification.push(briefClaim("behavior", behavior));
  const integrityRefs = [`${left.id}#receipt:git-status`, `${right.id}#receipt:git-status`].filter(
    (ref) => sourceById.has(sourceIdForRef(ref)),
  );
  if (isBilateral(integrityRefs)) {
    verification.push({
      id: "verify-capsule-integrity",
      text: `Both run capsules validate and are pinned to receipt-attested revisions (${left.repository.revision.slice(0, 12)} / ${right.repository.revision.slice(0, 12)}).`,
      status: "observed",
      evidence: linksForRefs(integrityRefs),
    });
  }

  // risks — the operational-model differences (observed, bilateral) a reader should weigh.
  const risks = [];
  const operations = claimsById.get("operations");
  if (operations) risks.push(briefClaim("operations", operations));

  // blockers — a not_comparable blocker ONLY when confounders actually block the recommendation.
  const blockers = [];
  if (recBlocked && (artifact.confounders || []).length) {
    const conf = artifact.confounders.map((c) => c.dimension || c);
    blockers.push({
      id: "blocker-not-comparable",
      text: `The recommendation is blocked until these non-equivalent dimensions are resolved: ${conf.join(", ")}.`,
      status: "not_comparable",
      evidence: linksForRefs(recRefs),
      unknownReason: `Confounders (${conf.join(", ")}) prevent an honest provider recommendation.`,
      confounders: conf,
    });
  }

  // unknowns — missing metric/cost evidence, and ALWAYS the provider-verification gap. These carry
  // no evidence (there is none) and an explicit reason. The provider-verification unknown is the
  // core honesty invariant: receipt-attested runs are not independently provider-verified.
  const unknowns = [];
  if (!observedClaimIds.has("performance")) {
    unknowns.push({
      id: "unknown-metric",
      text: "No comparable performance (latency) measure is observed across both runs.",
      status: "unknown",
      evidence: [],
      unknownReason: "A bilateral, same-basis performance metric was not present in both capsules.",
    });
  }
  if (!observedClaimIds.has("cost")) {
    unknowns.push({
      id: "unknown-cost",
      text: "No comparable frozen-basis cost estimate is observed across both runs.",
      status: "unknown",
      evidence: [],
      unknownReason: "A bilateral, same-basis cost estimate was not present in both capsules.",
    });
  }
  unknowns.push({
    id: "unknown-provider-verification",
    text: "These runs are receipt-attested by the capturing agent, not independently provider-verified.",
    status: "unknown",
    evidence: [],
    unknownReason:
      "Capsules are local-only, agent-attested captures; no provider API confirmed them. Cross-provider claims remain unverified until independent provider verification.",
  });

  // 2) Finalize exactly like buildBrief: two-step checkpointId, semantic hash, receipt. No decisions
  //    for this slice (the recommendation lives in currentOutcome).
  const semantic = {
    schemaVersion: 1,
    workstreamId,
    checkpointId: "",
    freshnessCursor,
    objective: `Compare two agent runs (${left.environment.provider} vs ${right.environment.provider}) on the same frozen workload: give a returning reader the recommendation, the equivalence gaps to resolve first, the observed deltas, and what remains unverified — without replaying either run.`,
    currentOutcome,
    sinceLastLooked,
    reviewFirst,
    verification,
    risks,
    blockers,
    unknowns,
    decisionsNeeded: [],
    coverageReceiptPath: "coverage-receipt.json",
    sourceManifestPath: "manifest.json",
    correctionReceiptPaths: [],
    evidenceLabel,
  };

  // Integrity gate (mirrors buildBrief): no observed claim may cite evidence outside the manifest,
  // and no observed claim may be unsupported. Global id uniqueness so the package never renders
  // ambiguously (matches reader step 4a).
  const manifestHashes = new Set(manifest.sources.map((x) => x.sha256));
  const allClaims = [
    currentOutcome,
    ...sinceLastLooked,
    ...reviewFirst,
    ...verification,
    ...risks,
    ...blockers,
    ...unknowns,
  ];
  const ids = new Set();
  for (const c of allClaims) {
    if (ids.has(c.id)) fail(`duplicate claim id ${c.id}`);
    ids.add(c.id);
    for (const link of c.evidence) {
      if (!manifestHashes.has(link.sha256)) fail(`claim ${c.id} cites evidence outside the frozen manifest`);
    }
    if (c.status === "observed" && !c.evidence.length) fail(`observed claim ${c.id} is unsupported`);
  }

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

  const rawSources = manifest.sources.map((s) => ({
    id: s.id,
    content: sourceById.get(s.id).content,
  }));

  const pkg = {
    packageVersion: 1,
    workstreamId,
    checkpointId,
    brief,
    manifest,
    coverageReceipt,
    rawSources,
  };

  // Defense in depth (PM red-team #4): scan the whole package with the STRICTER publicSecretScan
  // (ARN / 12-digit account / private-key / bearer / private-map-canary patterns), not just the
  // generic scanOutput. Any private identifier that reached a claim's prose — even one that recomputes
  // its own hashes — is caught here and fails closed.
  publicSecretScan(pkg);
  return pkg;
}

// The freshness cursor is the LATEST captured execution completion across both runs — the newest
// receipt-attested moment the comparison actually observed. Clock-free: read only from the capsules.
function maxCompletion(left, right) {
  const times = [];
  for (const capsule of [left, right]) {
    for (const exec of capsule.execution || []) {
      if (exec.completedAt) times.push(exec.completedAt);
    }
  }
  if (!times.length) fail("capsules carry no execution completion timestamp for the freshness cursor");
  times.sort();
  return times[times.length - 1];
}

export { maxCompletion };
