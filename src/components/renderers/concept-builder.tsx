"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, RotateCcw, Plus } from "lucide-react";
import * as LucideIcons from "lucide-react";
import type { ConceptBuilderData, ConceptLayer } from "@/lib/schemas/concept";

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
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`
        relative border-2 rounded-xl p-5 overflow-hidden
        ${isLatest
          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 shadow-lg shadow-blue-500/10"
          : "border-border bg-card"
        }
      `}
    >
      {/* Background pulse animation on new layer */}
      {isLatest && (
        <motion.div
          initial={{ opacity: 0.3 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute inset-0 bg-blue-400/20 dark:bg-blue-500/15 pointer-events-none rounded-xl"
        />
      )}
      <div className="flex items-start gap-3">
        <div
          className={`
            flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0
            ${isLatest ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"}
          `}
        >
          {Icon ? <Icon size={16} /> : index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-foreground">{layer.title}</h3>
            {layer.visualLabel && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {layer.visualLabel}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{layer.description}</p>
          {layer.details && (
            <p className="text-xs text-muted-foreground/70 mt-2 leading-relaxed">{layer.details}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Connector() {
  return (
    <div className="flex justify-center py-1">
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 32, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="w-0.5 bg-border relative"
      >
        <ChevronDown size={14} className="absolute -bottom-1.5 -left-[5.5px] text-muted-foreground" />
      </motion.div>
    </div>
  );
}

function ProgressDots({ total, visible }: { total: number; visible: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`
            w-2.5 h-2.5 rounded-full transition-all duration-300
            ${i < visible
              ? i === visible - 1
                ? "bg-blue-500 scale-125"
                : "bg-blue-500/50"
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
          <button
            onClick={() => setVisibleCount((v) => v + 1)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-500 text-white font-medium text-sm hover:bg-blue-600 transition-colors shadow-lg shadow-blue-500/25"
          >
            <Plus size={16} />
            Add complexity
          </button>
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
