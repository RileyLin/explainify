"use client";

import { useMemo, useState } from "react";
import type { Claim, CorrectionKind, DecisionNeeded } from "@/lib/workstream/types";
import type { WorkstreamCheckpointPackage } from "@/lib/workstream/package";
import { applyCorrectionAction } from "./actions";

// Product view of a Workstream Brief. Maps the proven render.mjs section order and
// trust semantics into React: first-viewport outcome + counts, always-visible
// coverage/trust panel, since-last-looked / review-first / verification / risks /
// blockers / unknowns / decisions, per-claim evidence drawers, and a raw-source
// escape hatch one action away. It renders the engine's output; it does not compute
// trust state itself.

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { fg: string; bg: string }> = {
    observed: { fg: "#06715f", bg: "rgba(7,134,111,0.12)" },
    unknown: { fg: "#7b570f", bg: "rgba(155,112,21,0.14)" },
    inferred: { fg: "#7b570f", bg: "rgba(155,112,21,0.14)" },
    needed: { fg: "#a42537", bg: "rgba(164,37,55,0.12)" },
  };
  const c = map[status] || map.observed;
  return (
    <span
      className="mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
      style={{ color: c.fg, background: c.bg }}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function LevelBadge({ level }: { level: string }) {
  const verified = level === "independently_verified";
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        color: verified ? "#06715f" : "#4e5d6b",
        background: verified ? "rgba(7,134,111,0.12)" : "var(--muted, rgba(120,135,148,0.12))",
      }}
    >
      {verified ? "independently verified" : "receipt-attested"}
    </span>
  );
}

