"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Loader2,
  Sparkles,
  ArrowLeft,
  Share2,
  Copy,
  Check,
  Code2,
  AlertCircle,
  LayoutDashboard,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { ExplainerData } from "@/lib/schemas/base";

// Lazy-load renderers
import {
  FlowAnimator,
  CodeWalkthrough,
  ConceptBuilder,
  CompareContrast,
  DecisionTree,
  TimelineRenderer,
  ComponentExplorer,
} from "@/components/renderers/renderer-registry";

import { ColorThemePicker } from "@/components/editor/color-theme-picker";
import { AnimationSpeedProvider, SpeedToggle } from "@/components/editor/animation-speed";

type TemplateChoice =
  | "auto"
  | "flow-animator"
  | "code-walkthrough"
  | "concept-builder"
  | "compare-contrast"
  | "decision-tree"
  | "timeline"
  | "component-explorer";

// Templates that support animated speed controls
const SPEED_TEMPLATES: TemplateChoice[] = ["flow-animator", "component-explorer"];

// Templates that support accent color
const COLOR_TEMPLATES: TemplateChoice[] = [
  "flow-animator",
  "code-walkthrough",
  "concept-builder",
  "decision-tree",
  "component-explorer",
];

// ── Template selector ──────────────────────────────────────────────
const templates: { value: TemplateChoice; label: string; desc: string }[] = [
  { value: "auto", label: "✨ Auto-detect", desc: "Let AI choose the best format" },
  { value: "flow-animator", label: "🔀 Flow Diagram", desc: "Animated node diagrams" },
  { value: "code-walkthrough", label: "💻 Code Walkthrough", desc: "Step-through code annotations" },
  { value: "concept-builder", label: "🧠 Concept Explainer", desc: "Progressive layered concepts" },
  { value: "compare-contrast", label: "⚖️ Compare & Contrast", desc: "Side-by-side analysis" },
  { value: "decision-tree", label: "🌳 Decision Tree", desc: "Interactive branching paths" },
  { value: "timeline", label: "📅 Timeline", desc: "Chronological events" },
  { value: "component-explorer", label: "🏗️ Component Explorer", desc: "Architecture diagrams" },
];

