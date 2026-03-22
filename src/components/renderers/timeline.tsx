"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Clock } from "lucide-react";
import type { TimelineData } from "@/lib/schemas/timeline";
import { DiagramSettingsProvider, useDiagramSettings } from "@/components/editor/diagram-settings";
import { SettingsBar } from "@/components/editor/settings-bar";
import { ExploreButton } from "./explore-button";
import { DynamicIllustration } from "@/components/illustrations";

interface TimelineProps {
  data: TimelineData;
}

const tagColors = [
  "bg-blue-500/20 text-blue-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-amber-500/20 text-amber-300",
  "bg-purple-500/20 text-purple-300",
  "bg-pink-500/20 text-pink-300",
  "bg-cyan-500/20 text-cyan-300",
];

function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return tagColors[Math.abs(hash) % tagColors.length];
}

export function Timeline({ data }: TimelineProps) {
  return (
    <DiagramSettingsProvider>
      <TimelineInner data={data} />
    </DiagramSettingsProvider>
  );
}

function TimelineInner({ data }: TimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { settings } = useDiagramSettings();

  const isCompact = settings.density === "compact";
  const isSpread = settings.density === "spread";

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-foreground">{data.meta.title}</h2>
        <p className="text-muted-foreground">{data.meta.summary}</p>
        <div className="flex items-center gap-2">
          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
            {data.meta.difficulty}
          </span>
          <span className="text-xs text-muted-foreground">
            {data.events.length} events
          </span>
        </div>
      </div>

      {/* Settings bar */}
      <div className="flex items-center justify-end">
        <div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg px-2 py-1.5 shadow-sm">
          <SettingsBar features={{ density: true }} />
        </div>
      </div>

      {/* Progress indicator — dots with shimmer on active */}
      <div className="flex items-center gap-1.5 relative">
        {data.events.map((event, idx) => (
          <motion.div
            key={event.id}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: idx * 0.05, type: "spring", stiffness: 400, damping: 20 }}
            className={`h-1.5 flex-1 rounded-full relative overflow-hidden transition-colors duration-300 ${
              expandedId === event.id ? "bg-indigo-500" : "bg-muted"
            }`}
          >
            {/* Shimmer sweep on active segment */}
            {expandedId === event.id && (
              <motion.div
                className="absolute inset-y-0 w-6 bg-white/50 rounded-full blur-[2px]"
                initial={{ x: "-100%" }}
                animate={{ x: "200%" }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.4 }}
              />
            )}
          </motion.div>
        ))}
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Static background vertical line */}
        <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-border" />

        <div className="space-y-1">
          {data.events.map((event, idx) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08, duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
              className="relative flex gap-4"
            >
              {/* Dot + animated connecting line below */}
              <div className="relative z-10 flex flex-col items-center">
                {/* The dot */}
                <div className="relative">
                  <motion.div
                    whileHover={{ scale: 1.25 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-colors focus:ring-2 focus:ring-indigo-500/30 focus:ring-offset-0 ${
                      expandedId === event.id
                        ? "bg-indigo-500 text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    onClick={() => toggleExpand(event.id)}
                  >
                    <span className="text-xs font-bold">{idx + 1}</span>
                  </motion.div>

                  {/* Pulse ring when expanded */}
                  {expandedId === event.id && (
                    <motion.div
                      className="absolute inset-0 rounded-full pointer-events-none"
                      style={{ border: "2px solid rgba(99,102,241,0.6)" }}
                      animate={{
                        scale: [1, 1.8, 2.2],
                        opacity: [0.4, 0.15, 0],
                      }}
                      transition={{
                        duration: 1.4,
                        repeat: Infinity,
                        ease: "easeOut",
                      }}
                    />
                  )}
                </div>

                {/* Animated connector line that draws downward */}
                {idx < data.events.length - 1 && (
                  <motion.div
                    className="w-0.5 bg-indigo-500/30 mt-1"
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{
                      delay: idx * 0.08 + 0.25,
                      duration: 0.3,
                      ease: "easeOut",
                    }}
                    style={{
                      transformOrigin: "top",
                      height: isCompact ? 24 : isSpread ? 72 : 40,
                    }}
                  />
                )}
              </div>

              {/* Content */}
              <div
                className={`group relative flex-1 ${isCompact ? "pb-2" : isSpread ? "pb-10" : "pb-6"} rounded-xl transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg focus:ring-2 focus:ring-indigo-500/30 focus:ring-offset-0`}
                onClick={() => toggleExpand(event.id)}
              >
                {/* Date/Period badge */}
                {(event.date || event.period) && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Clock size={10} />
                    <span>{event.date || event.period}</span>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  {/* Inline topic illustration — always visible */}
                  {event.tags && event.tags.length > 0 && (
                    <DynamicIllustration
                      svgString={event.illustrationSvg}
                      tags={event.tags}
                      className="!w-12 !h-12 shrink-0 rounded-md !p-0 mt-0.5"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-foreground">{event.title}</h3>
                      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                        <ExploreButton
                          nodeId={event.id}
                          nodeTitle={event.title}
                          nodeDescription={event.description}
                        />
                        {event.details && !isCompact && (
                          <motion.div
                            animate={{ rotate: expandedId === event.id ? 180 : 0 }}
                            transition={{ duration: 0.2 }}
                            className="text-muted-foreground"
                          >
                            <ChevronDown size={16} />
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description hidden in compact mode */}
                {!isCompact && (
                  <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                )}

                {/* Tags */}
                {event.tags && event.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {event.tags.map((tag, tagIdx) => (
                      <motion.span
                        key={tag}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.08 + tagIdx * 0.04 + 0.1 }}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTagColor(tag)}`}
                      >
                        {tag}
                      </motion.span>
                    ))}
                  </div>
                )}

                {/* Expanded details */}
                {!isCompact && (
                  <AnimatePresence>
                    {expandedId === event.id && event.details && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border/50 text-sm text-foreground/80 leading-relaxed">
                          {event.details}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
