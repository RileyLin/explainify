import Link from "next/link";
import { Check, X, ArrowLeft, Sparkles, Zap } from "lucide-react";

const FREE_FEATURES = [
  { text: "5 explainers per month", included: true },
  { text: "All 7 template types", included: true },
  { text: "Public sharing", included: true },
  { text: "Embed code", included: true },
  { text: '"Made with Explainify" watermark', included: true },
  { text: "Private links", included: false },
  { text: "Custom branding", included: false },
  { text: "Analytics dashboard", included: false },
];

const PRO_FEATURES = [
  { text: "Unlimited explainers", included: true },
  { text: "All 7 template types", included: true },
  { text: "Public & private sharing", included: true },
  { text: "Embed code", included: true },
  { text: "No watermark", included: true },
  { text: "Private links", included: true },
  { text: "Custom branding", included: true },
  { text: "Analytics dashboard", included: true },
];

function FeatureRow({ text, included }: { text: string; included: boolean }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      {included ? (
        <Check size={16} className="text-green-500 shrink-0" />
      ) : (
        <X size={16} className="text-muted-foreground/40 shrink-0" />
      )}
      <span className={included ? "text-foreground" : "text-muted-foreground/60"}>
        {text}
      </span>
    </li>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center gap-4 mb-12">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Pricing</h1>
            <p className="text-muted-foreground mt-1">
              Start free. Upgrade when you need more.
            </p>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Free tier */}
          <div className="rounded-2xl border border-border bg-card p-8 flex flex-col">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={20} className="text-muted-foreground" />
                <h2 className="text-xl font-bold text-foreground">Free</h2>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">$0</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Perfect for trying out Explainify
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {FREE_FEATURES.map((f) => (
                <FeatureRow key={f.text} text={f.text} included={f.included} />
              ))}
            </ul>

            <Link
              href="/create"
              className="block text-center px-6 py-3 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-all"
            >
              Get Started
            </Link>
          </div>

          {/* Pro tier */}
          <div className="rounded-2xl border-2 border-blue-500 bg-card p-8 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 px-3 py-1 bg-blue-500 text-white text-xs font-bold rounded-bl-lg">
              POPULAR
            </div>

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={20} className="text-blue-500" />
                <h2 className="text-xl font-bold text-foreground">Pro</h2>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">$15</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                For power users and teams
              </p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {PRO_FEATURES.map((f) => (
                <FeatureRow key={f.text} text={f.text} included={f.included} />
              ))}
            </ul>

            <form action="/api/stripe/checkout" method="POST">
              <button
                type="submit"
                className="w-full px-6 py-3 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/25"
              >
                Upgrade to Pro
              </button>
            </form>
          </div>
        </div>

        {/* FAQ note */}
        <div className="text-center mt-12 text-sm text-muted-foreground">
          <p>Cancel anytime. No long-term contracts.</p>
          <p className="mt-1">Questions? Reach out at support@explainify.dev</p>
        </div>
      </div>
    </div>
  );
}
