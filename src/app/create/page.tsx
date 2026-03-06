"use client";

import { useState } from "react";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { FlowAnimatorData } from "@/lib/schemas/flow";
import type { CodeWalkthroughData } from "@/lib/schemas/code";
import type { ConceptBuilderData } from "@/lib/schemas/concept";

// Lazy-load renderers
import { FlowAnimator, CodeWalkthrough, ConceptBuilder } from "@/components/renderers/renderer-registry";

type TemplateChoice = "auto" | "flow-animator" | "code-walkthrough" | "concept-builder";

// ── Mock data for each template ────────────────────────────────────
const mockFlowData: FlowAnimatorData = {
  template: "flow-animator",
  meta: {
    title: "API Request Flow",
    summary: "How a request flows from client through authentication to the backend service",
    difficulty: "beginner",
    template: "flow-animator",
  },
  nodes: [
    { id: "client", label: "Client App", description: "Sends HTTP request with auth headers", icon: "monitor", details: "The client application packages the user's request with the appropriate authentication headers (JWT token or API key) and sends it to the API Gateway.", codeSnippet: "await fetch('/api/data', {\n  headers: { Authorization: `Bearer ${token}` }\n})" },
    { id: "gateway", label: "API Gateway", description: "Routes and validates requests", icon: "shield", details: "The API Gateway validates the authentication token, applies rate limiting, and routes the request to the appropriate backend service.", codeSnippet: "// Rate limit: 100 req/min per user\n// Auth: JWT validation via JWKS" },
    { id: "auth", label: "Auth Service", description: "Verifies identity and permissions", icon: "key", details: "Validates the JWT token against the JWKS endpoint, checks token expiration, and verifies the user has the required permissions for the requested resource." },
    { id: "service", label: "Backend Service", description: "Processes business logic", icon: "cog", details: "Executes the core business logic, queries the database, and formats the response.", codeSnippet: "const data = await db.query(sql`\n  SELECT * FROM resources\n  WHERE owner_id = ${userId}\n`)" },
    { id: "db", label: "Database", description: "Stores and retrieves data", icon: "database", details: "PostgreSQL database with row-level security policies ensuring data isolation between tenants." },
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
    {
      id: "usage",
      language: "typescript",
      filename: "App.tsx",
      code: `import { useLocalStorage } from './useLocalStorage';

function App() {
  const [theme, setTheme] = useLocalStorage('theme', 'dark');
  const [count, setCount] = useLocalStorage('count', 0);

  return (
    <div>
      <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
        Toggle Theme: {theme}
      </button>
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count}
      </button>
    </div>
  );
}`,
    },
  ],
  annotations: [
    { id: "a1", blockId: "hook", startLine: 3, endLine: 6, label: "Generic Type Signature", explanation: "The hook accepts a generic type T, allowing it to store any serializable value. The return type mirrors useState — a tuple of the current value and a setter function." },
    { id: "a2", blockId: "hook", startLine: 7, endLine: 14, label: "Lazy Initialization", explanation: "useState accepts a function for lazy initialization. This reads from localStorage only once on mount, avoiding unnecessary reads on every render. The try/catch handles cases where localStorage is unavailable or contains invalid JSON." },
    { id: "a3", blockId: "hook", startLine: 16, endLine: 21, label: "Sync to Storage", explanation: "useEffect automatically syncs the state back to localStorage whenever the stored value or key changes. This keeps the persisted value in sync with React state." },
    { id: "a4", blockId: "usage", startLine: 4, endLine: 5, label: "Using the Hook", explanation: "The hook works exactly like useState but persists the value. Each call gets its own independent storage key. The type is inferred from the initial value." },
  ],
  stepOrder: ["a1", "a2", "a3", "a4"],
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
    { id: "perceptron", title: "The Perceptron", description: "A single neuron takes multiple inputs, multiplies each by a weight, sums them up, and passes the result through an activation function. It's like a simple yes/no decision maker.", visualLabel: "f(x) = σ(Σ wᵢxᵢ + b)", icon: "circle" },
    { id: "layer", title: "Hidden Layer", description: "Multiple perceptrons working together form a layer. Each neuron looks at all the inputs and learns different features. One might detect edges, another colors, another textures.", visualLabel: "Layer = [n₁, n₂, ..., nₖ]", icon: "layers" },
    { id: "deep", title: "Deep Network", description: "Stack multiple hidden layers and something magical happens — the network can learn hierarchical features. Early layers learn simple patterns (edges), middle layers combine them (shapes), deep layers recognize complex concepts (faces).", visualLabel: "Input → H₁ → H₂ → ... → Output", icon: "brain" },
    { id: "backprop", title: "Backpropagation", description: "The network learns by comparing its output to the correct answer, calculating the error, and then propagating that error backwards through the network to adjust every weight. This is done using calculus (chain rule) and is repeated thousands of times until the weights converge.", visualLabel: "∂Loss/∂w = ∂Loss/∂a · ∂a/∂z · ∂z/∂w", icon: "refresh-cw", details: "The learning rate controls how big each adjustment is. Too large and you overshoot; too small and learning takes forever. Modern optimizers like Adam adapt the learning rate automatically." },
  ],
};

