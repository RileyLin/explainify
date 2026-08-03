"use client";

import { useState } from "react";
import Link from "next/link";
import { validatePackageAction } from "./actions";
import { EXAMPLE_PACKAGE_JSON } from "./example-package";
import type { ValidatePackageResult, WorkstreamCheckpointPackage } from "@/lib/workstream/package";
import { BriefView } from "./brief-view";

type Step = "import" | "view";

export function WorkstreamClient() {
  const [raw, setRaw] = useState("");
  const [step, setStep] = useState<Step>("import");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ValidatePackageResult | null>(null);
  const [pkg, setPkg] = useState<WorkstreamCheckpointPackage | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRaw(await file.text());
    setError(null);
  }

  async function runValidate() {
    setBusy(true);
    setError(null);
    try {
      const r = await validatePackageAction(raw);
      setResult(r);
      if (r.ok) {
        setPkg(r.pkg);
        setStep("view");
      } else {
        setError(r.error || "Package did not validate.");
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
    return <BriefView pkg={pkg} onBack={reset} />;
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">
        Local-first · your checkpoint stays on this machine
      </p>
      <h1 className="mt-2 text-3xl font-bold text-foreground">Open a Workstream checkpoint</h1>
      <p className="mt-3 text-muted-foreground">
        Import a Workstream checkpoint package and get a trusted, coverage-honest brief of what
        autonomous agents did — the objective, what changed, what to review first, verification
        state, and the open blocker or decision — without replaying task threads. Every hash is
        recomputed from the package&rsquo;s own raw sources before anything renders; a tampered
        package is refused. Every observed claim opens its immutable evidence; unknowns and
        uncaptured sources are shown, not hidden.
      </p>
      <p className="mt-3 rounded-lg p-3 text-sm text-muted-foreground" style={{ border: "1px solid var(--border)" }}>
        This is a checkpoint <strong>reader</strong>, not a generator. A checkpoint package is a
        self-contained artifact (brief + frozen manifest + coverage receipt + raw-source excerpts)
        produced by the Workstream Brief engine. Generating a brief from arbitrary raw evidence is a
        separate capability and is intentionally not exposed here.
      </p>

      <section className="mt-6">
        <label htmlFor="pkg" className="block text-sm font-medium text-foreground">
          Paste a checkpoint package (JSON)
        </label>
        <textarea
          id="pkg"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setError(null);
          }}
          spellCheck={false}
          placeholder='{ "packageVersion": 1, "workstreamId": "...", "checkpointId": "...", "brief": { ... }, "manifest": { ... }, "coverageReceipt": { ... }, "rawSources": [ ... ] }'
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
              setRaw(EXAMPLE_PACKAGE_JSON);
              setError(null);
            }}
            className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted"
            style={{ border: "1px solid var(--border)" }}
          >
            Load example checkpoint
          </button>
          <button
            type="button"
            disabled={!raw.trim() || busy}
            onClick={runValidate}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {busy ? "Validating…" : "Open checkpoint →"}
          </button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Nothing is uploaded to a hosted service. The package is validated in your local Explainify
          process and never persisted server-side.
        </p>
      </section>

      {error && (
        <div
          className="mt-6 rounded-lg p-4 text-sm"
          style={{ border: "1px solid var(--border)", background: "rgba(180,60,60,0.08)" }}
        >
          <strong className="text-foreground">Package did not validate.</strong>
          <p className="mt-1 text-muted-foreground">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            A checkpoint is refused if any hash fails to recompute from its own raw sources, so a
            tampered or incomplete package never renders as trusted.
          </p>
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
