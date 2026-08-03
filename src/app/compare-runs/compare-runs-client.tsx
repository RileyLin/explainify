"use client";

import { useState } from "react";
import Link from "next/link";
import { compareRunsAction } from "../workstream/actions";
import { BriefView } from "../workstream/brief-view";
import { EXAMPLE_LEFT_CAPSULE_JSON, EXAMPLE_RIGHT_CAPSULE_JSON } from "./example-capsules";
import type { ValidatePackageResult, WorkstreamCheckpointPackage } from "@/lib/workstream/package";

type Step = "import" | "view";

// One capsule import slot (left / right). Paste or upload a run capsule JSON. Kept intentionally
// symmetric so neither side is privileged — a comparison needs both, and the engine fails closed if
// either is missing, swapped, or tampered.
function CapsuleSlot({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    onChange(await file.text());
  }
  return (
    <div className="flex-1 min-w-0">
      <label className="block text-sm font-medium text-foreground">{label}</label>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder='{ "schemaVersion": 1, "id": "…", "environment": { "provider": "aws" }, "receipts": [ … ] }'
        className="mt-2 h-48 w-full rounded-lg bg-background p-3 font-mono text-xs text-foreground sm:h-56"
        style={{ border: "1px solid var(--border)" }}
      />
      <label
        className="mt-2 inline-block cursor-pointer rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
        style={{ border: "1px solid var(--border)" }}
      >
        Upload .json
        <input type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
      </label>
    </div>
  );
}

export function CompareRunsClient() {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [question, setQuestion] = useState("");
  const [step, setStep] = useState<Step>("import");
  const [busy, setBusy] = useState(false);
  const [pkg, setPkg] = useState<WorkstreamCheckpointPackage | null>(null);
  const [result, setResult] = useState<ValidatePackageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCompare() {
    setBusy(true);
    setError(null);
    try {
      const r = await compareRunsAction(left, right, question);
      if (r.ok && r.result.ok) {
        setPkg(r.result.pkg);
        setResult(r.result);
        setStep("view");
      } else {
        setError(r.ok ? "Comparison did not validate." : r.error);
      }
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep("import");
    setPkg(null);
    setResult(null);
    setError(null);
  }

  if (step === "view" && pkg && result?.ok) {
    // The comparison is minted as a standard WorkstreamCheckpointPackage and rendered by the SAME
    // trusted reader as /workstream — no separate render/trust path. Correction is not offered here
    // (a comparison is corrected by re-capturing runs, not by editing a claim), so onOpenCorrected
    // is intentionally omitted.
    return <BriefView pkg={pkg} onBack={reset} />;
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">
        Local-first · your run capsules stay on this machine
      </p>
      <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">Compare two agent runs</h1>
      <p className="mt-3 text-muted-foreground">
        Import two run capsules from the same bounded workload and get a trusted, evidence-bound
        comparison — the equivalence gate, the confounders to resolve first, bilateral (both-sides)
        evidence for every observed claim, and an honest recommendation or a{" "}
        <em>not comparable</em> verdict when the two sides aren&rsquo;t equivalent. Every hash is
        recomputed from the capsules&rsquo; own receipts before anything renders; a swapped,
        tampered, self-compared, or falsely-equivalent pair is refused.
      </p>
      <p className="mt-3 rounded-lg p-3 text-sm text-muted-foreground" style={{ border: "1px solid var(--border)" }}>
        These capsules are <strong>receipt-attested</strong> by the capturing agent — they are not
        independently provider-verified. The comparison always keeps provider verification an
        explicit unknown; a local run is never presented as genuine cross-cloud proof.
      </p>

      <section className="mt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
          <CapsuleSlot
            label="Left run capsule"
            hint="e.g. the AWS run"
            value={left}
            onChange={(v) => {
              setLeft(v);
              setError(null);
            }}
          />
          <CapsuleSlot
            label="Right run capsule"
            hint="e.g. the GCP run"
            value={right}
            onChange={(v) => {
              setRight(v);
              setError(null);
            }}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="q" className="block text-sm font-medium text-foreground">
            What decision does this comparison inform? <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            id="q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Which provider should we adopt for this workload?"
            className="mt-2 w-full rounded-lg bg-background p-2.5 text-sm text-foreground"
            style={{ border: "1px solid var(--border)" }}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setLeft(EXAMPLE_LEFT_CAPSULE_JSON);
              setRight(EXAMPLE_RIGHT_CAPSULE_JSON);
              setError(null);
            }}
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
            style={{ border: "1px solid var(--border)" }}
          >
            Load example capsules
          </button>
          <button
            type="button"
            disabled={!left.trim() || !right.trim() || busy}
            onClick={runCompare}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {busy ? "Comparing…" : "Compare runs →"}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Nothing is uploaded to a hosted service. Both capsules are validated and compared in your
          local Explainify process and never persisted server-side.
        </p>
      </section>

      {error && (
        <div
          className="mt-6 rounded-lg p-4 text-sm"
          style={{ border: "1px solid var(--border)", background: "rgba(180,60,60,0.08)" }}
        >
          <strong className="text-foreground">Comparison was refused.</strong>
          <p className="mt-1 break-words text-muted-foreground">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            A comparison is refused if either capsule fails to validate, the two sides don&rsquo;t
            correspond, or any hash fails to recompute from its own receipts — so a tampered,
            swapped, or falsely-equivalent pair never renders as trusted.
          </p>
        </div>
      )}

      <p className="mt-10 text-sm">
        <Link href="/compare-runs/demo" className="text-blue-500 hover:underline">
          See what it refuses to fake →
        </Link>
        <span className="mx-2 text-muted-foreground">·</span>
        <Link href="/workstream" className="text-blue-500 hover:underline">
          Open a Workstream checkpoint →
        </Link>
        <span className="mx-2 text-muted-foreground">·</span>
        <Link href="/" className="text-blue-500 hover:underline">
          Back to Explainify
        </Link>
      </p>
    </main>
  );
}
