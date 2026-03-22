"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Calendar, BookOpen, Mic, ArrowRight, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LibraryEntry, GeneratedEntry } from "./page";

interface EpisodeCardProps {
  entry: LibraryEntry;
  generated: GeneratedEntry[] | undefined;
  index: number;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatWordCount(count: number): string {
  if (count >= 1000) {
    return `${Math.round(count / 100) / 10}k words`;
  }
  return `${count} words`;
}

function estimateReadTime(wordCount: number): string {
  const minutes = Math.ceil(wordCount / 250);
  return `${minutes} min read`;
}

export function EpisodeCard({ entry, generated, index }: EpisodeCardProps) {
  const isPodcast = entry.type === "podcast";
  const displayTitle = isPodcast && entry.guest ? entry.guest : entry.title;
  const hasGenerated = generated && generated.length > 0;

  // Use the first generated explainer as the primary link
  const primaryExplainer = hasGenerated ? generated[0] : null;

  // Show max 3 tags
  const displayTags = entry.tags.slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.35,
        delay: Math.min(index * 0.05, 0.6),
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(
        "group flex flex-col rounded-xl border border-stone-200 bg-white",
        "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-stone-300"
      )}
      style={{ backgroundColor: "#ffffff" }}
    >
      {/* Card body */}
      <div className="flex flex-col flex-1 p-5 gap-3">
        {/* Header row: type badge + date */}
        <div className="flex items-center justify-between gap-2">
          {/* Type badge */}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
              isPodcast
                ? "bg-amber-100 text-amber-700"
                : "bg-stone-100 text-stone-600"
            )}
          >
            {isPodcast ? (
              <Mic className="w-3 h-3" />
            ) : (
              <BookOpen className="w-3 h-3" />
            )}
            {isPodcast ? "Podcast" : "Newsletter"}
          </span>

          {/* Date */}
          <span className="flex items-center gap-1 text-xs text-stone-400">
            <Calendar className="w-3 h-3" />
            {formatDate(entry.date)}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-stone-900 leading-snug line-clamp-2 text-sm">
          {displayTitle}
        </h3>

        {/* Subtitle: episode title when guest is shown as main title */}
        {isPodcast && entry.guest && entry.title !== entry.guest && (
          <p className="text-xs text-stone-500 -mt-1 font-medium">
            {entry.title}
          </p>
        )}

        {/* Description */}
        <p className="text-xs text-stone-500 leading-relaxed line-clamp-2 flex-1">
          {entry.description}
        </p>

        {/* Tags */}
        {displayTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {displayTags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 text-stone-500"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-[11px] text-stone-400 pt-0.5">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {estimateReadTime(entry.word_count)}
          </span>
          <span>{formatWordCount(entry.word_count)}</span>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="px-5 pb-5 pt-0">
        {hasGenerated && primaryExplainer ? (
          <Link
            href={`/e/${primaryExplainer.slug}`}
            className={cn(
              "w-full inline-flex items-center justify-center gap-2",
              "px-4 py-2.5 rounded-lg text-xs font-semibold",
              "bg-amber-500 hover:bg-amber-600 text-white",
              "transition-all duration-150 hover:shadow-sm active:scale-[0.98]"
            )}
          >
            View Explainer
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <div
            className={cn(
              "w-full inline-flex items-center justify-center gap-2",
              "px-4 py-2.5 rounded-lg text-xs font-semibold",
              "bg-stone-100 text-stone-400 cursor-not-allowed"
            )}
          >
            Coming Soon
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Skeleton card for loading state
export function EpisodeCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl border border-stone-200 bg-white animate-pulse">
      <div className="flex flex-col flex-1 p-5 gap-3">
        <div className="flex items-center justify-between">
          <div className="h-6 w-20 rounded-full bg-stone-100" />
          <div className="h-4 w-24 rounded bg-stone-100" />
        </div>
        <div className="h-4 w-3/4 rounded bg-stone-100" />
        <div className="space-y-1.5">
          <div className="h-3 w-full rounded bg-stone-100" />
          <div className="h-3 w-5/6 rounded bg-stone-100" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-5 w-14 rounded-full bg-stone-100" />
          <div className="h-5 w-16 rounded-full bg-stone-100" />
          <div className="h-5 w-12 rounded-full bg-stone-100" />
        </div>
      </div>
      <div className="px-5 pb-5">
        <div className="h-9 w-full rounded-lg bg-stone-100" />
      </div>
    </div>
  );
}
