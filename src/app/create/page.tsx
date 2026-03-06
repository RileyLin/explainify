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
} from "lucide-react";
import Link from "next/link";
import type { ExplainerData } from "@/lib/schemas/base";
import type { FlowAnimatorData } from "@/lib/schemas/flow";
import type { CodeWalkthroughData } from "@/lib/schemas/code";
import type { ConceptBuilderData } from "@/lib/schemas/concept";

// Lazy-load renderers
import {
  FlowAnimator,
  CodeWalkthrough,
  ConceptBuilder,
} from "@/components/renderers/renderer-registry";

type TemplateChoice = "auto" | "flow-animator" | "code-walkthrough" | "concept-builder";

// ── Mock data fallbacks ────────────────────────────────────────────
const mockFlowData: FlowAnimatorData = {
  template: "flow-animator",
  meta: {
    title: "API Request Flow",
    summary:
      "How a request flows from client through authentication to the backend service",
    difficulty: "beginner",
    template: "flow-animator",
  },
  nodes: [
    {
      id: "client",
      label: "Client App",
      description: "Sends HTTP request with auth headers",
      icon: "monitor",
      details:
        "The client application packages the user's request with the appropriate authentication headers (JWT token or API key) and sends it to the API Gateway.",
      codeSnippet:
        "await fetch('/api/data', {\n  headers: { Authorization: `Bearer ${token}` }\n})",
    },
    {
      id: "gateway",
      label: "API Gateway",
      description: "Routes and validates requests",
      icon: "shield",
      details:
        "The API Gateway validates the authentication token, applies rate limiting, and routes the request to the appropriate backend service.",
    },
    {
      id: "auth",
      label: "Auth Service",
      description: "Verifies identity and permissions",
      icon: "key",
      details:
        "Validates the JWT token against the JWKS endpoint, checks token expiration, and verifies the user has the required permissions.",
    },
    {
      id: "service",
      label: "Backend Service",
      description: "Processes business logic",
      icon: "cog",
      details:
        "Executes the core business logic, queries the database, and formats the response.",
    },
    {
      id: "db",
      label: "Database",
      description: "Stores and retrieves data",
      icon: "database",
      details:
        "PostgreSQL database with row-level security policies ensuring data isolation between tenants.",
    },
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
      code: `import { useState, useEffect } from 'react';

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(\`Error reading localStorage key "\${key}":\`, error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.warn(\`Error setting localStorage key "\${key}":\`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}`,
    },
  ],
  annotations: [
    {
      id: "a1",
      blockId: "hook",
      startLine: 3,
      endLine: 6,
      label: "Generic Type Signature",
      explanation:
        "The hook accepts a generic type T, allowing it to store any serializable value. The return type mirrors useState.",
    },
    {
      id: "a2",
      blockId: "hook",
      startLine: 7,
      endLine: 14,
      label: "Lazy Initialization",
      explanation:
        "useState accepts a function for lazy initialization. This reads from localStorage only once on mount.",
    },
    {
      id: "a3",
      blockId: "hook",
      startLine: 16,
      endLine: 21,
      label: "Sync to Storage",
      explanation:
        "useEffect automatically syncs the state back to localStorage whenever the stored value or key changes.",
    },
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
    {
      id: "perceptron",
      title: "The Perceptron",
      description:
        "A single neuron takes inputs, multiplies by weights, sums, and activates. It's a simple yes/no decision maker.",
      visualLabel: "f(x) = σ(Σ wᵢxᵢ + b)",
      icon: "circle",
    },
    {
      id: "layer",
      title: "Hidden Layer",
      description:
        "Multiple perceptrons form a layer. Each neuron learns different features.",
      visualLabel: "Layer = [n₁, n₂, ..., nₖ]",
      icon: "layers",
    },
    {
      id: "deep",
      title: "Deep Network",
      description:
        "Stacked layers learn hierarchical features — edges → shapes → concepts.",
      visualLabel: "Input → H₁ → H₂ → ... → Output",
      icon: "brain",
    },
    {
      id: "backprop",
      title: "Backpropagation",
      description:
        "Compare output to answer, calculate error, propagate backwards adjusting weights via chain rule.",
      visualLabel: "∂Loss/∂w = ∂Loss/∂a · ∂a/∂z · ∂z/∂w",
      icon: "refresh-cw",
    },
  ],
};

function getMockData(
  template: TemplateChoice,
): FlowAnimatorData | CodeWalkthroughData | ConceptBuilderData {
  const resolved = template === "auto" ? "flow-animator" : template;
  switch (resolved) {
    case "flow-animator":
      return mockFlowData;
    case "code-walkthrough":
      return mockCodeData;
    case "concept-builder":
      return mockConceptData;
  }
}

