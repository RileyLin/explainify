"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface DeepDiveChapterArtProps {
  /** The chapter illustration URL */
  imageUrl: string;
  /** Title of the current deep-dive explainer */
  title: string;
  /**
   * Depth of this deep dive in the breadcrumb chain.
   * depth=1 → has parent but no grandparent (larger art, 240px)
   * depth=2+ → has grandparent (smaller art, 160px)
   */
  depth: number;
  className?: string;
}

/**
 * DeepDiveChapterArt — banner illustration shown at the top of deep-dive explainers.
 *
 * Sits ABOVE the breadcrumb navigation. Has a gradient fade at the bottom
 * that blends into the page background. The breadcrumb nav overlays the
 * bottom portion of the art.
 *
 * - depth=1: 240px height, more abstract/wide feel
 * - depth=2+: 160px height, more focused/zoomed feel
 *
 * Design: VizBrief dark brand (navy/charcoal) with indigo/blue/cyan accents.
 * Feels like a book chapter illustration, not a stock photo banner.
 */
export function DeepDiveChapterArt({
  imageUrl,
  title,
  depth,
  className,
}: DeepDiveChapterArtProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // depth=1 → 240px; depth=2+ → 160px
  const artHeight = depth <= 1 ? 240 : 160;

  if (errored) return null;

  return (
    <div
      className={cn("relative w-full overflow-hidden", className)}
      style={{ height: artHeight }}
      aria-hidden="true"
    >
      {/* Background shimmer while loading */}
      {!loaded && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(15,23,42,0.6) 50%, rgba(6,182,212,0.06) 100%)",
          }}
        />
      )}

      {/* Chapter illustration */}
      <motion.img
        src={imageUrl}
        alt={`Chapter illustration for "${title}"`}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        initial={{ opacity: 0, scale: 1.04 }}
        animate={loaded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.04 }}
        transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          // Very subtle tint overlay baked into the image layer
          // Keeps dark brand feel even for bright images
          filter: "brightness(0.75) saturate(0.9)",
        }}
      />

      {/* Depth-indicator accent line at top */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background:
            depth <= 1
              ? "linear-gradient(90deg, transparent 0%, #6366f1 20%, #3b82f6 60%, #06b6d4 80%, transparent 100%)"
              : "linear-gradient(90deg, transparent 0%, #3b82f6 30%, #06b6d4 70%, transparent 100%)",
          opacity: 0.7,
        }}
      />

      {/* Gradient fade at the bottom — blends into page background */}
      {/* This is what lets the breadcrumb nav "float" above the art */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: depth <= 1 ? "70%" : "60%",
          background:
            "linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background) / 0.85) 30%, transparent 100%)",
        }}
      />

      {/* Subtle side vignette for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 100% 100% at 50% 50%, transparent 40%, hsl(var(--background) / 0.5) 100%)",
        }}
      />

      {/* Depth label — subtle visual indicator of nesting level */}
      <div
        className="absolute bottom-3 right-4 flex items-center gap-1.5"
        style={{ opacity: loaded ? 0.55 : 0 }}
      >
        {Array.from({ length: Math.min(depth, 5) }).map((_, i) => (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: i === depth - 1 ? 6 : 4,
              height: i === depth - 1 ? 6 : 4,
              background:
                i === depth - 1 ? "#6366f1" : "rgba(148,163,184,0.4)",
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
