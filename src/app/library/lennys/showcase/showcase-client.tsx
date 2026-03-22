"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "motion/react";
import {
  Search,
  Sparkles,
  Layers,
  ArrowRight,
  ChevronDown,
  GitBranch,
  Clock,
  Zap,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Scroll-triggered section wrapper ────────────────────────────────────────

function FadeIn({
  children,
  className,
  delay = 0,
  direction = "up",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "left" | "right" | "none";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px 0px" });

  const initialY = direction === "up" ? 28 : 0;
  const initialX =
    direction === "left" ? -28 : direction === "right" ? 28 : 0;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: initialY, x: initialX }}
      animate={isInView ? { opacity: 1, y: 0, x: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Animated mesh background ─────────────────────────────────────────────────

function AnimatedMesh() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden pointer-events-none"
    >
      {/* Radial gradient overlay — indigo */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 70% 50%, rgba(99,102,241,0.08) 0%, transparent 70%)",
        }}
      />
      {/* Subtle dot grid */}
      <div
        className="absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(165,180,252,0.6) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(ellipse 90% 80% at 60% 50%, black 20%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 80% at 60% 50%, black 20%, transparent 80%)",
        }}
      />
      {/* Floating indigo blob — top right */}
      <motion.div
        className="absolute w-64 h-64 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
          top: "10%",
          right: "15%",
        }}
        animate={{ y: [0, -16, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Floating blue blob — bottom center */}
      <motion.div
        className="absolute w-40 h-40 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(59,130,246,0.09) 0%, transparent 70%)",
          bottom: "20%",
          right: "30%",
        }}
        animate={{ y: [0, 12, 0], scale: [1, 0.94, 1] }}
        transition={{
          duration: 9,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
      />
    </div>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────

interface StepCardProps {
  number: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  delay: number;
}

function StepCard({ number, title, description, icon, delay }: StepCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px 0px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex flex-col gap-4 rounded-2xl p-6 sm:p-7"
      style={{
        background: "rgba(99,102,241,0.07)",
        border: "1px solid rgba(99,102,241,0.18)",
      }}
    >
      {/* Indigo number */}
      <div className="flex items-start justify-between gap-3">
        <span className="text-4xl font-black leading-none tracking-tighter select-none text-indigo-400">
          {number}
        </span>
        <div
          className="mt-1 w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "rgba(99,102,241,0.12)",
            border: "1px solid rgba(99,102,241,0.25)",
            color: "#a5b4fc",
          }}
        >
          {icon}
        </div>
      </div>
      <div>
        <h3 className="font-bold text-white text-base tracking-tight mb-1.5">
          {title}
        </h3>
        <p className="text-sm text-white/50 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

// ─── Featured explainer card ──────────────────────────────────────────────────

interface FeaturedCardProps {
  slug: string;
  title: string;
  subtitle: string;
  template: string;
  templateColor: string;
  delay: number;
}

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  timeline: <Clock className="w-3 h-3" />,
  flow: <GitBranch className="w-3 h-3" />,
  concept: <Layers className="w-3 h-3" />,
};

