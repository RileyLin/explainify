// Phase B (task #22) local-first gate.
//
// The Workstream Brief flow ingests PRIVATE evidence bundles (Raft messages, git
// spans, task state, receipts). The Phase A trust contract is `local_only`: that
// evidence must never be uploaded to the hosted Explainify server. So the entire
// route + every server action that can receive a bundle is gated behind an
// explicit local-mode flag and FAILS CLOSED when it is unset.
//
// Enable locally with:  EXPLAINIFY_LOCAL_WORKSTREAMS=1 npm run dev
// In hosted Production the flag is absent, so the route 404-equivalents and the
// actions refuse to accept a bundle.

export const LOCAL_WORKSTREAMS_ENV = "EXPLAINIFY_LOCAL_WORKSTREAMS";

/** True only when the operator has explicitly opted this process into local mode. */
export function isLocalWorkstreamsEnabled(): boolean {
  return process.env[LOCAL_WORKSTREAMS_ENV] === "1";
}

export class HostedModeError extends Error {
  readonly code = "LOCAL_WORKSTREAMS_DISABLED";
  constructor() {
    super(
      "Workstream Brief is a local-first feature. It is disabled on this server so " +
        "private evidence bundles are never uploaded to the hosted Explainify service. " +
        `Run Explainify locally with ${LOCAL_WORKSTREAMS_ENV}=1 to use it.`,
    );
    this.name = "HostedModeError";
  }
}

/**
 * Fail-closed guard for any code path that can receive an evidence bundle. Call
 * this FIRST in every server action / route handler in the workstream feature.
 * Throws in hosted mode so a bundle can never be processed there.
 */
export function assertLocalWorkstreams(): void {
  if (!isLocalWorkstreamsEnabled()) {
    throw new HostedModeError();
  }
}
