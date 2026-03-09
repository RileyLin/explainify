"use client";

import { useState, useRef, useEffect } from "react";
import { LogIn, LogOut, LayoutDashboard, ChevronDown, Zap } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";

export function SignInButton() {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => setPlan(d.plan))
      .catch(() => null);
  }, [session?.user]);

  // Close menu on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (status === "loading") {
    return (
      <div className="h-8 w-20 animate-pulse bg-muted rounded-lg" />
    );
  }

  if (!session?.user) {
    return (
      <button
        onClick={() => signIn()}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
      >
        <LogIn size={16} />
        Sign In
      </button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
      >
        {session.user.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || "User"}
            className="w-7 h-7 rounded-full"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
            {session.user.name?.[0] || session.user.email?.[0] || "U"}
          </div>
        )}
        <span className="text-sm font-medium text-foreground max-w-[120px] truncate hidden sm:block">
          {session.user.name || session.user.email}
        </span>
        {plan === "pro" && (
          <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            <Zap size={9} />PRO
          </span>
        )}
        <ChevronDown size={14} className="text-muted-foreground" />
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-card shadow-lg py-1 z-50">
          <Link
            href="/dashboard"
            onClick={() => setMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            <LayoutDashboard size={16} />
            Dashboard
          </Link>
          <hr className="my-1 border-border" />
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors w-full text-left"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
