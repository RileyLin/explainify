"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { compareRunsDemoAction, type DemoCase } from "../workstream/actions";

// A status badge mirroring the reader's semantics: observed = green, not_comparable = amber,
// everything else = neutral. The whole point of the demo is that these cases render AMBER, not green.
function StatusBadge({ status }: { status: string }) {
  const amber = status === "not_comparable";
  const green = status === "observed";
  const bg = amber ? "rgba(180,130,20,0.16)" : green ? "rgba(40,150,80,0.16)" : "rgba(120,120,120,0.16)";
  const fg = amber ? "#b9821a" : green ? "#2a9d54" : "var(--muted-foreground)";
  return (
    <span
      className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: bg, color: fg }}
    >
      {status}
    </span>
  );
}

function DemoCaseCard({ c }: { c: DemoCase }) {
  return (
    <section className="rounded-xl p-5" style={{ border: "1px solid var(--border)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-foreground">{c.title}</h2>
        <StatusBadge status={c.status} />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{c.scenario}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div
          className="rounded-lg p-3"
          style={{ border: "1px solid var(--border)", background: "rgba(180,60,60,0.08)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#c0554f" }}>
            Before — wrong result
          </p>
          <p className="mt-1 text-sm text-foreground">{c.before}</p>
        </div>
        <div
          className="rounded-lg p-3"
          style={{ border: "1px solid var(--border)", background: "rgba(40,150,80,0.08)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#2a9d54" }}>
            After — current result (live)
          </p>
          <p className="mt-1 text-sm text-foreground">{c.after}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        <strong className="text-foreground">Why: </strong>
        {c.reason}
      </p>
    </section>
  );
}

export function CompareRunsDemoClient() {
  const [cases, setCases] = useState<DemoCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    compareRunsDemoAction().then((r) => {
      if (!alive) return;
      if (r.ok) setCases(r.cases);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">
        Compare Runs · honesty demo
      </p>
      <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
        What Compare Runs refuses to fake
      </h1>
      <p className="mt-3 text-muted-foreground">
        Three cases where a naïve comparison would invent a winner. Each shows the wrong result
        earlier builds produced, the honest result the <strong>current</strong> engine produces (run
        live on bundled synthetic fixtures), and why the old answer was dishonest. The
        &ldquo;after&rdquo; text is computed on this request — if the engine regressed, this page
        would change.
      </p>
      <p className="mt-3 rounded-lg p-3 text-sm text-muted-foreground" style={{ border: "1px solid var(--border)" }}>
        These are <strong>receipt-attested synthetic fixtures</strong>, not genuine cross-cloud
        proof. Provider verification always stays an explicit unknown; a local run is never presented
        as real cross-cloud evidence, and GCP stays <em>not comparable / unverified</em> until a real
        GCP capsule exists.
      </p>

      {error && (
        <div
          className="mt-6 rounded-lg p-4 text-sm"
          style={{ border: "1px solid var(--border)", background: "rgba(180,60,60,0.08)" }}
        >
          <strong className="text-foreground">The demo could not run.</strong>
          <p className="mt-1 break-words text-muted-foreground">{error}</p>
        </div>
      )}

      {!cases && !error && <p className="mt-6 text-sm text-muted-foreground">Running the engine…</p>}

      {cases && (
        <div className="mt-6 flex flex-col gap-5">
          {cases.map((c) => (
            <DemoCaseCard key={c.id} c={c} />
          ))}
        </div>
      )}

      <p className="mt-10 text-sm">
        <Link href="/compare-runs" className="text-blue-500 hover:underline">
          ← Compare your own two runs
        </Link>
        <span className="mx-2 text-muted-foreground">·</span>
        <Link href="/workstream" className="text-blue-500 hover:underline">
          Open a Workstream checkpoint →
        </Link>
      </p>
    </main>
  );
}
