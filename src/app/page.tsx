import Link from "next/link";
import { ArrowRight, Clipboard, Brain, Share2, GitBranch, Code2, Layers } from "lucide-react";

function HeroSection() {
  return (
    <section className="relative py-24 md:py-32 overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-3xl" />

      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-sm font-medium mb-6">
          <Brain size={14} />
          AI-Powered Interactive Explainers
        </div>
        <h1 className="text-5xl md:text-7xl font-bold text-foreground tracking-tight leading-[1.1] mb-6">
          Paste complexity.
          <br />
          <span className="text-blue-500">Get clarity.</span>
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          AI transforms your technical docs into interactive, shareable explainers in seconds.
        </p>
        <Link
          href="/create"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-blue-500 text-white font-semibold text-lg hover:bg-blue-600 transition-all shadow-xl shadow-blue-500/25 hover:shadow-2xl hover:shadow-blue-500/30 hover:-translate-y-0.5"
        >
          Create an Explainer
          <ArrowRight size={20} />
        </Link>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      icon: Clipboard,
      title: "Paste your content",
      description: "Drop in your technical documentation, architecture spec, code, API docs, or any complex content.",
    },
    {
      icon: Brain,
      title: "AI analyzes & visualizes",
      description: "Our AI understands the structure, picks the best interactive template, and generates a structured explainer.",
    },
    {
      icon: Share2,
      title: "Share interactive explainer",
      description: "Get a shareable link, embed in your docs, or download as standalone HTML. Beautiful on every device.",
    },
  ];

  return (
    <section className="py-20 border-t border-border">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-foreground text-center mb-4">How it works</h2>
        <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
          Three steps from wall of text to interactive explainer.
        </p>
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-500 mb-4">
                <step.icon size={24} />
              </div>
              <div className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-2">Step {i + 1}</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ShowcaseSection() {
  const examples = [
    {
      icon: GitBranch,
      title: "Flow Animator",
      description: "Animated step-through diagrams for request flows, data pipelines, and event-driven architectures.",
      color: "blue",
    },
    {
      icon: Code2,
      title: "Code Walkthrough",
      description: "VS Code-quality syntax highlighting with step-by-step annotations. Click through explanations.",
      color: "emerald",
    },
    {
      icon: Layers,
      title: "Concept Builder",
      description: "Progressive disclosure of layered concepts. Start simple, add complexity one layer at a time.",
      color: "purple",
    },
  ];

  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    blue: { bg: "bg-blue-500/10", text: "text-blue-500", border: "hover:border-blue-500/50" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-500", border: "hover:border-emerald-500/50" },
    purple: { bg: "bg-purple-500/10", text: "text-purple-500", border: "hover:border-purple-500/50" },
  };

  return (
    <section className="py-20 border-t border-border">
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-3xl font-bold text-foreground text-center mb-4">Templates</h2>
        <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
          Choose the best format for your content — or let AI decide.
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          {examples.map((ex) => {
            const c = colorMap[ex.color];
            return (
              <Link
                key={ex.title}
                href="/create"
                className={`group p-6 rounded-xl border-2 border-border ${c.border} bg-card transition-all hover:shadow-lg hover:-translate-y-1`}
              >
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${c.bg} ${c.text} mb-4`}>
                  <ex.icon size={22} />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-blue-500 transition-colors">
                  {ex.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{ex.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-8 border-t border-border">
      <div className="max-w-5xl mx-auto px-6 flex items-center justify-between text-sm text-muted-foreground">
        <span>Built by Riley</span>
        <a
          href="https://github.com/RileyLin/explainify"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <HeroSection />
      <HowItWorksSection />
      <ShowcaseSection />
      <Footer />
    </div>
  );
}
