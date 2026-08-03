"use client";

import { useMemo, useState } from "react";
import type {
  WorkstreamBrief,
  CoverageReceipt,
  Claim,
  DecisionNeeded,
  SavedCheckpoint,
} from "@/lib/workstream/types";

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
  brief,
  coverage,
  rawBundle,
  onBack,
}: {
  brief: WorkstreamBrief;
  coverage: CoverageReceipt;
  rawBundle: string;
  onBack: () => void;
}) {
  const [openRaw, setOpenRaw] = useState<string | null>(null);
  const uncovered = coverage.requestedSourceCount - coverage.scannedSourceCount;

  const bundleSources = useMemo(() => {
    try {
      const parsed = JSON.parse(rawBundle) as { sources?: Array<Record<string, unknown>> };
      return parsed.sources || [];
    } catch {
      return [];
    }
  }, [rawBundle]);

  function openRawSource(id: string) {
    setOpenRaw(id);
    // Defer so the raw section renders before we scroll to it.
    requestAnimationFrame(() => {
      document.getElementById(`raw-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function exportCheckpoint() {
    const checkpoint: SavedCheckpoint = {
      savedAt: new Date().toISOString(),
      bundle: safeParse(rawBundle),
      brief,
      coverageReceipt: coverage,
    };
    const blob = new Blob([JSON.stringify(checkpoint, null, 2)], { type: "application/json" });
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
            const id = String(s.id);
            const captured = s.captured === true;
            const isOpen = openRaw === id;
            return (
              <article
                key={id}
                id={`raw-${id}`}
                className="rounded-lg p-3"
                style={{
                  border: "1px solid var(--border)",
                  background: isOpen ? "rgba(59,130,246,0.06)" : undefined,
                }}
              >
                <h3 className="text-sm font-semibold text-foreground">
                  <code>{id}</code>{" "}
                  {!captured && (
                    <span className="text-xs font-normal" style={{ color: "#b1841c" }}>
                      · uncaptured{s.exclusionReason ? ` · ${String(s.exclusionReason)}` : ""}
                    </span>
                  )}
                </h3>
                <p className="mt-1 text-xs">
                  <code className="break-all text-muted-foreground">{String(s.locator ?? "")}</code>
                </p>
                <pre
                  className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-background p-2 text-xs text-foreground"
                  style={{ border: "1px solid var(--border)" }}
                >
                  {String(s.content ?? "")}
                </pre>
              </article>
            );
          })}
        </div>
      </section>

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

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