function FeaturedCard({
  slug,
  title,
  subtitle,
  template,
  templateColor,
  delay,
}: FeaturedCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px 0px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
      className="group flex flex-col rounded-2xl transition-all duration-200 hover:-translate-y-1"
      style={{
        background: "rgba(99,102,241,0.07)",
        border: "1px solid rgba(99,102,241,0.18)",
        boxShadow: "0 0 0 rgba(99,102,241,0)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 0 40px rgba(99,102,241,0.15)";
        (e.currentTarget as HTMLDivElement).style.borderColor =
          "rgba(99,102,241,0.4)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow =
          "0 0 0 rgba(99,102,241,0)";
        (e.currentTarget as HTMLDivElement).style.borderColor =
          "rgba(99,102,241,0.18)";
      }}
    >
      {/* Card preview area */}
      <div
        className="h-36 sm:h-44 rounded-t-2xl relative overflow-hidden flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(59,130,246,0.08) 50%, rgba(99,102,241,0.12) 100%)",
        }}
      >
        {/* Abstract visual representing explainer type */}
        <div className="absolute inset-0 flex items-center justify-center opacity-20">
          {template === "timeline" && (
            <div className="flex flex-col gap-3 w-28">
              {[40, 64, 48, 56].map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 shrink-0" />
                  <div
                    className="h-2 rounded-full bg-indigo-500"
                    style={{ width: `${w}%` }}
                  />
                </div>
              ))}
            </div>
          )}
          {template === "flow" && (
            <div className="flex flex-col gap-3 items-center">
              {[
                ["A", "B"],
                ["C"],
                ["D", "E"],
              ].map((row, i) => (
                <div key={i} className="flex gap-4">
                  {row.map((n) => (
                    <div
                      key={n}
                      className="w-10 h-7 rounded-lg bg-indigo-500 flex items-center justify-center text-white text-xs font-bold"
                    >
                      {n}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {template === "concept" && (
            <div className="flex flex-col gap-2 w-32">
              {[80, 60, 90, 50, 70].map((w, i) => (
                <div
                  key={i}
                  className="h-3 rounded-full bg-indigo-400"
                  style={{ width: `${w}%`, marginLeft: `${(5 - i) * 6}%` }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Template badge centered */}
        <div
          className={cn(
            "relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
            templateColor
          )}
        >
          {TEMPLATE_ICONS[template] ?? <Zap className="w-3 h-3" />}
          <span className="capitalize">{template}</span>
        </div>
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 p-5 sm:p-6 gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-400 mb-1">
            {subtitle}
          </p>
          <h3 className="font-bold text-white leading-snug tracking-tight text-base">
            {title}
          </h3>
        </div>

        <Link
          href={`/e/${slug}`}
          target="_blank"
          className={cn(
            "mt-auto inline-flex items-center gap-2",
            "px-4 py-2.5 rounded-xl text-sm font-semibold",
            "text-white transition-all duration-150 active:scale-[0.98]"
          )}
          style={{ background: "#6366f1" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLAnchorElement).style.background = "#4f46e5")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLAnchorElement).style.background = "#6366f1")
          }
        >
          View Explainer
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Breadcrumb visual component ──────────────────────────────────────────────

function BreadcrumbVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px 0px" });

  const crumbs = [
    {
      label: "Boris Cherny",
      style: {
        background: "rgba(99,102,241,0.15)",
        color: "#a5b4fc",
        borderColor: "rgba(99,102,241,0.3)",
      },
    },
    {
      label: "TypeScript Types",
      style: {
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.7)",
        borderColor: "rgba(255,255,255,0.1)",
      },
    },
    {
      label: "Conditional Types",
      style: {
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.7)",
        borderColor: "rgba(255,255,255,0.1)",
      },
    },
    {
      label: "Distributive Conditionals",
      style: {
        background: "rgba(255,255,255,0.04)",
        color: "rgba(255,255,255,0.5)",
        borderColor: "rgba(255,255,255,0.08)",
      },
    },
  ];

  return (
    <div ref={ref} className="w-full max-w-lg mx-auto lg:mx-0">
      {/* Breadcrumb path */}
      <div
        className="rounded-2xl p-5"
        style={{
          background: "rgba(99,102,241,0.08)",
          border: "1px solid rgba(99,102,241,0.2)",
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3">
          Deep dive path
        </p>
        <div className="flex flex-col gap-2">
          {crumbs.map((crumb, i) => (
            <motion.div
              key={crumb.label}
              initial={{ opacity: 0, x: -16 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{
                duration: 0.4,
                delay: 0.1 + i * 0.1,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex items-center gap-2"
            >
              {/* Indent line */}
              {i > 0 && (
                <div className="flex items-center">
                  {Array.from({ length: i }).map((_, j) => (
                    <div key={j} className="w-4 shrink-0" />
                  ))}
                  <div className="w-3 h-px bg-white/20 mr-1 shrink-0" />
                </div>
              )}
              <span
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium border"
                style={crumb.style}
              >
                {crumb.label}
              </span>
              {i < crumbs.length - 1 && (
                <span className="text-xs text-white/20 ml-auto">Level {i + 1}</span>
              )}
              {i === crumbs.length - 1 && (
                <span className="text-xs text-indigo-400 font-semibold ml-auto">
                  Level {i + 1} ↓
                </span>
              )}
            </motion.div>
          ))}
        </div>

        {/* Depth meter */}
        <div
          className="mt-4 pt-4 flex items-center gap-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((d) => (
              <motion.div
                key={d}
                initial={{ scale: 0 }}
                animate={isInView ? { scale: 1 } : {}}
                transition={{ delay: 0.5 + d * 0.08, duration: 0.3, ease: "backOut" }}
                className="w-2 h-2 rounded-full"
                style={{
                  background: d === 3 ? "#6366f1" : "rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </div>
          <span className="text-xs text-white/30">4 levels deep — keep going</span>
        </div>
      </div>

      {/* Generate button preview */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 0.7, duration: 0.4 }}
        className="mt-3 rounded-xl px-4 py-3 flex items-center gap-3"
        style={{
          background: "rgba(99,102,241,0.08)",
          border: "1px solid rgba(99,102,241,0.2)",
        }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: "rgba(99,102,241,0.2)",
            border: "1px solid rgba(99,102,241,0.3)",
          }}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white/80">
            Generate deeper explainer
          </p>
          <p className="text-[10px] text-white/30 truncate">
            Distributive Conditional Types → ...
          </p>
        </div>
        <div
          className="shrink-0 px-2.5 py-1 rounded-lg text-white text-[10px] font-bold"
          style={{ background: "#6366f1" }}
        >
          Go
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ShowcaseClient() {
  // Smooth scroll for the "How It Works" anchor
  const howItWorksRef = useRef<HTMLElement>(null);

  const scrollToHowItWorks = () => {
    howItWorksRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ══════════════════════════════════════════════════════
          SECTION 1: HERO
      ══════════════════════════════════════════════════════ */}
      <section
        className="relative overflow-hidden"
        style={{
          borderBottom: "1px solid rgba(99,102,241,0.15)",
          minHeight: "min(90vh, 720px)",
        }}
      >
        <AnimatedMesh />

        <div className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 lg:px-12 pt-16 sm:pt-20 pb-20 sm:pb-28">
          {/* Eyebrow */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
            className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-5"
          >
            Lenny&apos;s Data Challenge · VizBrief
          </motion.p>

          {/* Headline — left-aligned, asymmetric, editorial */}
          <div className="max-w-3xl">
            <motion.h1
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="text-5xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.05] mb-6"
            >
              Lenny&apos;s Archive,
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, #818cf8, #6366f1, #60a5fa)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Visualized.
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="text-lg sm:text-xl text-white/60 leading-relaxed mb-10 max-w-xl"
            >
              638 podcasts and newsletters transformed into interactive visual
              explainers. Search, explore, and deep dive into any topic.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.42, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col sm:flex-row items-start sm:items-center gap-3"
            >
              <Link
                href="/library/lennys"
                className={cn(
                  "inline-flex items-center gap-2 px-6 py-3.5 rounded-xl",
                  "text-white font-bold text-sm",
                  "transition-all duration-150 active:scale-[0.97]"
                )}
                style={{
                  background: "#6366f1",
                  boxShadow: "0 4px 24px rgba(99,102,241,0.35)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "#4f46e5";
                  (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                    "0 8px 32px rgba(99,102,241,0.45)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "#6366f1";
                  (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                    "0 4px 24px rgba(99,102,241,0.35)";
                }}
              >
                Browse the Library
                <ArrowRight className="w-4 h-4" />
              </Link>

              <button
                onClick={scrollToHowItWorks}
                className={cn(
                  "inline-flex items-center gap-2 px-6 py-3.5 rounded-xl",
                  "text-white/80 font-semibold text-sm",
                  "transition-all duration-150 active:scale-[0.97]"
                )}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(255,255,255,0.1)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "rgba(255,255,255,0.2)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "rgba(255,255,255,0.06)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "rgba(255,255,255,0.12)";
                }}
              >
                How It Works
                <ChevronDown className="w-4 h-4" />
              </button>
            </motion.div>
          </div>

          {/* Floating stat cards — right side, hidden on small screens */}
          <div className="hidden lg:block absolute right-12 top-1/2 -translate-y-1/2">
            <motion.div
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.65, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-4"
            >
              {[
                { value: "638", label: "Episodes & Issues", icon: <BookOpen className="w-4 h-4" /> },
                { value: "5.4M", label: "Words Indexed", icon: <Layers className="w-4 h-4" /> },
                { value: "∞", label: "Levels Deep", icon: <Sparkles className="w-4 h-4" /> },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.5,
                    delay: 0.65 + i * 0.1,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="flex items-center gap-4 px-5 py-4 rounded-2xl min-w-[200px]"
                  style={{
                    background: "rgba(99,102,241,0.12)",
                    border: "1px solid rgba(99,102,241,0.25)",
                    boxShadow: "0 0 30px rgba(99,102,241,0.08)",
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: "rgba(99,102,241,0.2)",
                      border: "1px solid rgba(99,102,241,0.3)",
                      color: "#a5b4fc",
                    }}
                  >
                    {stat.icon}
                  </div>
                  <div>
                    <p className="text-xl font-black text-white tracking-tight leading-none">
                      {stat.value}
                    </p>
                    <p className="text-xs text-white/50 mt-0.5">{stat.label}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 2: HOW IT WORKS
      ══════════════════════════════════════════════════════ */}
      <section
        ref={howItWorksRef}
        id="how-it-works"
        className="py-20 sm:py-28"
        style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12">
          <FadeIn className="mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3">
              How It Works
            </p>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              From dense text to instant clarity
            </h2>
            <p className="mt-3 text-white/50 max-w-xl leading-relaxed">
              Every episode and newsletter becomes a different kind of visual explainer —
              pick the format that fits how you think.
            </p>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <StepCard
              number="01"
              title="Pick any episode"
              description="Browse 638 podcasts and newsletters from Lenny's archive. Filter by topic, guest, or content type."
              icon={<Search className="w-4 h-4" />}
              delay={0}
            />
            <StepCard
              number="02"
              title="Get a visual explainer"
              description="AI generates an interactive diagram — timelines, flow charts, concept maps — tailored to the content."
              icon={<Sparkles className="w-4 h-4" />}
              delay={0.1}
            />
            <StepCard
              number="03"
              title="Deep dive into details"
              description="Click any node to generate a deeper visualization of that exact topic. Go 3, 4, 5 levels down the rabbit hole."
              icon={<Layers className="w-4 h-4" />}
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 3: FEATURED EXPLAINERS
      ══════════════════════════════════════════════════════ */}
      <section
        className="py-20 sm:py-28"
        style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12">
          <FadeIn className="mb-12">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3">
              Featured Explainers
            </p>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  See it in action
                </h2>
                <p className="mt-3 text-white/50 max-w-xl leading-relaxed">
                  Three explainers generated from a single episode — same content,
                  different lenses. Boris Cherny on TypeScript.
                </p>
              </div>
              <Link
                href="/library/lennys"
                className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Browse all 638 episodes
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <FeaturedCard
              slug="pdx13spx"
              title="Boris Cherny's TypeScript career journey"
              subtitle="Timeline Explainer"
              template="timeline"
              templateColor="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
              delay={0}
            />
            <FeaturedCard
              slug="gccy4ztk"
              title="How TypeScript's type system flows"
              subtitle="Flow Animator"
              template="flow"
              templateColor="bg-blue-500/20 text-blue-300 border border-blue-500/30"
              delay={0.1}
            />
            <FeaturedCard
              slug="vs2974y1"
              title="Core concepts behind TypeScript design"
              subtitle="Concept Builder"
              template="concept"
              templateColor="bg-indigo-400/20 text-indigo-200 border border-indigo-400/30"
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 4: DEEP DIVE FEATURE
      ══════════════════════════════════════════════════════ */}
      <section
        className="py-20 sm:py-28"
        style={{
          borderBottom: "1px solid rgba(99,102,241,0.12)",
          background:
            "linear-gradient(180deg, var(--background) 0%, rgba(99,102,241,0.04) 100%)",
        }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left: copy */}
            <div>
              <FadeIn>
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3">
                  The Deep Dive
                </p>
                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                  Every node is a{" "}
                  <span
                    style={{
                      background: "linear-gradient(135deg, #818cf8, #60a5fa)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    rabbit hole.
                  </span>
                </h2>
              </FadeIn>

              <FadeIn delay={0.1} className="mt-5">
                <p className="text-white/50 leading-relaxed text-base">
                  Click any node on a visual explainer to generate a deeper, more
                  detailed visualization of just that topic. Go 3, 4, 5 levels deep.
                </p>
                <p className="mt-3 text-white/50 leading-relaxed text-base">
                  It&apos;s like having a visual table of contents for{" "}
                  <span className="font-semibold text-white/80">5.4 million words</span>{" "}
                  — but instead of reading, you navigate.
                </p>
              </FadeIn>

              <FadeIn delay={0.2} className="mt-8">
                <div className="flex flex-col gap-3">
                  {[
                    "Click any node on a live explainer",
                    "AI generates a focused, deeper visualization",
                    "Each result is fully navigable — go deeper still",
                  ].map((point, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div
                        className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          background: "rgba(99,102,241,0.15)",
                          border: "1px solid rgba(99,102,241,0.3)",
                        }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      </div>
                      <p className="text-sm text-white/60 leading-relaxed">{point}</p>
                    </div>
                  ))}
                </div>
              </FadeIn>
            </div>

            {/* Right: breadcrumb visual */}
            <FadeIn direction="right" delay={0.15}>
              <BreadcrumbVisual />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 5: WHAT'S NEXT
      ══════════════════════════════════════════════════════ */}
      <section
        className="py-20 sm:py-28"
        style={{ borderBottom: "1px solid rgba(99,102,241,0.12)" }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12">
          <div className="max-w-2xl">
            <FadeIn>
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3">
                What&apos;s Next
              </p>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                This is just the proof of concept.
              </h2>
            </FadeIn>

            <FadeIn delay={0.1} className="mt-5 space-y-4">
              <p className="text-white/50 leading-relaxed text-base">
                This is a proof of concept for VizBrief&apos;s{" "}
                <span className="font-semibold text-white/80">Knowledge Source</span>{" "}
                feature — a system for connecting entire content libraries to visual
                explainers with infinite deep dive.
              </p>
              <p className="text-white/50 leading-relaxed text-base">
                Connect any content library — Notion docs, Confluence wikis, podcast
                archives — and get visual explainers with deep dive on demand. Turn
                your team&apos;s institutional knowledge into something navigable.
              </p>
            </FadeIn>

            <FadeIn delay={0.2} className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/create"
                className={cn(
                  "inline-flex items-center gap-2 px-6 py-3.5 rounded-xl",
                  "text-white font-bold text-sm",
                  "transition-all duration-150 active:scale-[0.97]"
                )}
                style={{
                  background: "#6366f1",
                  boxShadow: "0 4px 24px rgba(99,102,241,0.35)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "#4f46e5";
                  (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                    "0 8px 32px rgba(99,102,241,0.45)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "#6366f1";
                  (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                    "0 4px 24px rgba(99,102,241,0.35)";
                }}
              >
                Try VizBrief
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/library/lennys"
                className={cn(
                  "inline-flex items-center gap-2 px-6 py-3.5 rounded-xl",
                  "text-white/80 font-semibold text-sm",
                  "transition-all duration-150 active:scale-[0.97]"
                )}
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background =
                    "rgba(255,255,255,0.1)";
                  (e.currentTarget as HTMLAnchorElement).style.borderColor =
                    "rgba(255,255,255,0.2)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background =
                    "rgba(255,255,255,0.06)";
                  (e.currentTarget as HTMLAnchorElement).style.borderColor =
                    "rgba(255,255,255,0.12)";
                }}
              >
                Browse the Library
                <ArrowRight className="w-4 h-4" />
              </Link>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          SECTION 6: FOOTER
      ══════════════════════════════════════════════════════ */}
      <footer className="py-10 sm:py-12">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Attribution */}
            <div>
              <p className="text-sm text-white/40">
                Built for{" "}
                <span className="font-semibold text-white/70">
                  Lenny&apos;s Data Challenge
                </span>{" "}
                by{" "}
                <span className="font-semibold text-white/70">Riley Lin</span>
              </p>
              <p className="text-xs text-white/25 mt-0.5">
                April 2026 · VizBrief
              </p>
            </div>

            {/* Links */}
            <nav className="flex items-center gap-5">
              <Link
                href="/library/lennys"
                className="text-sm text-white/40 hover:text-white/70 transition-colors font-medium"
              >
                Browse Library
              </Link>
              <span className="text-white/20" aria-hidden>
                ·
              </span>
              <Link
                href="/"
                className="text-sm text-white/40 hover:text-white/70 transition-colors font-medium"
              >
                VizBrief
              </Link>
              <span className="text-white/20" aria-hidden>
                ·
              </span>
              <Link
                href="/create"
                className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Try It Free →
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