function EvidenceDrawer({ claim, onOpenRaw }: { claim: Claim; onOpenRaw: (id: string) => void }) {
  if (claim.status !== "observed" || !claim.evidence.length) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-medium text-blue-500">
        Evidence ({claim.evidence.length})
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="p-1.5">Source</th>
              <th className="p-1.5">Locator</th>
              <th className="p-1.5">Hash</th>
              <th className="p-1.5">Level</th>
              <th className="p-1.5">Raw</th>
            </tr>
          </thead>
          <tbody>
            {claim.evidence.map((link) => (
              <tr key={link.sourceId} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="p-1.5">
                  <code className="text-foreground">{link.sourceId}</code>
                </td>
                <td className="p-1.5">
                  <code className="break-all text-muted-foreground">{link.locator}</code>
                </td>
                <td className="p-1.5">
                  <code className="text-muted-foreground">{link.sha256.slice(0, 16)}…</code>
                </td>
                <td className="p-1.5">
                  <LevelBadge level={link.evidenceLevel} />
                </td>
                <td className="p-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenRaw(link.sourceId)}
                    className="text-blue-500 hover:underline"
                  >
                    raw source
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ClaimItem({ claim, onOpenRaw }: { claim: Claim; onOpenRaw: (id: string) => void }) {
  return (
    <li className="py-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="text-sm text-foreground">
        <StatusBadge status={claim.status} />
        <span>{claim.text}</span>
      </div>
      {claim.status === "unknown" && (
        <p className="mt-1 text-xs" style={{ color: "#b1841c" }}>
          {claim.unknownReason || `Missing: ${(claim.missingSourceIds || []).join(", ")}`}
        </p>
      )}
      <EvidenceDrawer claim={claim} onOpenRaw={onOpenRaw} />
    </li>
  );
}

function ClaimList({ claims, onOpenRaw }: { claims: Claim[]; onOpenRaw: (id: string) => void }) {
  if (!claims.length) return <p className="text-sm text-muted-foreground">None recorded.</p>;
  return (
    <ul>
      {claims.map((c) => (
        <ClaimItem key={c.id} claim={c} onOpenRaw={onOpenRaw} />
      ))}
    </ul>
  );
}

function Band({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="mt-4 rounded-xl p-5"
      style={{ border: "1px solid var(--border)" }}
    >
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Count({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{
        border: "1px solid var(--border)",
        background: warn && n > 0 ? "rgba(177,132,28,0.1)" : undefined,
      }}
    >
      <div className="text-2xl font-bold text-foreground">{n}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function BriefView({
  pkg,
  onBack,
  onOpenCorrected,
}: {
  pkg: WorkstreamCheckpointPackage;
  onBack: () => void;
  onOpenCorrected?: (successor: WorkstreamCheckpointPackage) => void;
}) {
  const { brief, coverageReceipt: coverage } = pkg;
  const [openRaw, setOpenRaw] = useState<string | null>(null);
  const uncovered = coverage.requestedSourceCount - coverage.scannedSourceCount;

  // Every claim/decision id, so a correction can target an existing item (the engine rejects any
  // other target).
  const targetIds = useMemo(() => {
    const ids = [
      brief.currentOutcome.id,
      ...brief.sinceLastLooked.map((c) => c.id),
      ...brief.reviewFirst.map((c) => c.id),
      ...brief.verification.map((c) => c.id),
      ...brief.risks.map((c) => c.id),
      ...brief.blockers.map((c) => c.id),
      ...brief.unknowns.map((c) => c.id),
      ...brief.decisionsNeeded.map((d) => d.id),
    ];
    return ids;
  }, [brief]);

  // The raw-source escape hatch joins the frozen manifest metadata (locator, captured,
  // exclusionReason) with the verbatim rawSources content the hashes were computed over.
  const bundleSources = useMemo(() => {
    const contentById = new Map(pkg.rawSources.map((s) => [s.id, s.content]));
    return pkg.manifest.sources.map((m) => ({
      id: m.id,
      locator: m.locator,
      captured: m.captured,
      exclusionReason: m.exclusionReason,
      content: contentById.get(m.id) ?? "",
    }));
  }, [pkg]);

  function openRawSource(id: string) {
    setOpenRaw(id);
    // Defer so the raw section renders before we scroll to it.
    requestAnimationFrame(() => {
      document.getElementById(`raw-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function exportCheckpoint() {
    // Export the full, self-contained checkpoint package so it can be reopened/validated later.
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${brief.checkpointId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← New brief
      </button>

      {/* Header / first viewport */}
      <header className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">
          Local workstream brief · receipt-attested unless marked verified
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{brief.workstreamId}</h1>
        <p className="mt-2 text-muted-foreground">{brief.objective}</p>
        {brief.correctionOf && (
          <p
            className="mt-3 rounded-lg px-3 py-2 text-xs"
            style={{ border: "1px solid var(--border)", background: "rgba(59,130,246,0.06)" }}
          >
            Corrected checkpoint · corrects{" "}
            <code className="text-foreground">{brief.correctionOf}</code>. The immutable original is
            bound inside this package and re-verified on open.
          </p>
        )}
      </header>

      <Band title="Current outcome">
        <ClaimList claims={[brief.currentOutcome]} onOpenRaw={openRawSource} />
        <div className="mt-4 flex flex-wrap gap-3">
          <Count n={brief.decisionsNeeded.length} label="decisions needed" warn />
          <Count n={brief.blockers.length} label="blockers" warn />
          <Count n={brief.unknowns.length} label="unknowns" warn />
          <Count n={uncovered} label="uncovered sources" warn />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          ↓ Verification and evidence continue below. Every observed claim opens its
          immutable evidence.
        </p>
      </Band>

      {/* Coverage / trust panel — always visible, cannot show green when partial */}
      <section
        className="mt-4 rounded-xl p-5"
        style={{
          border: "1px solid var(--border)",
          borderLeft: `4px solid ${coverage.fullyCovered ? "#087b69" : "#b1841c"}`,
          background: coverage.fullyCovered ? undefined : "rgba(177,132,28,0.08)",
        }}
      >
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Coverage</h2>
        <p className="mt-2 text-sm text-foreground">
          <strong>
            {coverage.scannedSourceCount} of {coverage.availableSourceCount}
          </strong>{" "}
          available source spans scanned.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Not captured: {coverage.excludedSourceCount} policy, {coverage.unavailableSourceCount}{" "}
          unavailable, {coverage.unsupportedSourceCount} unsupported.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Fresh through: <code className="text-foreground">{brief.freshnessCursor}</code>
        </p>
        <div className="mt-2 text-sm">
          <a href="#raw-sources" className="mr-4 font-semibold text-blue-500 hover:underline">
            Open raw source
          </a>
        </div>
        {!coverage.fullyCovered && (
          <p className="mt-2 text-sm" style={{ color: "#b1841c" }}>
            Coverage is partial — this brief cannot be treated as complete.
          </p>
        )}
      </section>

      <Band title="Since last looked">
        <ClaimList claims={brief.sinceLastLooked} onOpenRaw={openRawSource} />
      </Band>
      <Band title="Review first">
        <ClaimList claims={brief.reviewFirst} onOpenRaw={openRawSource} />
      </Band>
      <Band title="Verification">
        <ClaimList claims={brief.verification} onOpenRaw={openRawSource} />
      </Band>
      <Band title="Risks">
        <ClaimList claims={brief.risks} onOpenRaw={openRawSource} />
      </Band>
      <Band title="Blockers">
        <ClaimList claims={brief.blockers} onOpenRaw={openRawSource} />
      </Band>
      <Band title="Unknowns & uncovered">
        <ClaimList claims={brief.unknowns} onOpenRaw={openRawSource} />
      </Band>
      <Band title="Decisions needed">
        <DecisionList decisions={brief.decisionsNeeded} />
      </Band>

      {/* Raw source escape hatch */}
      <section id="raw-sources" className="mt-4 rounded-xl p-5" style={{ border: "1px solid var(--border)" }}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Raw source bundle
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every claim links here. This is the escape hatch to the underlying evidence.
        </p>
        <div className="mt-3 space-y-3">
          {bundleSources.map((s) => {
            const isOpen = openRaw === s.id;
            return (
              <article
                key={s.id}
                id={`raw-${s.id}`}
                className="rounded-lg p-3"
                style={{
                  border: "1px solid var(--border)",
                  background: isOpen ? "rgba(59,130,246,0.06)" : undefined,
                }}
              >
                <h3 className="text-sm font-semibold text-foreground">
                  <code>{s.id}</code>{" "}
                  {!s.captured && (
                    <span className="text-xs font-normal" style={{ color: "#b1841c" }}>
                      · uncaptured{s.exclusionReason ? ` · ${s.exclusionReason}` : ""}
                    </span>
                  )}
                </h3>
                <p className="mt-1 text-xs">
                  <code className="break-all text-muted-foreground">{s.locator}</code>
                </p>
                <pre
                  className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 text-xs text-foreground"
                  style={{ border: "1px solid var(--border)" }}
                >
                  {s.content}
                </pre>
              </article>
            );
          })}
        </div>
      </section>

      {/* Correction — produce an immutable linked successor checkpoint */}
      <CorrectionPanel pkg={pkg} targetIds={targetIds} onOpenCorrected={onOpenCorrected} />

      {/* Checkpoint receipt + export */}
      <section className="mt-4 rounded-xl p-5" style={{ border: "1px solid var(--border)" }}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Checkpoint receipt
        </h2>
        <p className="mt-2 text-sm">
          <code className="text-foreground">{brief.checkpointId}</code>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          semantic brief sha256 <code>{brief.receipt.semanticBriefSha256.slice(0, 24)}…</code>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          publication {brief.receipt.publication} · secret scan {brief.receipt.secretScan}
        </p>
        <button
          type="button"
          onClick={exportCheckpoint}
          className="mt-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
          style={{ border: "1px solid var(--border)" }}
        >
          Export checkpoint (.json)
        </button>
      </section>
    </main>
  );
}

const CORRECTION_KINDS: CorrectionKind[] = ["wrong", "missing", "stale", "misleading"];

// Correction panel: select an existing claim, describe the correction, optionally attach a new
// captured source, and mint a linked, immutable successor. The successor is produced by the
// local-mode-gated server action (guard-before-parse); it embeds the byte-immutable original and
// self-validates before it is returned, so a correction can never keep a green badge without
// resolving, captured evidence. This UI never edits a claim in place.
function CorrectionPanel({
  pkg,
  targetIds,
  onOpenCorrected,
}: {
  pkg: WorkstreamCheckpointPackage;
  targetIds: string[];
  onOpenCorrected?: (successor: WorkstreamCheckpointPackage) => void;
}) {
  const [open, setOpen] = useState(false);
  const [targetClaimId, setTargetClaimId] = useState(targetIds[0] ?? "");
  const [kind, setKind] = useState<CorrectionKind>("stale");
  const [note, setNote] = useState("");
  const [correctedText, setCorrectedText] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ json: string; checkpointId: string; downgraded: boolean } | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setMade(null);
    try {
      // submittedAt is caller-supplied — the engine has no clock. Use the client wall-clock here.
      const submittedAt = new Date().toISOString();
      const r = await applyCorrectionAction(JSON.stringify(pkg), {
        correctionKind: kind,
        note: note.trim(),
        submittedAt,
        targetClaimId,
        correctedText: correctedText.trim() || undefined,
        // This UI does not ingest new raw sources; a correction here reclassifies/annotates. New
        // captured evidence is added via the (Phase A) capture path, keeping raw-ID capture local.
        intendedStatus: reason.trim() ? "inferred" : "unknown",
        reason: reason.trim() || undefined,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMade({ json: r.packageJson, checkpointId: r.checkpointId, downgraded: r.downgraded });
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!made) return;
    const blob = new Blob([made.json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${made.checkpointId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mt-4 rounded-xl p-5" style={{ border: "1px solid var(--border)" }}>
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Correction</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Record a correction against an existing claim. This never edits the original — it mints a
        new, linked checkpoint that embeds the byte-immutable original. A claim can only stay{" "}
        <em>observed</em> if its evidence still resolves and is captured; otherwise it is shown as an
        honest unknown/inferred with a reason.
      </p>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
          style={{ border: "1px solid var(--border)" }}
        >
          Start a correction
        </button>
      )}
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-muted-foreground">
              Claim
              <select
                value={targetClaimId}
                onChange={(e) => setTargetClaimId(e.target.value)}
                className="mt-1 block rounded-lg bg-background p-2 text-xs text-foreground"
                style={{ border: "1px solid var(--border)" }}
              >
                {targetIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Kind
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as CorrectionKind)}
                className="mt-1 block rounded-lg bg-background p-2 text-xs text-foreground"
                style={{ border: "1px solid var(--border)" }}
              >
                {CORRECTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">
            Note (required)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this claim is being corrected"
              className="mt-1 block w-full rounded-lg bg-background p-2 text-xs text-foreground"
              style={{ border: "1px solid var(--border)" }}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Corrected text (optional)
            <input
              value={correctedText}
              onChange={(e) => setCorrectedText(e.target.value)}
              placeholder="Replacement claim text"
              className="mt-1 block w-full rounded-lg bg-background p-2 text-xs text-foreground"
              style={{ border: "1px solid var(--border)" }}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            Reason (shown when the claim becomes inferred; leave blank for a plain unknown)
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why the corrected claim is inferred rather than observed"
              className="mt-1 block w-full rounded-lg bg-background p-2 text-xs text-foreground"
              style={{ border: "1px solid var(--border)" }}
            />
          </label>
          <button
            type="button"
            disabled={!note.trim() || busy}
            onClick={submit}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {busy ? "Applying…" : "Apply correction →"}
          </button>
        </div>
      )}
      {error && (
        <p className="mt-3 text-sm" style={{ color: "#a42537" }}>
          Correction refused: {error}
        </p>
      )}
      {made && (
        <div
          className="mt-3 rounded-lg p-3 text-sm"
          style={{ border: "1px solid var(--border)", background: "rgba(59,130,246,0.06)" }}
        >
          <p className="text-foreground">
            New checkpoint <code>{made.checkpointId}</code> minted and verified.
          </p>
          {made.downgraded && (
            <p className="mt-1 text-xs" style={{ color: "#b1841c" }}>
              The corrected claim could not remain observed without captured evidence, so it was
              recorded as an honest non-observed claim.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={download}
              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              style={{ border: "1px solid var(--border)" }}
            >
              Export corrected checkpoint (.json)
            </button>
            {onOpenCorrected && (
              <button
                type="button"
                onClick={() => onOpenCorrected(JSON.parse(made.json) as WorkstreamCheckpointPackage)}
                className="rounded-lg px-3 py-1.5 text-xs text-blue-500 hover:underline"
              >
                Open corrected brief →
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function DecisionList({ decisions }: { decisions: DecisionNeeded[] }) {
  if (!decisions.length) return <p className="text-sm text-muted-foreground">None.</p>;
  return (
    <ul>
      {decisions.map((d) => (
        <li key={d.id} className="py-3 text-sm text-foreground" style={{ borderTop: "1px solid var(--border)" }}>
          <StatusBadge status={d.status} />
          <strong>{d.owner}</strong> · {d.question}
          {d.freshnessUnverifiable && (
            <p className="mt-1 text-xs" style={{ color: "#b1841c" }}>
              Freshness unverifiable — {d.coverageCaveat || "depends on an excluded source"}.
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

