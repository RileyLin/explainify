"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, RotateCcw, Plus } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { ConceptBuilderData, ConceptLayer } from "@/lib/schemas/concept";
import { ExploreButton } from "./explore-button";
import { TopicIllustration } from "@/components/illustrations";

function getIcon(name?: string) {
  if (!name) return null;
  const pascalName = name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("") as keyof typeof LucideIcons;
  const Icon = LucideIcons[pascalName];
  if (typeof Icon === "function") return Icon as React.ComponentType<{ className?: string; size?: number }>;
  return null;
}

function LayerCard({ layer, index, isLatest }: { layer: ConceptLayer; index: number; isLatest: boolean }) {
  const Icon = getIcon(layer.icon);
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95, rotateX: 4 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 280, damping: 28 }}
      whileHover={{
        y: -4,
        boxShadow: isLatest
          ? "0 8px 30px rgba(99,102,241,0.2)"
          : "0 8px 30px rgba(99,102,241,0.1)",
      }}
      className={`
        group relative border-2 rounded-xl p-5 overflow-hidden cursor-pointer
        transition-all duration-200
        focus:ring-2 focus:ring-indigo-500/30 focus:ring-offset-0
        ${isLatest
          ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-lg shadow-indigo-500/10"
          : "border-border bg-card hover:shadow-lg"
        }
      `}
      style={{ perspective: "800px" }}
    >
      {/* Background pulse animation on new layer */}
      {isLatest && (
        <motion.div
          initial={{ opacity: 0.3 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="absolute inset-0 bg-indigo-400/20 dark:bg-indigo-500/15 pointer-events-none rounded-xl"
        />
      )}

      <div className="flex items-start gap-3">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.05, type: "spring", stiffness: 400, damping: 20 }}
          className={`
            flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0
            ${isLatest ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground"}
          `}
        >
          {Icon ? <Icon size={16} /> : index + 1}
        </motion.div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3">
            {layer.tags && (
              <TopicIllustration
                tags={layer.tags}
                className="!w-12 !h-12 shrink-0 rounded-md !p-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-foreground">{layer.title}</h3>
                {layer.visualLabel && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {layer.visualLabel}
                  </span>
                )}
                <ExploreButton
                  nodeId={layer.id}
                  nodeTitle={layer.title}
                  nodeDescription={layer.description}
                  className="ml-auto"
                />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{layer.description}</p>
              {layer.details && (
                <p className="text-xs text-muted-foreground/70 mt-2 leading-relaxed">{layer.details}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center py-1">
      <motion.div
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-0.5 bg-border relative overflow-visible"
        style={{ height: 32, transformOrigin: "top" }}
      >
        {/* Travelling dot along the connector */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-indigo-400"
          initial={{ top: 0, opacity: 0 }}
          animate={{ top: "100%", opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.6, ease: "easeIn", delay: 0.1 }}
        />
        <ChevronDown size={14} className="absolute -bottom-1.5 -left-[5.5px] text-muted-foreground" />
      </motion.div>
    </div>
  );
}

function ProgressDots({ total, visible }: { total: number; visible: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            scale: i < visible ? (i === visible - 1 ? 1.3 : 1) : 1,
            backgroundColor: i < visible ? "#6366f1" : undefined,
          }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
          className={`
            w-2.5 h-2.5 rounded-full transition-all duration-300
            ${i < visible
              ? i === visible - 1
                ? "bg-indigo-500 scale-125"
                : "bg-indigo-500/50"
              : "bg-muted"
            }
          `}
        />
      ))}
    </div>
  );
}

export function ConceptBuilder({ data }: { data: ConceptBuilderData }) {
  const [visibleCount, setVisibleCount] = useState(1);
  const allRevealed = visibleCount >= data.layers.length;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-foreground">{data.meta.title}</h2>
        <p className="text-muted-foreground mt-1">{data.meta.summary}</p>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <ProgressDots total={data.layers.length} visible={visibleCount} />
      </div>

      {/* Layers */}
      <div className="max-w-2xl mx-auto">
        <AnimatePresence>
          {data.layers.slice(0, visibleCount).map((layer, i) => (
            <div key={layer.id}>
              {i > 0 && <Connector />}
              <LayerCard layer={layer} index={i} isLatest={i === visibleCount - 1} />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 mt-6">
        {!allRevealed ? (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setVisibleCount((v) => v + 1)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-500 text-white font-medium text-sm hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-500/25"
          >
            <Plus size={16} />
            Add complexity
          </motion.button>
        ) : (
          <span className="text-sm text-muted-foreground">All layers revealed ✓</span>
        )}
        {visibleCount > 1 && (
          <button
            onClick={() => setVisibleCount(1)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
