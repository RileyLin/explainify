"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ReactFlowProvider } from "@xyflow/react";
import { FlowAnimator } from "@/components/renderers/flow-animator";
import type { FlowAnimatorData } from "@/lib/schemas/flow";

// ── Hard-coded demo data ────────────────────────────────────────────
const HERO_DEMO_DATA: FlowAnimatorData = {
  template: "flow-animator" as const,
  meta: {
    title: "API Request Flow",
    summary: "How a request travels through a modern API stack",
    difficulty: "intermediate" as const,
    template: "flow-animator" as const,
  },
  nodes: [
    { id: "client-browser", label: "Browser", description: "User makes a request", details: "The browser sends an HTTP request with authentication headers to the API gateway endpoint.", icon: "monitor" },
    { id: "gateway-apigw", label: "API Gateway", description: "Routes and authenticates", details: "Validates the JWT token, applies rate limiting, and routes the request to the correct microservice.", icon: "shield" },
    { id: "auth-service", label: "Auth Service", description: "Verifies identity", details: "Checks the token signature against the public key and returns the decoded user context.", icon: "key" },
    { id: "service-api", label: "Backend API", description: "Processes the request", details: "Business logic runs here — queries the database, calls external services, computes the response.", icon: "server" },
    { id: "db-postgres", label: "Database", description: "Stores and retrieves data", details: "PostgreSQL stores user data, with Redis cache in front for frequently accessed records.", icon: "database" },
  ],
  connections: [
    { from: "client-browser", to: "gateway-apigw", label: "HTTPS Request", animated: true },
    { from: "gateway-apigw", to: "auth-service", label: "Verify Token", animated: true },
    { from: "auth-service", to: "gateway-apigw", label: "User Context", animated: false },
    { from: "gateway-apigw", to: "service-api", label: "Authorized Request", animated: true },
    { from: "service-api", to: "db-postgres", label: "Query", animated: true },
    { from: "db-postgres", to: "service-api", label: "Result", animated: false },
  ],
  stepOrder: ["client-browser", "gateway-apigw", "auth-service", "service-api", "db-postgres"],
};

// ── Live demo wrapper ───────────────────────────────────────────────
function AutoPlayingDemo() {
  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{
        pointerEvents: "none",
        border: "1px solid rgba(99,102,241,0.25)",
        boxShadow: "0 0 60px rgba(99,102,241,0.12), 0 0 120px rgba(59,130,246,0.08), inset 0 0 40px rgba(0,0,0,0.4)",
        background: "color-mix(in srgb, var(--background) 80%, transparent)",
      }}
    >
      {/* Glow edge top */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.5), transparent)" }}
      />
      <div className="h-[420px]">
        <FlowAnimator data={HERO_DEMO_DATA} autoPlay hideHeader hideControls />
      </div>
      {/* Fade bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
        style={{ background: "linear-gradient(to top, var(--background), transparent)" }}
      />
    </div>
  );
}

function HeroDemo() {
  return (
    <ReactFlowProvider>
      <AutoPlayingDemo />
    </ReactFlowProvider>
  );
}

// ── Shimmer CTA button ──────────────────────────────────────────────
function ShimmerButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @keyframes shimmer-sweep {
          0%   { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(250%) skewX(-15deg); }
        }
        .shimmer-btn .shimmer-highlight {
          animation: shimmer-sweep 3s ease-in-out infinite;
          animation-delay: 1s;
        }
      `}</style>
      <Link
        href={href}
        className="shimmer-btn relative inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-lg text-white overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-2xl"
        style={{
          background: "linear-gradient(135deg, #3b82f6, #6366f1)",
          boxShadow: "0 4px 32px rgba(99,102,241,0.35)",
        }}
      >
        <span className="relative z-10">{children}</span>
        {/* Shimmer highlight */}
        <span
          className="shimmer-highlight absolute inset-0 w-1/3"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
          }}
        />
      </Link>
    </>
  );
}

