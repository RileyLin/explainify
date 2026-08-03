import Link from "next/link";

// Site-wide footer rendered on every page via the root layout. Exposes the
// legal/marketing entry points (Pricing, Privacy, Terms) that were previously
// only reachable by typing the direct URL — a real discoverability defect
// caught in the task #17 owner review. Keep these links plain <Link>/<a> so
// they are always in the DOM (no viewport-conditional hiding) and testable.
export function SiteFooter() {
  return (
    <footer
      className="py-8 bg-background mt-auto"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <div className="max-w-6xl mx-auto px-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          Explainify · Driftworks, Inc
        </span>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            href="/pricing"
            className="text-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            href="/workstream"
            className="text-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            Workstream
          </Link>
          <Link
            href="/compare-runs"
            className="text-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            Compare Runs
          </Link>
          <Link
            href="/privacy"
            className="text-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="text-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            Terms
          </Link>
          <a
            href="https://github.com/RileyLin/explainify"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm transition-colors text-muted-foreground hover:text-foreground"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