function getMockData(template: TemplateChoice) {
  const resolved = template === "auto" ? "flow-animator" : template;
  switch (resolved) {
    case "flow-animator": return mockFlowData;
    case "code-walkthrough": return mockCodeData;
    case "concept-builder": return mockConceptData;
  }
}

// ── Template selector ──────────────────────────────────────────────
const templates: { value: TemplateChoice; label: string; desc: string }[] = [
  { value: "auto", label: "✨ Auto-detect", desc: "Let AI choose the best format" },
  { value: "flow-animator", label: "🔀 Flow Diagram", desc: "Animated node diagrams" },
  { value: "code-walkthrough", label: "💻 Code Walkthrough", desc: "Step-through code annotations" },
  { value: "concept-builder", label: "🧠 Concept Explainer", desc: "Progressive layered concepts" },
];

// ── Main Page ──────────────────────────────────────────────────────
export default function CreatePage() {
  const [content, setContent] = useState("");
  const [template, setTemplate] = useState<TemplateChoice>("auto");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<FlowAnimatorData | CodeWalkthroughData | ConceptBuilderData | null>(null);

  const handleGenerate = async () => {
    if (!content.trim()) return;
    setGenerating(true);
    setResult(null);
    // Mock: 2 second delay, then return sample data
    await new Promise((r) => setTimeout(r, 2000));
    setResult(getMockData(template));
    setGenerating(false);
  };

  const renderResult = () => {
    if (!result) return null;
    switch (result.template) {
      case "flow-animator": return <FlowAnimator data={result} />;
      case "code-walkthrough": return <CodeWalkthrough data={result} />;
      case "concept-builder": return <ConceptBuilder data={result} />;
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
              <h3 className="text-sm font-medium text-foreground mb-3">Output format</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {templates.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTemplate(t.value)}
                    className={`
                      p-3 rounded-xl border-2 text-left transition-all
                      ${template === t.value
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                        : "border-border hover:border-blue-300 bg-card"
                      }
                    `}
                  >
                    <div className="text-sm font-medium text-foreground">{t.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
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
            {/* Template switcher */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Template:</span>
              {templates.filter((t) => t.value !== "auto").map((t) => (
                <button
                  key={t.value}
                  onClick={() => setResult(getMockData(t.value))}
                  className={`
                    px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${result.template === t.value
                      ? "bg-blue-500 text-white"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                    }
                  `}
                >
                  {t.label}
                </button>
              ))}
              <button
                onClick={() => { setResult(null); setGenerating(false); }}
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-all"
              >
                ← Back to editor
              </button>
            </div>

            {/* Rendered explainer */}
            {renderResult()}
          </div>
        )}
      </div>
    </div>
  );
}
