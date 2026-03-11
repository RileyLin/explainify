import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center gap-2 mb-8">
          <Sparkles size={24} className="text-blue-500" />
          <span className="font-bold text-xl text-foreground">VizBrief</span>
        </div>
        <h1 className="text-7xl font-bold text-foreground mb-4">404</h1>
        <p className="text-lg text-muted-foreground mb-2">Page not found</p>
        <p className="text-sm text-muted-foreground mb-10">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="px-6 py-2.5 rounded-xl bg-blue-500 text-white font-medium text-sm hover:bg-blue-600 transition-all"
          >
            Go Home
          </Link>
          <Link
            href="/create"
            className="px-6 py-2.5 rounded-xl border border-border text-muted-foreground font-medium text-sm hover:text-foreground hover:border-foreground/20 transition-all"
          >
            Create an Explainer
          </Link>
        </div>
      </div>
    </div>
  );
}
