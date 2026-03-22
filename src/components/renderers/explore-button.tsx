"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUpRight } from "lucide-react";

interface ExploreButtonProps {
  /** The node ID that was clicked */
  nodeId: string;
  /** Short title of the node */
  nodeTitle: string;
  /** Description/details of the node */
  nodeDescription: string;
  /** Additional class for positioning */
  className?: string;
}

/**
 * Amber "Explore ↗" button that appears on hover over any node.
 * Calls POST /api/v1/deep-dive and navigates to the new explainer.
 *
 * Desktop: only visible on group-hover (parent must have `group` class).
 * Mobile: always visible as icon-only button.
 */
export function ExploreButton({
  nodeId,
  nodeTitle,
  nodeDescription,
  className = "",
}: ExploreButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extract slug from pathname /e/[slug]
  const slug = pathname.split("/").at(-1) ?? "";

  const handleExplore = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation(); // Don't trigger parent node click handlers
      if (isLoading || !slug) return;
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/v1/deep-dive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug,
            nodeId,
            nodeTitle,
            nodeDescription,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        const { url } = await res.json();
        router.push(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to generate deep dive";
        setError(msg);
        setIsLoading(false);
        // Auto-clear error after 3s
        setTimeout(() => setError(null), 3000);
      }
    },
    [isLoading, slug, nodeId, nodeTitle, nodeDescription, router],
  );

  return (
    <AnimatePresence mode="wait">
      {error ? (
        <motion.span
          key="error"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/15 text-red-500 border border-red-500/20 ${className}`}
        >
          {error.slice(0, 40)}
        </motion.span>
      ) : isLoading ? (
        <motion.span
          key="loading"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-500 border border-amber-500/20 ${className}`}
          aria-label="Generating deep dive…"
        >
          {/* Pulsing dots */}
          {[0, 0.15, 0.3].map((delay, i) => (
            <motion.span
              key={i}
              className="w-1 h-1 rounded-full bg-amber-500 inline-block"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
              transition={{
                duration: 0.9,
                repeat: Infinity,
                delay,
                ease: "easeInOut",
              }}
            />
          ))}
        </motion.span>
      ) : (
        <motion.button
          key="idle"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleExplore}
          title={`Deep dive into "${nodeTitle}"`}
          aria-label={`Explore ${nodeTitle} in depth`}
          className={[
            // Base styles
            "inline-flex items-center gap-1 rounded-full border font-medium transition-colors cursor-pointer",
            // Color: amber-500
            "bg-amber-500/10 text-amber-500 border-amber-500/25 hover:bg-amber-500/20 hover:border-amber-500/40",
            // Desktop: hidden until group-hover; Mobile: always visible but icon-only
            "opacity-0 group-hover:opacity-100",
            "sm:px-2 sm:py-0.5 sm:text-[11px]",
            // Mobile: smaller, always visible
            "max-sm:opacity-100 max-sm:p-1 max-sm:text-[11px]",
            className,
          ].join(" ")}
        >
          {/* Icon shown on all sizes */}
          <ArrowUpRight size={11} className="shrink-0" />
          {/* Text hidden on mobile */}
          <span className="hidden sm:inline">Explore</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
