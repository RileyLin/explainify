import type { Metadata } from "next";
import { CompareRunsDemoClient } from "../demo-client";

export const metadata: Metadata = {
  title: "Compare Runs honesty demo — Explainify",
  description:
    "Three red-team cases (a tie, a same-provider pair, and non-equivalent evidence) showing the wrong result earlier builds produced, the honest result the current engine produces live, and why.",
};

// Server-rendered so the client action can reach the Node-only comparative engine. The demo runs
// only bundled synthetic fixtures (no user upload), so it is safe to render even on a hosted
// preview — it needs no local-mode gate.
export const dynamic = "force-dynamic";

export default function CompareRunsDemoPage() {
  return <CompareRunsDemoClient />;
}
