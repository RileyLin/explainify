"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Eye, Trash2, ExternalLink, Sparkles } from "lucide-react";
import type { ExplainerRow } from "@/lib/db";

const templateLabels: Record<string, string> = {
  "flow-animator": "🔀 Flow Diagram",
  "code-walkthrough": "💻 Code Walkthrough",
  "concept-builder": "🧠 Concept",
  "compare-contrast": "⚖️ Compare",
  "decision-tree": "🌳 Decision Tree",
  "timeline": "📅 Timeline",
  "component-explorer": "🏗️ Explorer",
};

interface DashboardClientProps {
  explainers: ExplainerRow[];
  userId: string;
}

export function DashboardClient({ explainers: initial, userId }: DashboardClientProps) {
  const [explainers, setExplainers] = useState(initial);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this explainer? This cannot be undone.")) return;
    setDeleting(id);

    try {
      const response = await fetch(`/api/explainers/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setExplainers((prev) => prev.filter((e) => e.id !== id));
      }
    } catch {
      // ignore
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Explainers</h1>
            <p className="text-sm text-muted-foreground">
              {explainers.length} explainer{explainers.length !== 1 ? "s" : ""} created
            </p>
          </div>
          <Link
            href="/create"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            <Plus size={16} />
            New Explainer
          </Link>
        </div>

        {explainers.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <Sparkles size={48} className="text-muted-foreground/30 mx-auto" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">No explainers yet</h2>
              <p className="text-muted-foreground mt-1">
                Create your first interactive explainer in seconds
              </p>
            </div>
            <Link
              href="/create"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors"
            >
              <Plus size={18} />
              Create your first one!
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {explainers.map((explainer) => (
              <div
                key={explainer.id}
                className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-blue-500/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground truncate">
                      {explainer.title}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                      {templateLabels[explainer.template] || explainer.template}
                    </span>
                  </div>
                  {explainer.summary && (
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">
                      {explainer.summary}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>{formatDate(explainer.created_at)}</span>
                    <span className="flex items-center gap-1">
                      <Eye size={12} />
                      {explainer.views} views
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Link
                    href={`/e/${explainer.slug}`}
                    className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title="View"
                  >
                    <ExternalLink size={16} />
                  </Link>
                  <button
                    onClick={() => handleDelete(explainer.id)}
                    disabled={deleting === explainer.id}
                    className="p-2 rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-400 disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
