"use client";

import { useState, useCallback } from "react";
import {
  Loader2,
  Sparkles,
  ArrowLeft,
  Share2,
  Copy,
  Check,
  Code2,
  AlertCircle,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import type { ExplainerData } from "@/lib/schemas/base";
import type { FlowAnimatorData } from "@/lib/schemas/flow";
import type { CodeWalkthroughData } from "@/lib/schemas/code";
import type { ConceptBuilderData } from "@/lib/schemas/concept";
import type { CompareContrastData } from "@/lib/schemas/compare";
import type { DecisionTreeData } from "@/lib/schemas/decision";
import type { TimelineData } from "@/lib/schemas/timeline";
import type { ComponentExplorerData } from "@/lib/schemas/explorer";

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

// ── Mock data fallbacks ────────────────────────────────────────────
const mockFlowData: FlowAnimatorData = {
  template: "flow-animator",
  meta: {
    title: "API Request Flow",
    summary: "How a request flows from client through authentication to the backend service",
    difficulty: "beginner",
    template: "flow-animator",
  },
  nodes: [
    { id: "client", label: "Client App", description: "Sends HTTP request with auth headers", icon: "monitor", details: "The client application packages the user's request with the appropriate authentication headers." },
    { id: "gateway", label: "API Gateway", description: "Routes and validates requests", icon: "shield" },
    { id: "auth", label: "Auth Service", description: "Verifies identity and permissions", icon: "key" },
    { id: "service", label: "Backend Service", description: "Processes business logic", icon: "cog" },
    { id: "db", label: "Database", description: "Stores and retrieves data", icon: "database" },
  ],
  connections: [
    { from: "client", to: "gateway", label: "HTTPS", animated: true },
    { from: "gateway", to: "auth", label: "Validate", animated: true },
    { from: "auth", to: "gateway", label: "Token OK" },
    { from: "gateway", to: "service", label: "Forward", animated: true },
    { from: "service", to: "db", label: "Query", animated: true },
  ],
  stepOrder: ["client", "gateway", "auth", "service", "db"],
};

const mockCodeData: CodeWalkthroughData = {
  template: "code-walkthrough",
  meta: {
    title: "React Custom Hook Pattern",
    summary: "Building a reusable useLocalStorage hook with TypeScript",
    difficulty: "intermediate",
    template: "code-walkthrough",
  },
  blocks: [
    {
      id: "hook",
      language: "typescript",
      filename: "useLocalStorage.ts",
      code: `import { useState, useEffect } from 'react';\n\nexport function useLocalStorage<T>(\n  key: string,\n  initialValue: T\n): [T, (value: T | ((prev: T) => T)) => void] {\n  const [storedValue, setStoredValue] = useState<T>(() => {\n    try {\n      const item = window.localStorage.getItem(key);\n      return item ? JSON.parse(item) : initialValue;\n    } catch (error) {\n      return initialValue;\n    }\n  });\n\n  useEffect(() => {\n    try {\n      window.localStorage.setItem(key, JSON.stringify(storedValue));\n    } catch (error) {\n      console.warn(error);\n    }\n  }, [key, storedValue]);\n\n  return [storedValue, setStoredValue];\n}`,
    },
  ],
  annotations: [
    { id: "a1", blockId: "hook", startLine: 3, endLine: 6, label: "Generic Type Signature", explanation: "The hook accepts a generic type T for any serializable value." },
    { id: "a2", blockId: "hook", startLine: 7, endLine: 14, label: "Lazy Initialization", explanation: "useState reads from localStorage only once on mount." },
    { id: "a3", blockId: "hook", startLine: 16, endLine: 21, label: "Sync to Storage", explanation: "useEffect syncs state back to localStorage on changes." },
  ],
  stepOrder: ["a1", "a2", "a3"],
};

const mockConceptData: ConceptBuilderData = {
  template: "concept-builder",
  meta: {
    title: "How Neural Networks Learn",
    summary: "Building intuition from a single neuron to deep learning",
    difficulty: "advanced",
    template: "concept-builder",
  },
  layers: [
    { id: "perceptron", title: "The Perceptron", description: "A single neuron takes inputs, multiplies by weights, sums, and activates.", visualLabel: "f(x) = σ(Σ wᵢxᵢ + b)", icon: "circle" },
    { id: "layer", title: "Hidden Layer", description: "Multiple perceptrons form a layer. Each neuron learns different features.", visualLabel: "Layer = [n₁, n₂, ..., nₖ]", icon: "layers" },
    { id: "deep", title: "Deep Network", description: "Stacked layers learn hierarchical features — edges → shapes → concepts.", visualLabel: "Input → H₁ → H₂ → ... → Output", icon: "brain" },
    { id: "backprop", title: "Backpropagation", description: "Compare output to answer, calculate error, propagate backwards adjusting weights via chain rule.", visualLabel: "∂Loss/∂w", icon: "refresh-cw" },
  ],
};

const mockCompareData: CompareContrastData = {
  template: "compare-contrast",
  meta: {
    title: "React vs Vue vs Svelte",
    summary: "Comparing three popular frontend frameworks across key dimensions",
    difficulty: "intermediate",
    template: "compare-contrast",
  },
  items: [
    { id: "react", name: "React", description: "A JavaScript library for building user interfaces by Meta", pros: ["Massive ecosystem & community", "Flexible architecture", "Strong job market"], cons: ["Steep learning curve", "Boilerplate heavy", "No official router/state management"] },
    { id: "vue", name: "Vue", description: "The progressive JavaScript framework", pros: ["Gentle learning curve", "Excellent documentation", "Built-in state management"], cons: ["Smaller ecosystem than React", "Fewer job opportunities", "Options API can be limiting"] },
    { id: "svelte", name: "Svelte", description: "A compiler that generates minimal JavaScript", pros: ["No virtual DOM overhead", "Less code to write", "Built-in animations"], cons: ["Smallest ecosystem", "Fewer enterprise adoptions", "Limited tooling"] },
  ],
  dimensions: [
    { id: "perf", name: "Performance", description: "Runtime performance and bundle size" },
    { id: "dx", name: "Developer Experience", description: "Ease of learning and daily workflow" },
    { id: "eco", name: "Ecosystem", description: "Libraries, tools, and community support" },
  ],
  comparison: [
    { dimensionId: "perf", ratings: [{ itemId: "react", value: "Good with optimization", score: 7 }, { itemId: "vue", value: "Very good out of the box", score: 8 }, { itemId: "svelte", value: "Excellent — compiled", score: 9 }] },
    { dimensionId: "dx", ratings: [{ itemId: "react", value: "Powerful but complex", score: 7 }, { itemId: "vue", value: "Intuitive and well-documented", score: 9 }, { itemId: "svelte", value: "Simple and elegant", score: 9 }] },
    { dimensionId: "eco", ratings: [{ itemId: "react", value: "Largest ecosystem", score: 10 }, { itemId: "vue", value: "Growing steadily", score: 7 }, { itemId: "svelte", value: "Small but passionate", score: 5 }] },
  ],
};

const mockDecisionData: DecisionTreeData = {
  template: "decision-tree",
  meta: {
    title: "Which Database Should You Use?",
    summary: "A guided decision tree for choosing the right database for your project",
    difficulty: "beginner",
    template: "decision-tree",
  },
  rootId: "start",
  nodes: [
    { id: "start", question: "What type of data are you working with?", description: "The structure of your data is the most important factor in choosing a database.", isLeaf: false },
    { id: "structured", question: "Do you need ACID transactions?", description: "Structured/tabular data with relationships between entities.", isLeaf: false },
    { id: "unstructured", question: "What's your primary access pattern?", description: "Documents, JSON blobs, or flexible schemas.", isLeaf: false },
    { id: "postgres", answer: "PostgreSQL", description: "Battle-tested relational database with excellent ACID compliance, extensions, and JSON support.", isLeaf: true },
    { id: "mysql", answer: "MySQL", description: "Fast, reliable relational database. Great for read-heavy workloads.", isLeaf: true },
    { id: "mongo", answer: "MongoDB", description: "Document database with flexible schemas. Great for rapid prototyping and content management.", isLeaf: true },
    { id: "redis", answer: "Redis", description: "In-memory key-value store. Perfect for caching, sessions, and real-time data.", isLeaf: true },
  ],
  edges: [
    { from: "start", to: "structured", label: "Structured / Relational" },
    { from: "start", to: "unstructured", label: "Flexible / Document-based" },
    { from: "structured", to: "postgres", label: "Yes, strong consistency" },
    { from: "structured", to: "mysql", label: "No, speed matters more" },
    { from: "unstructured", to: "mongo", label: "Complex queries on documents" },
    { from: "unstructured", to: "redis", label: "Key-value lookups, caching" },
  ],
};

const mockTimelineData: TimelineData = {
  template: "timeline",
  meta: {
    title: "History of JavaScript",
    summary: "Key milestones in the evolution of JavaScript from 1995 to today",
    difficulty: "beginner",
    template: "timeline",
  },
  events: [
    { id: "birth", title: "JavaScript Created", date: "1995", description: "Brendan Eich creates JavaScript in 10 days at Netscape.", details: "Originally called Mocha, then LiveScript, finally JavaScript — a marketing decision to ride Java's popularity.", tags: ["milestone"] },
    { id: "es3", title: "ECMAScript 3", date: "1999", description: "First widely-adopted standard. Regular expressions, try/catch, and more.", tags: ["standard"] },
    { id: "jquery", title: "jQuery Released", date: "2006", description: "John Resig releases jQuery, making DOM manipulation accessible to all.", tags: ["library"] },
    { id: "node", title: "Node.js Announced", date: "2009", description: "Ryan Dahl brings JavaScript to the server with V8 engine.", details: "This was the moment JavaScript became a full-stack language. The npm ecosystem would eventually become the largest package registry in the world.", tags: ["runtime", "milestone"] },
    { id: "es6", title: "ES2015 (ES6)", date: "2015", description: "Massive update: arrow functions, classes, modules, promises, template literals.", tags: ["standard", "milestone"] },
    { id: "ts", title: "TypeScript Adoption Surges", date: "2019", description: "TypeScript reaches mass adoption with Angular, React, and Node.js projects.", tags: ["language"] },
  ],
  direction: "vertical",
};

const mockExplorerData: ComponentExplorerData = {
  template: "component-explorer",
  meta: {
    title: "Next.js Application Architecture",
    summary: "How the key components of a Next.js app work together",
    difficulty: "intermediate",
    template: "component-explorer",
  },
  components: [
    { id: "browser", name: "Browser", description: "Client-side rendering and navigation", category: "client", details: "The browser handles client-side routing via Next.js Link component and renders React Server Components streamed from the server." },
    { id: "middleware", name: "Middleware", description: "Edge-level request interception", category: "edge" },
    { id: "router", name: "App Router", description: "File-system based routing with layouts", category: "server", details: "The App Router uses file conventions (page.tsx, layout.tsx, loading.tsx) to define routes and nested layouts." },
    { id: "rsc", name: "React Server Components", description: "Server-rendered components with zero client JS", category: "server" },
    { id: "api", name: "API Routes", description: "Serverless API endpoints", category: "server" },
    { id: "db", name: "Database", description: "PostgreSQL via Prisma or Supabase", category: "data" },
    { id: "cache", name: "Cache Layer", description: "ISR, fetch cache, and React cache", category: "edge" },
  ],
  connections: [
    { from: "browser", to: "middleware", label: "HTTP Request", type: "data" },
    { from: "middleware", to: "router", label: "Forward", type: "control" },
    { from: "router", to: "rsc", label: "Render", type: "control" },
    { from: "router", to: "api", label: "API Call", type: "data" },
    { from: "rsc", to: "db", label: "Query", type: "data" },
    { from: "api", to: "db", label: "Query", type: "data" },
    { from: "cache", to: "rsc", label: "Cached Response", type: "data" },
    { from: "rsc", to: "browser", label: "Stream HTML", type: "data" },
  ],
  categories: [
    { id: "client", name: "Client", color: "#3b82f6" },
    { id: "edge", name: "Edge", color: "#f59e0b" },
    { id: "server", name: "Server", color: "#10b981" },
    { id: "data", name: "Data", color: "#8b5cf6" },
  ],
};

type MockDataType = FlowAnimatorData | CodeWalkthroughData | ConceptBuilderData | CompareContrastData | DecisionTreeData | TimelineData | ComponentExplorerData;

function getMockData(template: TemplateChoice): MockDataType {
  const resolved = template === "auto" ? "flow-animator" : template;
  switch (resolved) {
    case "flow-animator": return mockFlowData;
    case "code-walkthrough": return mockCodeData;
    case "concept-builder": return mockConceptData;
    case "compare-contrast": return mockCompareData;
    case "decision-tree": return mockDecisionData;
    case "timeline": return mockTimelineData;
    case "component-explorer": return mockExplorerData;
  }
}

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
  const [content, setContent] = useState("");
  const [template, setTemplate] = useState<TemplateChoice>("auto");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ExplainerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accentColor, setAccentColor] = useState("#3b82f6");
  const [editMode, setEditMode] = useState(false);

  // Publishing state
  const [publishing, setPublishing] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "embed" | null>(null);

  const handleGenerate = useCallback(
    async (overrideTemplate?: TemplateChoice) => {
      const chosenTemplate = overrideTemplate ?? template;
      const inputContent = content.trim();
      if (!inputContent) return;

      setGenerating(true);
      setResult(null);
      setError(null);
      setPublishedUrl(null);
      setPublishedSlug(null);

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: inputContent, template: chosenTemplate }),
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(errBody.error || `Generation failed (${response.status})`);
        }

        const { data } = await response.json();
        setResult(data);
      } catch (err) {
        console.error("Generation error:", err);
        const mockData = getMockData(chosenTemplate);
        setResult(mockData);
        setError(`AI generation failed — showing example data. ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        setGenerating(false);
      }
    },
    [content, template],
  );

  const handlePublish = async () => {
    if (!result) return;
    setPublishing(true);

    try {
      const response = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: result, sourceContent: content || undefined }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Publishing failed (${response.status})`);
      }

      const { slug, url } = await response.json();
      setPublishedSlug(slug);
      setPublishedUrl(url);
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

  /** Update result data in-memory (for inline editing) */
  const updateResult = useCallback((updater: (data: ExplainerData) => ExplainerData) => {
    setResult((prev) => prev ? updater(prev) : prev);
  }, []);

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

        {/* Error banner */}
        {error && (
          <div className="mb-6 p-4 rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-amber-800 dark:text-amber-200">{error}</p>
              <button onClick={() => setError(null)} className="text-xs text-amber-600 dark:text-amber-400 hover:underline mt-1">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Input section */}
        {!result && (
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
          </div>
        )}

        {/* Result */}
        {result && (
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
                  {!publishedUrl && (
                    <button
                      onClick={handlePublish}
                      disabled={publishing}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 transition-all"
                    >
                      {publishing ? (
                        <><Loader2 size={14} className="animate-spin" />Publishing...</>
                      ) : (
                        <><Share2 size={14} />Publish</>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => { setResult(null); setGenerating(false); setPublishedUrl(null); setPublishedSlug(null); setError(null); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-all"
                  >
                    ← Back to editor
                  </button>
                </div>
              </div>

              {/* Editor controls: color picker, speed toggle, edit mode */}
              <div className="flex items-center gap-4 flex-wrap border border-border rounded-lg px-4 py-2.5 bg-card">
                <ColorThemePicker selected={accentColor} onSelect={setAccentColor} />
                <div className="h-5 w-px bg-border" />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Speed:</span>
                  <SpeedToggle />
                </div>
                <div className="h-5 w-px bg-border" />
                <button
                  onClick={() => setEditMode(!editMode)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    editMode
                      ? "bg-blue-500 text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Pencil size={12} />
                  {editMode ? "Editing" : "Edit"}
                </button>
              </div>

              {generating && (
                <div className="flex items-center justify-center py-24">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 size={32} className="animate-spin text-blue-500" />
                    <p className="text-sm text-muted-foreground">Re-generating with new template...</p>
                  </div>
                </div>
              )}

              {publishedUrl && (
                <div className="p-4 rounded-xl border border-green-500/30 bg-green-50 dark:bg-green-950/20 space-y-3">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">🎉 Published! Your explainer is live:</p>
                  <div className="flex items-center gap-2">
                    <input type="text" readOnly value={publishedUrl} className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-black/20 border border-green-300 dark:border-green-700 text-sm text-foreground font-mono" />
                    <button onClick={() => handleCopy("url")} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 transition-all shrink-0">
                      {copied === "url" ? <Check size={14} /> : <Copy size={14} />}
                      {copied === "url" ? "Copied!" : "Copy URL"}
                    </button>
                  </div>
                  <button onClick={() => handleCopy("embed")} className="flex items-center gap-1 text-xs text-green-700 dark:text-green-300 hover:underline">
                    <Code2 size={12} />
                    {copied === "embed" ? "Embed code copied!" : "Copy embed code"}
                  </button>
                </div>
              )}

              {!generating && renderResult()}
            </div>
          </AnimationSpeedProvider>
        )}
      </div>
    </div>
  );
}