// ── Template selector ──────────────────────────────────────────────
const templates: { value: TemplateChoice; label: string; desc: string }[] = [
  {
    value: "auto",
    label: "✨ Auto-detect",
    desc: "Let AI choose the best format",
  },
  {
    value: "flow-animator",
    label: "🔀 Flow Diagram",
    desc: "Animated node diagrams",
  },
  {
    value: "code-walkthrough",
    label: "💻 Code Walkthrough",
    desc: "Step-through code annotations",
  },
  {
    value: "concept-builder",
    label: "🧠 Concept Explainer",
    desc: "Progressive layered concepts",
  },
];

// ── Main Page ──────────────────────────────────────────────────────
export default function CreatePage() {
  const [content, setContent] = useState("");
  const [template, setTemplate] = useState<TemplateChoice>("auto");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ExplainerData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          body: JSON.stringify({
            content: inputContent,
            template: chosenTemplate,
          }),
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(
            errBody.error || `Generation failed (${response.status})`,
          );
        }

        const { data } = await response.json();
        setResult(data);
      } catch (err) {
        console.error("Generation error:", err);
        // Fall back to mock data
        const mockData = getMockData(chosenTemplate);
        setResult(mockData);
        setError(
          `AI generation failed — showing example data. ${err instanceof Error ? err.message : "Unknown error"}`,
        );
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
        body: JSON.stringify({
          data: result,
          sourceContent: content || undefined,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(
          errBody.error || `Publishing failed (${response.status})`,
        );
      }

      const { slug, url } = await response.json();
      setPublishedSlug(slug);
      setPublishedUrl(url);
    } catch (err) {
      setError(
        `Publishing failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
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
    // Re-generate with the new template
    handleGenerate(newTemplate);
  };

  const renderResult = () => {
    if (!result) return null;
    switch (result.template) {
      case "flow-animator":
        return <FlowAnimator data={result} />;
      case "code-walkthrough":
        return <CodeWalkthrough data={result} />;
      case "concept-builder":
        return <ConceptBuilder data={result} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Create Explainer
            </h1>
            <p className="text-sm text-muted-foreground">
              Paste your content and let AI transform it
            </p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 p-4 rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 flex items-start gap-3">
            <AlertCircle
              size={18}
              className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
            />
            <div>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {error}
              </p>
              <button
                onClick={() => setError(null)}
                className="text-xs text-amber-600 dark:text-amber-400 hover:underline mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Input section */}
        {!result && (
          <div className="space-y-6">
            {/* Textarea */}
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

            {/* Template selector */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">
                Output format
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {templates.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTemplate(t.value)}
                    className={`
                      p-3 rounded-xl border-2 text-left transition-all
                      ${
                        template === t.value
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                          : "border-border hover:border-blue-300 bg-card"
                      }
                    `}
                  >
                    <div className="text-sm font-medium text-foreground">
                      {t.label}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {t.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button */}
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
          <div className="space-y-6">
            {/* Template switcher + actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Template:</span>
              {templates
                .filter((t) => t.value !== "auto")
                .map((t) => (
                  <button
                    key={t.value}
                    onClick={() => handleTemplateSwitch(t.value)}
                    disabled={generating}
                    className={`
                    px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${
                      result.template === t.value
                        ? "bg-blue-500 text-white"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }
                    ${generating ? "opacity-50 cursor-not-allowed" : ""}
                  `}
                  >
                    {t.label}
                  </button>
                ))}

              <div className="ml-auto flex items-center gap-2">
                {/* Publish button */}
                {!publishedUrl && (
                  <button
                    onClick={handlePublish}
                    disabled={publishing}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 transition-all"
                  >
                    {publishing ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Publishing...
                      </>
                    ) : (
                      <>
                        <Share2 size={14} />
                        Publish
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={() => {
                    setResult(null);
                    setGenerating(false);
                    setPublishedUrl(null);
                    setPublishedSlug(null);
                    setError(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-all"
                >
                  ← Back to editor
                </button>
              </div>
            </div>

            {/* Loading overlay */}
            {generating && (
              <div className="flex items-center justify-center py-24">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={32} className="animate-spin text-blue-500" />
                  <p className="text-sm text-muted-foreground">
                    Re-generating with new template...
                  </p>
                </div>
              </div>
            )}

            {/* Published URL section */}
            {publishedUrl && (
              <div className="p-4 rounded-xl border border-green-500/30 bg-green-50 dark:bg-green-950/20 space-y-3">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  🎉 Published! Your explainer is live:
                </p>

                {/* URL */}
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
                    {copied === "url" ? (
                      <Check size={14} />
                    ) : (
                      <Copy size={14} />
                    )}
                    {copied === "url" ? "Copied!" : "Copy URL"}
                  </button>
                </div>

                {/* Embed code */}
                <div>
                  <button
                    onClick={() => handleCopy("embed")}
                    className="flex items-center gap-1 text-xs text-green-700 dark:text-green-300 hover:underline"
                  >
                    <Code2 size={12} />
                    {copied === "embed"
                      ? "Embed code copied!"
                      : "Copy embed code"}
                  </button>
                </div>
              </div>
            )}

            {/* Rendered explainer */}
            {!generating && renderResult()}
          </div>
        )}
      </div>
    </div>
  );
}
