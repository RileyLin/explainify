"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { useEffect, useState } from "react";

export function UpgradeButton() {
  const { data: session, status } = useSession();
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => setPlan(d.plan))
      .catch(() => null);
  }, [session?.user]);

  // Don't render while loading, not signed in, or already pro
  if (status === "loading") return null;
  if (!session?.user) return null;
  if (plan === "pro") return null;
  if (plan === null) return null; // hide until we know the plan

  return (
    <Link
      href="/pricing"
      className="hidden sm:inline-flex items-center gap-1.5 ml-1 px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-colors"
    >
      <Zap size={13} />
      Upgrade
    </Link>
  );
}
