"use client";

import { useState } from "react";
import Link from "next/link";
import { preflightAction, generateBriefAction } from "./actions";
import { EXAMPLE_BUNDLE_JSON } from "./example-bundle";
import type { PreflightResult, BriefResult } from "@/lib/workstream/engine";
import type { WorkstreamBrief, CoverageReceipt } from "@/lib/workstream/types";
import { BriefView } from "./brief-view";

type Step = "import" | "preflight" | "brief";

export function WorkstreamClient() {
  const [raw, setRaw] = useState("");
  const [step, setStep] = useState<Step>("import");
  const [busy, setBusy] = useState(false);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [brief, setBrief] = useState<WorkstreamBrief | null>(null);
  const [coverage, setCoverage] = useState<CoverageReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRaw(await file.text());
    setError(null);
  }

  async function runPreflight() {
    setBusy(true);
    setError(null);
    try {
      const result = await preflightAction(raw);
      setPreflight(result);
      setStep("preflight");
      if (!result.ok) setError(result.error || "Preflight failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runGenerate() {
    setBusy(true);
    setError(null);
    try {
      const result: BriefResult = await generateBriefAction(raw);
      if (!result.ok || !result.brief || !result.coverageReceipt) {
        setError(result.error || "Could not generate the brief.");
        return;
      }
      setBrief(result.brief);
      setCoverage(result.coverageReceipt);
      setStep("brief");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("import");
    setBrief(null);
    setCoverage(null);
    setPreflight(null);
    setError(null);
  }

  if (step === "brief" && brief && coverage) {
    return (
      <BriefView
        brief={brief}
        coverage={coverage}
        rawBundle={raw}
        onBack={reset}
      />
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">
        Local-first · your bundle stays on this machine
      </p>
      <h1 className="mt-2 text-3xl font-bold text-foreground">Workstream Brief</h1>
      <p className="mt-3 text-muted-foreground">
        Import an evidence bundle and get a trusted, coverage-honest brief of what
        autonomous agents did — the objective, what changed, what to review first,
        verification state, and the open blocker or decision — without replaying task
        threads. Every observed claim opens its immutable evidence; unknowns and
        uncaptured sources are shown, not hidden.
      </p>

      <StepBar step={step} />

      {step === "import" && (
        <section className="mt-6">
          <label htmlFor="bundle" className="block text-sm font-medium text-foreground">
            Paste an evidence bundle (JSON)
          </label>
          <textarea
            id="bundle"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setError(null);
            }}
            spellCheck={false}
            placeholder='{ "schemaVersion": 1, "workstreamId": "...", "freshnessCursor": "...", "sources": [ ... ] }'
            className="mt-2 h-64 w-full rounded-lg bg-background p-3 font-mono text-xs text-foreground"
            style={{ border: "1px solid var(--border)" }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label
              className="cursor-pointer rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
              style={{ border: "1px solid var(--border)" }}
            >
              Upload .json
              <input type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
            </label>
            <button
              type="button"
              onClick={() => {
                setRaw(EXAMPLE_BUNDLE_JSON);
                setError(null);
              }}
              className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
              style={{ border: "1px solid var(--border)" }}
            >
              Load example bundle
            </button>
            <button
              type="button"
              disabled={!raw.trim() || busy}
              onClick={runPreflight}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {busy ? "Checking…" : "Preflight →"}
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Nothing is uploaded to a hosted service. The bundle is processed in your
            local Explainify process and never persisted server-side.
          </p>
        </section>
      )}

      {step === "preflight" && preflight && (
        <PreflightPanel
          preflight={preflight}
          busy={busy}
          onGenerate={runGenerate}
          onBack={() => setStep("import")}
        />
      )}

      {error && (
        <div
          className="mt-6 rounded-lg p-4 text-sm"
          style={{ border: "1px solid var(--border)", background: "rgba(180,60,60,0.08)" }}
        >
          <strong className="text-foreground">Validation failed.</strong>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      )}

      <p className="mt-10 text-sm">
        <Link href="/" className="text-blue-500 hover:underline">
          ← Back to Explainify
        </Link>
      </p>
    </main>
  );
}

function StepBar({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string }> = [
    { key: "import", label: "1 · Import" },
    { key: "preflight", label: "2 · Preflight" },
    { key: "brief", label: "3 · Brief" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);
  return (
    <ol className="mt-6 flex gap-2 text-xs">
      {steps.map((s, i) => (
        <li
          key={s.key}
          className={`rounded-full px-3 py-1 ${
            i <= activeIndex
              ? "bg-blue-600 text-white"
              : "text-muted-foreground"
          }`}
          style={i > activeIndex ? { border: "1px solid var(--border)" } : undefined}
        >
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function PreflightPanel({
  preflight,
  busy,
  onGenerate,
  onBack,
}: {
  preflight: PreflightResult;
  busy: boolean;
  onGenerate: () => void;
  onBack: () => void;
}) {
  if (!preflight.ok || !preflight.coverage) {
    return (
      <section className="mt-6">
        <div
          className="rounded-lg p-4 text-sm"
          style={{ border: "1px solid var(--border)", background: "rgba(180,60,60,0.08)" }}
        >
          <strong className="text-foreground">Bundle did not validate.</strong>
          <p className="mt-1 text-muted-foreground">{preflight.error}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="mt-4 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
          style={{ border: "1px solid var(--border)" }}
        >
          ← Edit bundle
        </button>
      </section>
    );
  }

  const c = preflight.coverage;
  return (
    <section className="mt-6">
      <div
        className="rounded-xl p-5"
        style={{
          border: "1px solid var(--border)",
          borderLeft: `4px solid ${c.fullyCovered ? "#087b69" : "#b1841c"}`,
          background: c.fullyCovered ? undefined : "rgba(177,132,28,0.08)",
        }}
      >
        <h2 className="text-lg font-semibold text-foreground">
          Preflight · {preflight.workstreamId}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Fresh through <code className="text-foreground">{preflight.freshnessCursor}</code>
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Stat n={c.scanned} label={`of ${c.requested} scanned`} />
          <Stat n={c.excluded} label="policy-excluded" warn={c.excluded > 0} />
          <Stat n={c.unavailable} label="unavailable" warn={c.unavailable > 0} />
          <Stat n={c.unsupported} label="unsupported" warn={c.unsupported > 0} />
          <Stat n={c.uncovered} label="uncovered" warn={c.uncovered > 0} />
        </div>
        {!c.fullyCovered && (
          <p className="mt-3 text-sm" style={{ color: "#b1841c" }}>
            Coverage is partial — this brief cannot be treated as complete. The
            uncaptured sources below are surfaced honestly rather than hidden.
          </p>
        )}
      </div>

      {preflight.exclusions && preflight.exclusions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">Uncaptured sources</h3>
          <ul className="mt-2 space-y-2">
            {preflight.exclusions.map((ex) => (
              <li
                key={ex.id}
                className="rounded-lg p-3 text-xs"
                style={{ border: "1px solid var(--border)" }}
              >
                <span
                  className="mr-2 rounded px-1.5 py-0.5 font-semibold uppercase"
                  style={{ background: "rgba(177,132,28,0.15)", color: "#b1841c" }}
                >
                  {ex.reason}
                </span>
                <code className="text-foreground">{ex.id}</code>
                <span className="text-muted-foreground"> · {ex.kind} · {ex.locator}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
          style={{ border: "1px solid var(--border)" }}
        >
          ← Edit bundle
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onGenerate}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {busy ? "Generating…" : "Generate trusted brief →"}
        </button>
      </div>
    </section>
  );
}

function Stat({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{
        border: "1px solid var(--border)",
        background: warn ? "rgba(177,132,28,0.08)" : undefined,
      }}
    >
      <div className="text-xl font-bold text-foreground">{n}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
