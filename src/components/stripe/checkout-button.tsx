"use client";

import { useState } from "react";
import { Loader2, Zap } from "lucide-react";

export function CheckoutButton({ className }: { className?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setError(data.error);
        setLoading(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleCheckout}
        disabled={loading}
        className={className ?? "w-full px-6 py-3 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/25 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Redirecting to checkout...
          </>
        ) : (
          <>
            <Zap size={16} />
            Upgrade to Pro
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-500 mt-2 text-center">{error}</p>
      )}
    </div>
  );
}
