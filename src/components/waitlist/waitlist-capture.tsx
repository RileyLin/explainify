"use client";

import { useState } from "react";
import { Sparkles, ArrowRight, Check, Loader2 } from "lucide-react";

export function WaitlistCapture({ variant = "section" }: { variant?: "section" | "inline" }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || state === "loading") return;

    setState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setState("success");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (variant === "inline") {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full max-w-md">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="flex-1 px-4 py-2.5 rounded-xl bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60"
          disabled={state === "success"}
        />
        <button
          type="submit"
          disabled={state === "loading" || state === "success" || !email}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium transition-all disabled:opacity-50"
        >
          {state === "loading" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : state === "success" ? (
            <><Check size={14} /> Done</>
          ) : (
            <><ArrowRight size={14} /> Notify me</>
          )}
        </button>
      </form>
    );
  }

  return (
    <section className="py-20 px-6">
      <div className="max-w-2xl mx-auto text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-6">
          <Sparkles size={11} />
          Pro launching soon
        </div>

        <h2 className="text-3xl font-bold text-foreground mb-3">
          Get early access
        </h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Join the waitlist for VizBrief Pro — unlimited explainers, no watermark, private links, and custom branding.
        </p>

        {state === "success" ? (
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 font-medium">
            <Check size={16} />
            You&apos;re on the list — we&apos;ll reach out when Pro launches
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-3 max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full sm:flex-1 px-4 py-3 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-all"
              required
            />
            <button
              type="submit"
              disabled={state === "loading" || !email}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {state === "loading" ? (
                <><Loader2 size={16} className="animate-spin" /> Joining...</>
              ) : (
                <><ArrowRight size={16} /> Join waitlist</>
              )}
            </button>
          </form>
        )}

        {state === "error" && (
          <p className="text-red-400 text-sm mt-3">{errorMsg}</p>
        )}

        <p className="text-xs text-muted-foreground mt-4">
          No spam. One email when Pro launches.
        </p>
      </div>
    </section>
  );
}
