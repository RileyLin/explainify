"use client";

import Link from "next/link";
import { motion } from "motion/react";
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
        background: "rgba(10,10,20,0.8)",
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
        style={{ background: "linear-gradient(to top, rgba(10,10,20,0.95), transparent)" }}
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
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{ background: "#0a0a0f" }}
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
          backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
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
              style={{ color: "#f1f5f9" }}
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
              className="text-xl md:text-2xl font-medium leading-snug"
              style={{ color: "#94a3b8" }}
            >
              From wall of text to interactive diagram — in seconds.
            </p>

            {/* Body copy */}
            <p
              className="text-base md:text-lg leading-relaxed max-w-md"
              style={{ color: "#64748b" }}
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

// ── How It Works ────────────────────────────────────────────────────
const HOW_IT_WORKS_STEPS = [
  {
    number: "01",
    title: "Paste your content",
    description: "Drop in your technical documentation, architecture spec, code, API docs, or any complex content.",
  },
  {
    number: "02",
    title: "AI analyzes & visualizes",
    description: "Our AI understands the structure, picks the best interactive template, and generates a structured explainer.",
  },
  {
    number: "03",
    title: "Share interactive explainer",
    description: "Get a shareable link, embed in your docs, or download as standalone HTML. Beautiful on every device.",
  },
];

function HowItWorksSection() {
  return (
    <section
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ background: "#0d0d14", borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Subtle center glow */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.3), transparent)" }}
      />

      <div className="relative max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-16"
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#6366f1" }}>
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-bold" style={{ color: "#f1f5f9" }}>
            Three steps from doc to diagram.
          </h2>
        </motion.div>

        <div className="flex flex-col gap-0">
          {HOW_IT_WORKS_STEPS.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0 }}
              transition={{ duration: 0.6, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex gap-8 md:gap-16 items-start py-10 group"
              style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined }}
            >
              {/* Giant faded number */}
              <span
                className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 text-[8rem] lg:text-[10rem] font-black select-none pointer-events-none leading-none"
                style={{
                  color: "rgba(99,102,241,0.05)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {step.number}
              </span>

              {/* Step number (mobile/left) */}
              <span
                className="shrink-0 text-4xl md:text-5xl font-black leading-none"
                style={{ color: "rgba(99,102,241,0.2)" }}
              >
                {step.number}
              </span>

              {/* Content */}
              <div className="flex flex-col gap-2 max-w-lg">
                <h3
                  className="text-xl md:text-2xl font-bold transition-colors"
                  style={{ color: "#f1f5f9" }}
                >
                  {step.title}
                </h3>
                <p className="text-base leading-relaxed" style={{ color: "#64748b" }}>
                  {step.description}
                </p>
              </div>
            </motion.div>
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
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ background: "#0a0a0f", borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(6,182,212,0.3), transparent)" }}
      />

      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#06b6d4" }}>
            Templates
          </p>
          <h2 className="text-3xl md:text-4xl font-bold" style={{ color: "#f1f5f9" }}>
            The right format for every doc.
          </h2>
          <p className="mt-3 text-base" style={{ color: "#64748b" }}>
            Choose manually or let AI pick the best template for your content.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {TEMPLATES.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0 }}
              transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                href="/create"
                className="group flex flex-col gap-3 p-5 rounded-xl transition-all duration-200 hover:-translate-y-1"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid rgba(255,255,255,0.08)`,
                  borderTop: `3px solid ${t.accent}40`,
                  ["--hover-border" as string]: `${t.accent}80`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = `${t.accent}50`;
                  (e.currentTarget as HTMLElement).style.borderTopColor = `${t.accent}`;
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${t.accent}15`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
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
                  <h3 className="font-semibold text-sm mb-0.5 transition-colors" style={{ color: "#e2e8f0" }}>
                    {t.name}
                  </h3>
                  <p className="text-xs" style={{ color: "#64748b" }}>
                    {t.desc}
                  </p>
                </div>
                <p className="text-xs mt-auto" style={{ color: "#475569" }}>
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
      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* Gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(99,102,241,0.15) 50%, rgba(139,92,246,0.12) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "#0a0a0f" }}
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
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col items-center gap-6"
        >
          <h2
            className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight"
            style={{ color: "#f1f5f9" }}
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
          <p className="text-lg" style={{ color: "#64748b" }}>
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
      className="py-8"
      style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0a0a0f" }}
    >
      <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
        <span className="text-sm" style={{ color: "#334155" }}>
          Explainify · Built by Riley
        </span>
        <a
          href="https://github.com/RileyLin/explainify"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm transition-colors hover:text-slate-300"
          style={{ color: "#334155" }}
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
    <div style={{ background: "#0a0a0f", minHeight: "100vh" }}>
      <HeroSection />
      <HowItWorksSection />
      <TemplatesSection />
      <CTASection />
      <Footer />
    </div>
  );
}
