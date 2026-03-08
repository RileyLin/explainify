"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Github, Chrome, Sparkles } from "lucide-react";

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <Sparkles className="text-blue-500" size={28} />
            <span className="font-bold text-2xl text-foreground">Explainify</span>
          </div>
          <p className="text-muted-foreground text-sm">Sign in to save and publish your explainers</p>
        </div>

        {/* Sign in card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-xl shadow-black/5">
          <h1 className="text-lg font-semibold text-foreground text-center mb-6">Welcome back</h1>

          <div className="space-y-3">
            <button
              onClick={() => signIn("github", { callbackUrl })}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/50 text-foreground font-medium transition-all hover:border-blue-500/50 hover:shadow-md"
            >
              <Github size={18} />
              Continue with GitHub
            </button>

            <button
              onClick={() => signIn("google", { callbackUrl })}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/50 text-foreground font-medium transition-all hover:border-blue-500/50 hover:shadow-md"
            >
              <Chrome size={18} />
              Continue with Google
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            By signing in, you agree to our{" "}
            <a href="#" className="underline hover:text-foreground">Terms</a>
            {" "}and{" "}
            <a href="#" className="underline hover:text-foreground">Privacy Policy</a>.
          </p>
        </div>

        {/* Back link */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          <a href="/" className="hover:text-foreground transition-colors">← Back to Explainify</a>
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SignInContent />
    </Suspense>
  );
}