// ── Main Page ──────────────────────────────────────────────────────
export default function CreatePage() {
  const { data: session } = useSession();
  const [content, setContent] = useState("");
  const [template, setTemplate] = useState<TemplateChoice>("auto");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ExplainerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [usage, setUsage] = useState<{ count: number; limit: number; plan: string } | null>(null);
  const [accentColor, setAccentColor] = useState("#3b82f6");

  // Publishing state
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedToDashboard, setSavedToDashboard] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "embed" | null>(null);

  // Fetch usage for signed-in users
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/usage")
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => null);
  }, [session?.user]);

  const handleGenerate = useCallback(
    async (overrideTemplate?: TemplateChoice) => {
      const chosenTemplate = overrideTemplate ?? template;
      const inputContent = content.trim();
      if (!inputContent) return;

      setGenerating(true);
      setResult(null);
      setError(null);
      setIsRateLimited(false);
      setPublishedUrl(null);
      setPublishedSlug(null);
      setSavedToDashboard(false);

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: inputContent, template: chosenTemplate }),
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          if (errBody.code === "RATE_LIMITED") {
            setIsRateLimited(true);
            setError(errBody.error || "You've reached the free tier limit.");
          } else {
            throw new Error(errBody.error || `Generation failed (${response.status})`);
          }
          setGenerating(false);
          return;
        }

        const { data } = await response.json();
        setResult(data);
        // Refresh usage counter
        if (session?.user) {
          fetch("/api/usage").then((r) => r.json()).then(setUsage).catch(() => null);
        }
      } catch (err) {
        console.error("Generation error:", err);
        setError(`AI generation failed — ${err instanceof Error ? err.message : "Unknown error"}`);
        setGenerating(false);
        return;
      }

      setGenerating(false);
    },
    [content, template],
  );

    const handleSave = async () => {
    if (!result || savedToDashboard) return;
    setSaving(true);
    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: result, sourceContent: content || undefined, isPublic: false }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Save failed (${response.status})`);
      }
      const { slug } = await response.json();
      setPublishedSlug(slug);
      setSavedToDashboard(true);
    } catch (err) {
      setError(`Save failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!result) return;
    setPublishing(true);
    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: result, sourceContent: content || undefined, isPublic: true }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Publishing failed (${response.status})`);
      }
      const { slug, url } = await response.json();
      setPublishedSlug(slug);
      setPublishedUrl(url);
      setSavedToDashboard(true);
    } catch (err) {
      setError(`Publishing failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleCopy = (type: "url" | "embed") => {
    if (!publishedUrl || !publishedSlug) return;
    const text =
      type === "url"
        ? publishedUrl
        : `<iframe src="${publishedUrl}" width="100%" height="600" frameborder="0" style="border-radius:12px;border:1px solid #e5e7eb;"></iframe>`;
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleTemplateSwitch = (newTemplate: TemplateChoice) => {
    if (newTemplate === "auto" || newTemplate === result?.template) return;
    handleGenerate(newTemplate);
  };

  const handleReset = () => {
    setResult(null);
    setGenerating(false);
    setPublishedUrl(null);
    setPublishedSlug(null);
    setSavedToDashboard(false);
    setIsRateLimited(false);
    setError(null);
  };

  const activeTemplate = (result?.template ?? template) as TemplateChoice;
  const showSpeed = SPEED_TEMPLATES.includes(activeTemplate);
  const showColor = COLOR_TEMPLATES.includes(activeTemplate);
  const hasEditorControls = showSpeed || showColor;

  const renderResult = () => {
    if (!result) return null;
    switch (result.template) {
      case "flow-animator":
        return <FlowAnimator data={result} />;
      case "code-walkthrough":
        return <CodeWalkthrough data={result} />;
      case "concept-builder":
        return <ConceptBuilder data={result} />;
      case "compare-contrast":
        return <CompareContrast data={result} />;
      case "decision-tree":
        return <DecisionTree data={result} />;
      case "timeline":
        return <TimelineRenderer data={result} />;
      case "component-explorer":
        return <ComponentExplorer data={result} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Create Explainer</h1>
            <p className="text-sm text-muted-foreground">Paste your content and let AI transform it</p>
          </div>
        </div>

        {/* Rate limit paywall panel */}
        {isRateLimited && !result && (
          <div className="mb-6 p-5 rounded-xl border border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/20">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
                <Zap size={20} className="text-indigo-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-indigo-900 dark:text-indigo-200 mb-0.5">You&apos;ve used all 5 free explainers this month</p>
                <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-4">
                  Upgrade to Pro for unlimited explainers, no watermark, and private links — $15/mo.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-colors"
                  >
                    <Zap size={14} />
                    Upgrade to Pro →
                  </Link>
                  <button
                    onClick={() => { setIsRateLimited(false); setError(null); }}
                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error banner (generic generation errors) */}
        {error && !result && !isRateLimited && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-950/20 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-800 dark:text-red-200 font-medium">Generation failed</p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">{error}</p>
              <div className="flex items-center gap-3 mt-2">
                <button
                  onClick={() => handleGenerate()}
                  disabled={!content.trim()}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-all"
                >
                  Try again
                </button>
                <button onClick={() => setError(null)} className="text-xs text-red-600 dark:text-red-400 hover:underline">
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Inline error (while result is shown, e.g. publish failure) */}
        {error && result && (
          <div className="mb-4 p-3 rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-amber-800 dark:text-amber-200">{error}</p>
              <button onClick={() => setError(null)} className="text-xs text-amber-600 dark:text-amber-400 hover:underline mt-1">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Input section */}
        {!result && !generating && (
          <div className="space-y-6">
            <div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste your technical documentation, architecture spec, code, or any complex content here..."
                className="w-full min-h-[300px] p-4 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/50 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-mono text-sm leading-relaxed"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Supports markdown, plain text, code, or any structured content.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Output format</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {templates.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTemplate(t.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      template === t.value
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                        : "border-border hover:border-blue-300 bg-card"
                    }`}
                  >
                    <div className="text-sm font-medium text-foreground">{t.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => handleGenerate()}
                disabled={!content.trim() || generating}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/25"
              >
                {generating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Analyzing your content...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Generate Explainer
                  </>
                )}
              </button>
              {/* Usage counter for free tier */}
              {usage && usage.plan !== "pro" && (
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: usage.limit }).map((_, i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full transition-colors"
                        style={{ background: i < usage.count ? "#6366f1" : "rgba(99,102,241,0.2)" }}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {usage.count}/{usage.limit} used
                  </span>
                  {usage.count >= usage.limit - 1 && (
                    <Link href="/pricing" className="text-xs font-medium text-indigo-500 hover:underline flex items-center gap-1">
                      <Zap size={11} /> Upgrade
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Generating state (when switching templates or initial gen) */}
        {generating && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="animate-spin text-blue-500" />
              <p className="text-sm text-muted-foreground">
                {result ? "Re-generating with new template..." : "Analyzing your content..."}
              </p>
            </div>
          </div>
        )}

        {/* Result */}
        {result && !generating && (
          <AnimationSpeedProvider>
            <div className="space-y-6">
              {/* Template switcher row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Template:</span>
                {templates.filter((t) => t.value !== "auto").map((t) => (
                  <button
                    key={t.value}
                    onClick={() => handleTemplateSwitch(t.value)}
                    disabled={generating}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      result.template === t.value
                        ? "bg-blue-500 text-white"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    } ${generating ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {t.label}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  {/* Save to dashboard (private) */}
                  {session && !savedToDashboard && !publishedUrl && (
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50 transition-all border border-border"
                    >
                      {saving ? <><Loader2 size={12} className="animate-spin" />Saving...</> : <>💾 Save</>}
                    </button>
                  )}
                  {savedToDashboard && !publishedUrl && (
                    <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-green-400 border border-green-500/30 bg-green-950/20">
                      ✓ Saved
                    </span>
                  )}
                  {/* Share publicly */}
                  {!publishedUrl && (
                    <button
                      onClick={handlePublish}
                      disabled={publishing}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-all"
                    >
                      {publishing ? (
                        <><Loader2 size={14} className="animate-spin" />Publishing...</>
                      ) : (
                        <><Share2 size={14} />Share →</>
                      )}
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-all"
                  >
                    + New
                  </button>
                </div>
              </div>

              {/* Editor controls: conditionally show color picker + speed */}
              {hasEditorControls && (
                <div className="flex items-center gap-4 flex-wrap border border-border rounded-lg px-4 py-2.5 bg-card">
                  {showColor && (
                    <>
                      <ColorThemePicker selected={accentColor} onSelect={setAccentColor} />
                    </>
                  )}
                  {showColor && showSpeed && <div className="h-5 w-px bg-border" />}
                  {showSpeed && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Speed:</span>
                      <SpeedToggle />
                    </div>
                  )}
                </div>
              )}

              {/* Published success panel */}
              {publishedUrl && (
                <div className="p-5 rounded-xl border border-green-500/30 bg-green-50 dark:bg-green-950/20 space-y-4">
                  <div className="flex items-center gap-2">
                    <Check size={18} className="text-green-600 dark:text-green-400 shrink-0" />
                    <p className="text-sm font-semibold text-green-800 dark:text-green-200">
                      🎉 Your explainer is live!
                    </p>
                  </div>

                  {session && (
                    <p className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1.5">
                      <LayoutDashboard size={13} />
                      Saved to your dashboard
                    </p>
                  )}

                  {/* Shareable URL */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={publishedUrl}
                      className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-black/20 border border-green-300 dark:border-green-700 text-sm text-foreground font-mono"
                    />
                    <button
                      onClick={() => handleCopy("url")}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 transition-all shrink-0"
                    >
                      {copied === "url" ? <Check size={14} /> : <Copy size={14} />}
                      {copied === "url" ? "Copied!" : "Copy URL"}
                    </button>
                  </div>

                  {/* Embed code */}
                  <button
                    onClick={() => handleCopy("embed")}
                    className="flex items-center gap-1 text-xs text-green-700 dark:text-green-300 hover:underline"
                  >
                    <Code2 size={12} />
                    {copied === "embed" ? "Embed code copied!" : "Copy embed code"}
                  </button>

                  {/* Dashboard link */}
                  {session && (
                    <Link
                      href="/dashboard"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-300 hover:underline"
                    >
                      <LayoutDashboard size={13} />
                      View in Dashboard →
                    </Link>
                  )}
                </div>
              )}

              {renderResult()}
            </div>
          </AnimationSpeedProvider>
        )}
      </div>
    </div>
  );
}