// ── Hero ────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section
      className="relative min-h-screen flex items-center overflow-hidden bg-background"
    >
      {/* Gradient mesh — blue-purple top-left */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: "-10%",
          left: "-5%",
          width: "55%",
          height: "70%",
          background: "radial-gradient(ellipse at center, rgba(99,102,241,0.13) 0%, transparent 70%)",
        }}
      />
      {/* Gradient mesh — blue-teal bottom-right */}
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: "-10%",
          right: "-5%",
          width: "55%",
          height: "70%",
          background: "radial-gradient(ellipse at center, rgba(6,182,212,0.12) 0%, transparent 70%)",
        }}
      />
      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative w-full max-w-7xl mx-auto px-6 py-24 md:py-32">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
          {/* LEFT: Copy + CTA */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-6"
          >
            {/* Beta pill */}
            <div className="inline-flex self-start items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase"
              style={{
                background: "rgba(99,102,241,0.12)",
                border: "1px solid rgba(99,102,241,0.25)",
                color: "#a5b4fc",
              }}
            >
              Now in beta · Free to use
            </div>

            {/* Headline */}
            <h1
              className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]"
              style={{ color: "var(--foreground)" }}
            >
              Complex ideas,{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #60a5fa, #818cf8, #38bdf8)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                explained interactively.
              </span>
            </h1>

            {/* Subheadline */}
            <p
              className="text-xl md:text-2xl font-medium leading-snug text-muted-foreground"
            >
              From wall of text to interactive diagram — in seconds.
            </p>

            {/* Body copy */}
            <p
              className="text-base md:text-lg leading-relaxed max-w-md text-muted-foreground"
            >
              Paste your architecture spec, API docs, or system design. AI generates a step-through interactive diagram in seconds.
            </p>

            {/* CTA */}
            <div className="flex items-center gap-4 mt-2">
              <ShimmerButton href="/create">
                Create an Explainer →
              </ShimmerButton>
            </div>
          </motion.div>

          {/* RIGHT: Live Demo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="hidden md:block"
          >
            <HeroDemo />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ── How It Works — Interactive Stepper ─────────────────────────────
const HOW_IT_WORKS_STEPS = [
  {
    number: "01",
    label: "Paste",
    title: "Paste your content",
    description: "Paste your architecture docs, API specs, code — anything complex.",
    icon: (
      <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    preview: (
      <div className="rounded-xl overflow-hidden bg-muted/40 border border-border">
        <div className="px-4 pt-3 pb-1 flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
          <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" />
        </div>
        <div className="p-4 font-mono text-xs space-y-1.5 text-muted-foreground">
          <p className="text-muted-foreground"># API Gateway Design</p>
          <p>Client → Auth → Rate Limiter → Router</p>
          <p>Router → ServiceA | ServiceB | ServiceC</p>
          <p className="text-muted-foreground">## Authentication</p>
          <p>JWT tokens validated at gateway...</p>
          <div className="flex items-center gap-0.5 mt-1">
            <span className="text-muted-foreground">Retry logic with backoff</span>
            <span className="w-0.5 h-4 ml-0.5 animate-pulse" style={{ background: "#6366f1" }} />
          </div>
        </div>
      </div>
    ),
  },
  {
    number: "02",
    label: "AI Analyzes",
    title: "AI analyzes & visualizes",
    description: "AI picks the best template and generates an interactive diagram in seconds.",
    icon: (
      <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
      </svg>
    ),
    preview: (
      <div className="rounded-xl p-5 flex flex-col items-center gap-4 bg-muted/40 border border-border">
        {/* Pulsing dots loader */}
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: "#6366f1" }}
              animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.9, delay: i * 0.2, repeat: Infinity }}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Analyzing structure...</p>
        {/* Mini node diagram */}
        <div className="w-full flex items-center justify-center gap-3 mt-1">
          {["Client", "Gateway", "DB"].map((label, i) => (
            <div key={label} className="flex items-center gap-3">
              <div className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", color: "#a5b4fc" }}>
                {label}
              </div>
              {i < 2 && (
                <motion.div
                  className="w-6 h-px"
                  style={{ background: "rgba(99,102,241,0.4)" }}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, delay: i * 0.3, repeat: Infinity }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    number: "03",
    label: "Share",
    title: "Share & embed",
    description: "Get a shareable link. Embed in Notion, docs, or anywhere with one line of HTML.",
    icon: (
      <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
      </svg>
    ),
    preview: (
      <div className="rounded-xl p-4 space-y-3 bg-muted/40 border border-border">
        <p className="text-xs font-medium text-muted-foreground">🎉 Your explainer is live!</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-2 rounded-lg text-xs font-mono truncate bg-muted text-muted-foreground border border-border">
            explainify.app/e/api-gateway-design-x7k
          </div>
          <div className="px-3 py-2 rounded-lg text-xs font-medium shrink-0" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#86efac" }}>
            Copy
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {'<iframe src="explainify.app/e/..." />'}
        </div>
      </div>
    ),
  },
];

function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    intervalRef.current = setInterval(() => {
      setActiveStep((s) => (s + 1) % HOW_IT_WORKS_STEPS.length);
    }, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused]);

  const handleStepClick = (i: number) => {
    setPaused(true);
    setActiveStep(i);
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  const step = HOW_IT_WORKS_STEPS[activeStep];

  return (
    <section
      className="relative py-24 md:py-32 overflow-hidden bg-background"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.3), transparent)" }}
      />

      <div className="relative max-w-4xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#6366f1" }}>
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-bold" style={{ color: "var(--foreground)" }}>
            Three steps from doc to diagram.
          </h2>
        </motion.div>

        {/* Step tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {HOW_IT_WORKS_STEPS.map((s, i) => (
            <button
              key={s.number}
              onClick={() => handleStepClick(i)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
              style={{
                background: activeStep === i ? "rgba(99,102,241,0.15)" : "var(--muted)",
                border: `1px solid ${activeStep === i ? "rgba(99,102,241,0.4)" : "var(--border)"}`,
                color: activeStep === i ? "#a5b4fc" : "var(--muted-foreground)",
              }}
            >
              <span style={{ color: activeStep === i ? "#6366f1" : "rgba(99,102,241,0.3)", fontWeight: 700, fontSize: "0.7rem" }}>
                {s.number}
              </span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Animated content panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="grid md:grid-cols-2 gap-8 items-center"
          >
            {/* Left: icon + text */}
            <div className="flex flex-col gap-4">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8" }}
              >
                {step.icon}
              </div>
              <div>
                <h3 className="text-xl md:text-2xl font-bold mb-2" style={{ color: "var(--foreground)" }}>
                  {step.title}
                </h3>
                <p className="text-base leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </div>

            {/* Right: mock UI preview */}
            <div>{step.preview}</div>
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-3 mt-10">
          {HOW_IT_WORKS_STEPS.map((_, i) => (
            <motion.button
              key={i}
              onClick={() => handleStepClick(i)}
              className="rounded-full"
              style={{
                width: activeStep === i ? 24 : 8,
                height: 8,
                background: activeStep === i ? "#6366f1" : "var(--border)",
                transition: "width 0.3s ease, background 0.3s ease",
              }}
              animate={activeStep === i ? { scale: [1, 1.15, 1] } : { scale: 1 }}
              transition={activeStep === i ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" } : {}}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Templates ───────────────────────────────────────────────────────
const TEMPLATES = [
  { name: "Flow Animator",       accent: "#3b82f6", desc: "Animated node diagrams",     bestFor: "system architecture, request flows, data pipelines" },
  { name: "Code Walkthrough",    accent: "#8b5cf6", desc: "Step-through annotations",   bestFor: "code tutorials, API usage, algorithms" },
  { name: "Concept Builder",     accent: "#10b981", desc: "Progressive layers",         bestFor: "abstract concepts, mental models, theory" },
  { name: "Compare & Contrast",  accent: "#f59e0b", desc: "Side-by-side analysis",      bestFor: "framework comparisons, tradeoffs" },
  { name: "Decision Tree",       accent: "#ec4899", desc: "Interactive branching",      bestFor: "troubleshooting guides, decision flows" },
  { name: "Timeline",            accent: "#06b6d4", desc: "Chronological events",       bestFor: "project history, process sequences" },
  { name: "Component Explorer",  accent: "#f97316", desc: "Architecture diagrams",      bestFor: "system components, dependencies" },
];

function TemplatesSection() {
  return (
    <section
      className="relative py-24 md:py-32 overflow-hidden bg-background"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.3), transparent)" }}
      />

      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#06b6d4" }}>
            Templates
          </p>
          <h2 className="text-3xl md:text-4xl font-bold" style={{ color: "var(--foreground)" }}>
            The right format for every doc.
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            Choose manually or let AI pick the best template for your content.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {TEMPLATES.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                href="/create"
                className="group flex flex-col gap-3 p-5 rounded-xl transition-all duration-200 hover:-translate-y-1"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderTop: `3px solid ${t.accent}40`,
                  ["--hover-border" as string]: `${t.accent}80`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = `${t.accent}50`;
                  (e.currentTarget as HTMLElement).style.borderTopColor = `${t.accent}`;
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${t.accent}15`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                  (e.currentTarget as HTMLElement).style.borderTopColor = `${t.accent}40`;
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
                }}
              >
                {/* Accent dot */}
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: t.accent, boxShadow: `0 0 8px ${t.accent}` }}
                />
                <div>
                  <h3 className="font-semibold text-sm mb-0.5 transition-colors" style={{ color: "var(--foreground)" }}>
                    {t.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {t.desc}
                  </p>
                </div>
                <p className="text-xs mt-auto text-muted-foreground">
                  <span style={{ color: t.accent, opacity: 0.8 }}>Best for:</span>{" "}
                  {t.bestFor}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CTA Section ─────────────────────────────────────────────────────
function CTASection() {
  return (
    <section
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      {/* Gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(99,102,241,0.15) 50%, rgba(139,92,246,0.12) 100%)",
        }}
      />
      <div
        className="absolute inset-0 bg-background"
      />
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, rgba(59,130,246,0.10) 0%, rgba(99,102,241,0.14) 50%, rgba(139,92,246,0.10) 100%)",
        }}
      />

      {/* Top line glow */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.5), rgba(139,92,246,0.5), transparent)" }}
      />

      <div className="relative max-w-3xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center gap-6"
        >
          <h2
            className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight"
            style={{ color: "var(--foreground)" }}
          >
            Start explaining,{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #60a5fa, #818cf8)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              for free.
            </span>
          </h2>
          <p className="text-lg text-muted-foreground">
            No account required for your first explainer.
          </p>
          <ShimmerButton href="/create">
            Create an Explainer →
          </ShimmerButton>
        </motion.div>
      </div>
    </section>
  );
}

// ── Footer ──────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer
      className="py-8 bg-background"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          Explainify · Built by Riley
        </span>
        <a
          href="https://github.com/RileyLin/explainify"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm transition-colors hover:text-slate-300 text-muted-foreground"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}

// ── Page ────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div className="bg-background min-h-screen">
      <HeroSection />
      <HowItWorksSection />
      <TemplatesSection />
      <CTASection />
      <Footer />
    </div>
  );
}
