import Link from "next/link";
import { Sparkles } from "lucide-react";
import { SignInButton } from "@/components/auth/sign-in-button";

export function Header() {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity">
          <Sparkles size={20} className="text-blue-500" />
          <span className="font-bold text-lg">Explainify</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/create"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
          >
            Create
          </Link>
          <SignInButton />
        </div>
      </div>
    </header>
  );
}
