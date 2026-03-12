import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { WaitlistCapture } from "@/components/waitlist/waitlist-capture";

interface ExplainPageProps {
  topic: string;              // "Quantum Physics"
  slug: string;               // "quantum-physics"
  headline: string;           // "Understand Quantum Physics in Minutes"
  subheadline: string;        // "Stop re-reading the same paragraph..."
  description: string;        // paragraph for SEO
  useCases: string[];         // bullet list of who it's for
  exampleConcepts: string[];  // 6 related concepts linking deeper
  faq: { q: string; a: string }[];
}

export function generateExplainMetadata(props: ExplainPageProps): Metadata {
  return {
    title: `Explain ${props.topic} Simply — VizBrief`,
    description: `${props.subheadline} Paste any ${props.topic} doc or concept into VizBrief and get an interactive visual diagram in seconds.`,
    openGraph: {
      title: `Explain ${props.topic} Simply — VizBrief`,
      description: props.description,
      url: `https://vizbrief.driftworks.dev/explain/${props.slug}`,
    },
  };
}

export function ExplainPageTemplate(props: ExplainPageProps) {
  const { topic, headline, subheadline, description, useCases, exampleConcepts, faq } = props;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-6">
          <Sparkles size={11} />
          AI-Powered Visual Explainer
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-foreground mb-4 leading-tight">
          {headline}
        </h1>
        <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
          {subheadline}
        </p>
        <Link
          href={`/create?topic=${encodeURIComponent(topic)}`}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-all"
        >
          <ArrowRight size={16} />
          Try it free — explain {topic} now
        </Link>
        <p className="text-xs text-muted-foreground mt-3">No sign-up required. Free to start.</p>
      </div>

      {/* What it is */}
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-foreground mb-4">
          Why is {topic} hard to explain?
        </h2>
        <p className="text-muted-foreground leading-relaxed text-base">
          {description}
        </p>
      </div>

      {/* Who it's for */}
      <div className="max-w-3xl mx-auto px-6 py-12 border-t border-border">
        <h2 className="text-2xl font-bold text-foreground mb-6">
          Who uses VizBrief for {topic}?
        </h2>
        <ul className="space-y-3">
          {useCases.map((uc, i) => (
            <li key={i} className="flex items-start gap-3">
              <CheckCircle2 size={18} className="text-blue-400 mt-0.5 shrink-0" />
              <span className="text-muted-foreground">{uc}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* How it works */}
      <div className="max-w-3xl mx-auto px-6 py-12 border-t border-border">
        <h2 className="text-2xl font-bold text-foreground mb-6">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { step: "01", title: "Paste your content", desc: `Copy any ${topic} explanation, textbook section, or your own notes` },
            { step: "02", title: "AI analyzes & maps", desc: "VizBrief identifies the key concepts and builds an interactive flow diagram" },
            { step: "03", title: "Share & embed", desc: "Get a shareable link or embed it in Notion, slides, or your site" },
          ].map((s) => (
            <div key={s.step} className="p-5 rounded-xl border border-border bg-card">
              <div className="text-xs font-bold text-blue-400 mb-2">{s.step}</div>
              <h3 className="text-sm font-semibold text-foreground mb-1">{s.title}</h3>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            href={`/create?topic=${encodeURIComponent(topic)}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium text-sm transition-all"
          >
            <ArrowRight size={14} />
            Explain {topic} now →
          </Link>
        </div>
      </div>

      {/* Related concepts */}
      <div className="max-w-3xl mx-auto px-6 py-12 border-t border-border">
        <h2 className="text-2xl font-bold text-foreground mb-6">
          Related concepts to explore
        </h2>
        <div className="flex flex-wrap gap-2">
          {exampleConcepts.map((concept, i) => (
            <Link
              key={i}
              href={`/create?topic=${encodeURIComponent(concept)}`}
              className="px-4 py-2 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:border-blue-500/40 transition-all"
            >
              Explain {concept} →
            </Link>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-6 py-12 border-t border-border">
        <h2 className="text-2xl font-bold text-foreground mb-6">
          Frequently asked questions
        </h2>
        <div className="space-y-6">
          {faq.map((item, i) => (
            <div key={i}>
              <h3 className="text-base font-semibold text-foreground mb-1">{item.q}</h3>
              <p className="text-muted-foreground text-sm">{item.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Waitlist capture */}
      <div className="border-t border-border">
        <WaitlistCapture />
      </div>

      {/* Footer nav */}
      <div className="border-t border-border py-8 px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-foreground hover:opacity-80 transition-opacity">
            <Sparkles size={16} className="text-blue-500" />
            <span className="font-bold text-sm">VizBrief</span>
          </Link>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/create" className="hover:text-foreground transition-colors">Create</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
