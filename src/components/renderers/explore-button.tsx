"use client";

import { useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUpRight, Eye } from "lucide-react";
import { useExplore } from "@/components/viewer/explore-context";

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
 * If the node has already been explored (existing child in childrenMap),
 * shows "View ↗" instead and links directly without generating.
 */
export function ExploreButton({
  nodeId,
  nodeTitle,
  nodeDescription,
  className = "",
}: ExploreButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { exploreEnabled, childrenMap } = useExplore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if this node was already explored
  const existingChild = childrenMap[nodeId];

  // Extract slug from pathname /e/[slug]
  const slug = pathname.split("/").at(-1) ?? "";

  const handleExplore = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!exploreEnabled) return;

      // If child already exists, navigate directly
      if (existingChild) {
        router.push(`/e/${existingChild.slug}`);
        return;
      }

      if (isLoading || !slug) return;
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/v1/deep-dive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, nodeId, nodeTitle, nodeDescription }),
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
        setTimeout(() => setError(null), 3000);
      }
    },
    [isLoading, slug, nodeId, nodeTitle, nodeDescription, router, exploreEnabled, existingChild],
  );

  // Hide via CSS instead of unmounting — prevents React tree mismatch crashes
  const hiddenClass = !exploreEnabled && !isLoading ? "!hidden" : "";

  return (
    <span className={hiddenClass}>
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
            {[0, 0.15, 0.3].map((delay, i) => (
              <motion.span
                key={i}
                className="w-1 h-1 rounded-full bg-amber-500 inline-block"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 0.9, repeat: Infinity, delay, ease: "easeInOut" }}
              />
            ))}
          </motion.span>
        ) : existingChild ? (
          <motion.button
            key="view"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleExplore}
            title={`View deep dive: ${existingChild.title}`}
            aria-label={`View ${nodeTitle} deep dive`}
            className={[
              "inline-flex items-center gap-1 rounded-full border font-medium transition-colors cursor-pointer",
              "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25 hover:bg-sky-500/20 hover:border-sky-500/40",
              "opacity-0 group-hover:opacity-100",
              "sm:px-2 sm:py-0.5 sm:text-[11px]",
              "max-sm:opacity-100 max-sm:p-1 max-sm:text-[11px]",
              className,
            ].join(" ")}
          >
            <Eye size={11} className="shrink-0" />
            <span className="hidden sm:inline">View</span>
          </motion.button>
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
              "inline-flex items-center gap-1 rounded-full border font-medium transition-colors cursor-pointer",
              "bg-amber-500/10 text-amber-500 border-amber-500/25 hover:bg-amber-500/20 hover:border-amber-500/40",
              "opacity-0 group-hover:opacity-100",
              "sm:px-2 sm:py-0.5 sm:text-[11px]",
              "max-sm:opacity-100 max-sm:p-1 max-sm:text-[11px]",
              className,
            ].join(" ")}
          >
            <ArrowUpRight size={11} className="shrink-0" />
            <span className="hidden sm:inline">Explore</span>
          </motion.button>
        )}
      </AnimatePresence>
    </span>
  );
}
