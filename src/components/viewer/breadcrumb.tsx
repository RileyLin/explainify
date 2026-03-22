"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ChevronRight, Home } from "lucide-react";

export interface BreadcrumbSegment {
  /** Display label */
  label: string;
  /** URL slug — if provided, segment is clickable */
  slug?: string;
}

interface BreadcrumbProps {
  /** Ordered list of segments from root → current */
  segments: BreadcrumbSegment[];
  appUrl?: string;
}

/**
 * Sticky breadcrumb navigation shown when an explainer has a parent.
 * Only renders when there are 2+ segments (i.e., we're on a deep dive).
 *
 * Shows: ← Parent / Node Name / Current Title
 * Stone-50 background, text-xs, border-bottom stone-200 as per design spec.
 */
export function Breadcrumb({ segments }: BreadcrumbProps) {
  if (segments.length < 2) return null;

  return (
    <motion.nav
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      aria-label="Explainer navigation"
      className="sticky top-0 z-30 w-full bg-stone-50 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-700"
    >
      <div className="max-w-5xl mx-auto px-6 py-2 flex items-center gap-1 overflow-x-auto scrollbar-none">
        {/* Home icon links back to root */}
        <Link
          href="/"
          className="shrink-0 text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
          title="Back to VizBrief"
          aria-label="VizBrief home"
        >
          <Home size={13} />
        </Link>

        {segments.map((segment, idx) => {
          const isLast = idx === segments.length - 1;
          const href = segment.slug ? `/e/${segment.slug}` : undefined;

          return (
            <span key={idx} className="flex items-center gap-1 shrink-0">
              <ChevronRight size={12} className="text-stone-300 dark:text-stone-600 shrink-0" />
              {!isLast && href ? (
                <Link
                  href={href}
                  className="text-xs text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 transition-colors max-w-[160px] truncate"
                  title={segment.label}
                >
                  {segment.label}
                </Link>
              ) : (
                <span
                  className={`text-xs max-w-[200px] truncate ${
                    isLast
                      ? "text-stone-800 dark:text-stone-200 font-medium"
                      : "text-stone-500 dark:text-stone-400"
                  }`}
                  title={segment.label}
                >
                  {segment.label}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </motion.nav>
  );
}
