import Link from "next/link";
import { Sparkles, Zap } from "lucide-react";
import { SignInButton } from "@/components/auth/sign-in-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function Header() {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity">
          <Sparkles size={20} className="text-blue-500" />
          <span className="font-bold text-lg">Explainify</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/create"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted hidden sm:block"
          >
            Create
          </Link>
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted hidden sm:block"
          >
            Pricing
          </Link>
          <ThemeToggle />
          <Link
            href="/pricing"
            className="hidden sm:inline-flex items-center gap-1.5 ml-1 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-colors"
          >
            <Zap size={13} />
            Upgrade
          </Link>
          <SignInButton />
        </div>
      </div>
    </header>
  );
}
