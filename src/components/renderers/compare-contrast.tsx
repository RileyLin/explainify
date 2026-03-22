"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import type { CompareContrastData } from "@/lib/schemas/compare";
import { DiagramSettingsProvider, useDiagramSettings } from "@/components/editor/diagram-settings";
import { SettingsBar } from "@/components/editor/settings-bar";
import { ExploreButton } from "./explore-button";

interface CompareContrastProps {
  data: CompareContrastData;
}

export function CompareContrast({ data }: CompareContrastProps) {
  return (
    <DiagramSettingsProvider initialDirection="LR">
      <CompareContrastInner data={data} />
    </DiagramSettingsProvider>
  );
}

function CompareContrastInner({ data }: CompareContrastProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "dimensions">("overview");
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const { settings } = useDiagramSettings();

  // LR = side-by-side (grid), TB = stacked (single column)
  const gridCols = settings.direction === "TB" ? "1fr" : `repeat(${Math.min(data.items.length, 2)}, 1fr)`;

  const colors = [
    { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400", accent: "bg-blue-500" },
    { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", accent: "bg-emerald-500" },
    { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", accent: "bg-amber-500" },
    { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", accent: "bg-purple-500" },
  ];

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

      {/* Settings bar */}
      <div className="flex items-center justify-end">
        <div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg px-2 py-1.5 shadow-sm">
          <SettingsBar features={{ direction: true }} />
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-border pb-1">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === "overview"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Pros & Cons
        </button>
        <button
          onClick={() => setActiveTab("dimensions")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === "dimensions"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Comparison Matrix
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid gap-4"
            style={{ gridTemplateColumns: gridCols }}
          >
            {data.items.map((item, idx) => {
              const color = colors[idx % colors.length];
              const isDimmed = hoveredItemId !== null && hoveredItemId !== item.id;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{
                    opacity: isDimmed ? 0.5 : 1,
                    y: 0,
                  }}
                  transition={{
                    delay: idx * 0.1,
                    opacity: { duration: 0.2 },
                  }}
                  onHoverStart={() => setHoveredItemId(item.id)}
                  onHoverEnd={() => setHoveredItemId(null)}
                  className={`group rounded-xl border ${color.border} ${color.bg} overflow-hidden space-y-0 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:ring-2 focus:ring-indigo-500/30 focus:ring-offset-0 relative`}
                >
                  {/* Hero image — progressive enhancement */}
                  {item.imageUrl ? (
                    <div className="relative" style={{ height: 180 }}>
                      <motion.div
                        initial={{ clipPath: "inset(0 0 100% 0)" }}
                        animate={{ clipPath: "inset(0 0 0% 0)" }}
                        transition={{
                          delay: idx * 0.15,
                          duration: 0.6,
                          ease: "easeOut",
                        }}
                        className="absolute inset-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          style={{ borderRadius: "0.75rem 0.75rem 0 0" }}
                        />
                        {/* Gradient overlay — transparent → card bg color */}
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background:
                              "linear-gradient(to bottom, transparent 40%, rgba(10,12,26,0.85) 100%)",
                            borderRadius: "0.75rem 0.75rem 0 0",
                          }}
                        />
                      </motion.div>
                      {/* Item name overlaid at bottom of image */}
                      <div
                        className="absolute bottom-0 left-0 right-0 px-5 pb-3 z-10"
                      >
                        <h3
                          className={`text-lg font-semibold ${color.text}`}
                          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.7)" }}
                        >
                          {item.name}
                        </h3>
                      </div>
                    </div>
                  ) : null}

                  <div className="p-5 space-y-4 relative">
                    {/* Scan line reveal effect on first render (only when no hero image) */}
                    {!item.imageUrl && (
                      <motion.div
                        className="absolute inset-y-0 w-0.5 bg-indigo-400/40 pointer-events-none"
                        initial={{ left: "-2px", opacity: 0.8 }}
                        animate={{ left: "102%", opacity: 0 }}
                        transition={{ delay: idx * 0.1 + 0.15, duration: 0.55, ease: "easeInOut" }}
                      />
                    )}

                    <div>
                      {/* Only show name/description header when no hero image (hero image shows the name) */}
                      {!item.imageUrl && (
                        <div className="flex items-start justify-between gap-2">
                          <h3 className={`text-lg font-semibold ${color.text}`}>{item.name}</h3>
                          <ExploreButton
                            nodeId={item.id}
                            nodeTitle={item.name}
                            nodeDescription={item.description}
                          />
                        </div>
                      )}
                      {item.imageUrl && (
                        <div className="flex items-start justify-end gap-2">
                          <ExploreButton
                            nodeId={item.id}
                            nodeTitle={item.name}
                            nodeDescription={item.description}
                          />
                        </div>
                      )}
                      <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                    </div>

                    {/* Pros */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                        <ThumbsUp size={12} />
                        Pros
                      </div>
                      <ul className="space-y-1">
                        {item.pros.map((pro, pi) => (
                          <motion.li
                            key={pi}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 + pi * 0.06 }}
                            className="flex items-start gap-2 text-sm text-foreground/80"
                          >
                            <span className="text-emerald-400 mt-0.5 shrink-0">+</span>
                            {pro}
                          </motion.li>
                        ))}
                      </ul>
                    </div>

                    {/* Cons */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-red-400">
                        <ThumbsDown size={12} />
                        Cons
                      </div>
                      <ul className="space-y-1">
                        {item.cons.map((con, ci) => (
                          <motion.li
                            key={ci}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 + ci * 0.06 + 0.2 }}
                            className="flex items-start gap-2 text-sm text-foreground/80"
                          >
                            <span className="text-red-400 mt-0.5 shrink-0">−</span>
                            {con}
                          </motion.li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {activeTab === "dimensions" && (
          <motion.div
            key="dimensions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="overflow-x-auto"
          >
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-muted-foreground font-medium">Dimension</th>
                  {data.items.map((item, idx) => {
                    const color = colors[idx % colors.length];
                    return (
                      <th key={item.id} className={`text-left p-3 font-medium ${color.text}`}>
                        {item.name}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.comparison.map((row, ri) => {
                  const dim = data.dimensions.find((d) => d.id === row.dimensionId);
                  return (
                    <motion.tr
                      key={row.dimensionId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: ri * 0.06 }}
                      className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-3">
                        <div className="font-medium text-foreground">{dim?.name ?? row.dimensionId}</div>
                        {dim?.description && (
                          <div className="text-xs text-muted-foreground mt-0.5">{dim.description}</div>
                        )}
                      </td>
                      {data.items.map((item) => {
                        const rating = row.ratings.find((r) => r.itemId === item.id);
                        return (
                          <td key={item.id} className="p-3 text-foreground/80">
                            {rating ? (
                              <div className="space-y-1">
                                <span>{rating.value}</span>
                                {rating.score !== undefined && (
                                  <div className="flex items-center gap-1.5">
                                    <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                                      <motion.div
                                        className="h-full bg-indigo-500 rounded-full"
                                        initial={{ scaleX: 0 }}
                                        animate={{ scaleX: 1 }}
                                        transition={{
                                          delay: ri * 0.06 + 0.3,
                                          duration: 0.6,
                                          ease: [0.25, 0.46, 0.45, 0.94],
                                        }}
                                        style={{
                                          width: `${(rating.score / 10) * 100}%`,
                                          transformOrigin: "left",
                                        }}
                                      />
                                    </div>
                                    <span className="text-xs text-muted-foreground">{rating.score}/10</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        );
                      })}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
