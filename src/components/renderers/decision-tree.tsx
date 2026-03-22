"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, RotateCcw, ChevronLeft, CheckCircle2, HelpCircle } from "lucide-react";
import type { DecisionTreeData, DecisionNode, DecisionEdge } from "@/lib/schemas/decision";
import { ExploreButton } from "./explore-button";

interface DecisionTreeProps {
  data: DecisionTreeData;
}

export function DecisionTree({ data }: DecisionTreeProps) {
  const [path, setPath] = useState<string[]>([data.rootId]);
  const currentNodeId = path[path.length - 1];
  const currentNode = data.nodes.find((n) => n.id === currentNodeId);

  // Get edges from current node
  const outEdges = data.edges.filter((e) => e.from === currentNodeId);

  const handleChoice = useCallback(
    (targetId: string) => {
      setPath((prev) => [...prev, targetId]);
    },
    [],
  );

  const handleBack = useCallback(() => {
    setPath((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const handleReset = useCallback(() => {
    setPath([data.rootId]);
  }, [data.rootId]);

  if (!currentNode) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Invalid decision tree: node not found
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">{data.meta.title}</h2>
        <p className="text-muted-foreground">{data.meta.summary}</p>
        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
          {data.meta.difficulty}
        </span>
      </div>

      {/* Path breadcrumb */}
      {path.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
          {path.map((nodeId, idx) => {
            const node = data.nodes.find((n) => n.id === nodeId);
            const edge = idx > 0 ? data.edges.find((e) => e.from === path[idx - 1] && e.to === nodeId) : null;
            return (
              <span key={nodeId} className="flex items-center gap-1.5">
                {idx > 0 && (
                  <span className="text-blue-400 font-medium">→ {edge?.label}</span>
                )}
                <span
                  className={`px-2 py-0.5 rounded ${
                    idx === path.length - 1
                      ? "bg-blue-500/20 text-blue-400 font-medium"
                      : "bg-muted"
                  }`}
                >
                  {node?.question?.slice(0, 30) || node?.answer?.slice(0, 30) || nodeId}
                  {((node?.question?.length ?? 0) > 30 || (node?.answer?.length ?? 0) > 30) && "…"}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* Current node */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentNodeId}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.25 }}
          className={`group rounded-xl border p-6 space-y-4 ${
            currentNode.isLeaf
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-border bg-card"
          }`}
        >
          {/* Icon and question/answer */}
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                currentNode.isLeaf ? "bg-emerald-500/20" : "bg-blue-500/20"
              }`}
            >
              {currentNode.isLeaf ? (
                <CheckCircle2 size={20} className="text-emerald-400" />
              ) : (
                <HelpCircle size={20} className="text-blue-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  {currentNode.question && (
                    <h3 className="text-lg font-semibold text-foreground">{currentNode.question}</h3>
                  )}
                  {currentNode.answer && (
                    <h3 className="text-lg font-semibold text-emerald-400">{currentNode.answer}</h3>
                  )}
                </div>
                <ExploreButton
                  nodeId={currentNode.id}
                  nodeTitle={currentNode.question ?? currentNode.answer ?? currentNode.id}
                  nodeDescription={currentNode.description}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-1">{currentNode.description}</p>
            </div>
          </div>

          {/* Choices (non-leaf) */}
          {!currentNode.isLeaf && outEdges.length > 0 && (
            <div className="space-y-2 pt-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Choose an option:
              </p>
              <div className="grid gap-2">
                {outEdges.map((edge, idx) => (
                  <motion.button
                    key={edge.to}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    onClick={() => handleChoice(edge.to)}
                    className="flex items-center justify-between w-full px-4 py-3 rounded-lg border border-border bg-muted/30 hover:bg-muted hover:border-blue-500/30 text-sm text-foreground transition-all group text-left"
                  >
                    <span>{edge.label}</span>
                    <ArrowRight
                      size={16}
                      className="text-muted-foreground group-hover:text-blue-400 transition-colors shrink-0 ml-2"
                    />
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* Leaf — recommendation */}
          {currentNode.isLeaf && (
            <div className="pt-2">
              <div className="text-xs text-emerald-400 font-medium uppercase tracking-wider mb-2">
                ✓ Recommendation
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center gap-2">
        {path.length > 1 && (
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={14} />
            Back
          </button>
        )}
        {path.length > 1 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw size={14} />
            Start Over
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Step {path.length} of {data.nodes.length}
        </span>
      </div>
    </div>
  );
}
