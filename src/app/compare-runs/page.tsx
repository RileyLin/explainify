import type { Metadata } from "next";
import Link from "next/link";
import { isLocalWorkstreamsEnabled, LOCAL_WORKSTREAMS_ENV } from "@/lib/workstream/local-mode";
import { CompareRunsClient } from "./compare-runs-client";

export const metadata: Metadata = {
  title: "Compare Runs — Explainify",
  description:
    "Local-first: import two agent run capsules and get a trusted, evidence-bound comparison — equivalence gate, confounders, bilateral evidence, and an honest recommendation or a not-comparable verdict.",
};

// Server-only, like /workstream: this page reads process.env and, when enabled, calls server
// actions that use the Node-only comparative engine. It never accepts a capsule at request time —
// capsules reach the server only via the local-mode-gated compareRunsAction.
export const dynamic = "force-dynamic";

export default function CompareRunsPage() {
  const enabled = isLocalWorkstreamsEnabled();

  if (!enabled) {
    // Fail closed in hosted Production, BEFORE any capsule can be parsed: the feature is disabled
    // and the UI explains why, so private run evidence is never uploaded to the hosted service.
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">
          Local-first feature
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Compare Runs</h1>
        <div
          className="mt-6 rounded-xl p-6 bg-muted/40"
          style={{ border: "1px solid var(--border)" }}
        >
          <h2 className="text-lg font-semibold text-foreground">
            Disabled on the hosted server
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Compare Runs ingests private run capsules — receipts, environment labels, and resource
            inventories from real agent runs. To honor the local-only trust contract, it is turned
            off on the hosted Explainify service so that run evidence is never uploaded here.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Run Explainify on your own machine to use it:
          </p>
          <pre
            className="mt-2 overflow-auto rounded-lg bg-background p-3 text-xs text-foreground"
            style={{ border: "1px solid var(--border)" }}
          >
            <code>{`${LOCAL_WORKSTREAMS_ENV}=1 npm run dev`}</code>
          </pre>
          <p className="mt-4 text-sm">
            <Link href="/" className="text-blue-500 hover:underline">
              ← Back to Explainify
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return <CompareRunsClient />;
}
