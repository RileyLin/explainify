"use client";

import { useState, useMemo, useCallback, useTransition, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Search, X, BookOpen, Mic, Layers, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { EpisodeCard, EpisodeCardSkeleton } from "./episode-card";
import type { LibraryEntry, GeneratedEntry } from "./page";

const ITEMS_PER_PAGE = 24;

const ALL_TAGS = [
  "design",
  "leadership",
  "strategy",
  "growth",
  "career",
  "product-management",
  "b2b",
  "engineering",
  "b2c",
  "ai",
  "analytics",
  "go-to-market",
  "pricing",
  "organization",
  "startups",
];

type TabType = "all" | "podcast" | "newsletter";

interface LennysLibraryClientProps {
  entries: LibraryEntry[];
  generated: Record<string, GeneratedEntry[]>;
  podcastCount: number;
  newsletterCount: number;
}

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

export function LennysLibraryClient({
  entries,
  generated,
  podcastCount,
  newsletterCount,
}: LennysLibraryClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  const debouncedQuery = useDebounce(searchQuery, 300);

  const filtered = useMemo(() => {
    let result = entries;

    // Tab filter
    if (activeTab === "podcast") {
      result = result.filter((e) => e.type === "podcast");
    } else if (activeTab === "newsletter") {
      result = result.filter((e) => e.type === "newsletter");
    }

    // Tag filter
    if (activeTag) {
      result = result.filter((e) => e.tags.includes(activeTag));
    }

    // Search filter
    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase().trim();
      result = result.filter((e) => {
        if (e.title.toLowerCase().includes(q)) return true;
        if (e.description.toLowerCase().includes(q)) return true;
        if (e.type === "podcast" && e.guest?.toLowerCase().includes(q)) return true;
        if (e.tags.some((t) => t.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    return result;
  }, [entries, activeTab, activeTag, debouncedQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const pageEnd = pageStart + ITEMS_PER_PAGE;
  const pageEntries = filtered.slice(pageStart, pageEnd);

  const handleTabChange = useCallback(
    (tab: TabType) => {
      startTransition(() => {
        setActiveTab(tab);
        setCurrentPage(1);
      });
    },
    []
  );

  const handleTagToggle = useCallback(
    (tag: string) => {
      startTransition(() => {
        setActiveTag((prev) => (prev === tag ? null : tag));
        setCurrentPage(1);
      });
    },
    []
  );

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setCurrentPage(1);
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const tabs: { id: TabType; label: string; count: number; icon: React.ReactNode }[] = [
    {
      id: "all",
      label: "All",
      count: entries.length,
      icon: <Layers className="w-3.5 h-3.5" />,
    },
    {
      id: "podcast",
      label: "Podcasts",
      count: podcastCount,
      icon: <Mic className="w-3.5 h-3.5" />,
    },
    {
      id: "newsletter",
      label: "Newsletters",
      count: newsletterCount,
      icon: <BookOpen className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero header ─────────────────────────────────── */}
      <div
        className="border-b"
        style={{
          borderColor: "rgba(99,102,241,0.15)",
          background:
            "linear-gradient(135deg, var(--background) 0%, rgba(99,102,241,0.05) 50%, var(--background) 100%)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          {/* Breadcrumb */}
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-4">
            Visual Library
          </p>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                Lenny&apos;s Visual Library
              </h1>
              <p className="mt-2 text-base text-white/60 max-w-xl leading-relaxed">
                {entries.length} podcasts and newsletters, visualized. Explore every topic
                from product strategy to engineering leadership.
              </p>
            </div>

            {/* Powered-by badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs text-white/60 self-start sm:self-auto shrink-0"
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(8px)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              Powered by VizBrief
            </div>
          </div>
        </div>
      </div>

      {/* ── Controls ─────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search by title, guest, topic…"
            className={cn(
              "w-full pl-10 pr-10 py-3 rounded-xl",
              "text-white placeholder:text-white/30 text-sm",
              "outline-none transition-all duration-150"
            )}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.border = "1px solid rgba(99,102,241,0.5)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.1)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.border = "1px solid rgba(255,255,255,0.1)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium",
                "transition-all duration-150"
              )}
              style={
                activeTab === tab.id
                  ? {
                      background: "#6366f1",
                      color: "#ffffff",
                      boxShadow: "0 0 20px rgba(99,102,241,0.3)",
                    }
                  : {
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.6)",
                    }
              }
            >
              {tab.icon}
              {tab.label}
              <span
                className={cn(
                  "ml-0.5 text-xs font-semibold",
                  activeTab === tab.id ? "text-indigo-200" : "text-white/30"
                )}
              >
                ({tab.count})
              </span>
            </button>
          ))}
        </div>

        {/* Tag chips */}
        <div className="flex gap-2 flex-wrap">
          {ALL_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagToggle(tag)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium",
                "transition-all duration-150"
              )}
              style={
                activeTag === tag
                  ? {
                      background: "#6366f1",
                      color: "#ffffff",
                      boxShadow: "0 0 16px rgba(99,102,241,0.3)",
                    }
                  : {
                      background: "rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.6)",
                    }
              }
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* ── Results info ─────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-white/40">
            {filtered.length === entries.length ? (
              <>
                Showing <span className="font-semibold text-white/70">{entries.length}</span> items
              </>
            ) : (
              <>
                <span className="font-semibold text-white/70">{filtered.length}</span> results
                {debouncedQuery && (
                  <>
                    {" "}for{" "}
                    <span className="font-semibold text-indigo-400">&ldquo;{debouncedQuery}&rdquo;</span>
                  </>
                )}
              </>
            )}
          </p>
          {totalPages > 1 && (
            <p className="text-xs text-white/30">
              Page {safeCurrentPage} of {totalPages}
            </p>
          )}
        </div>
      </div>

      {/* ── Grid ─────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
        {isPending ? (
          /* Loading skeleton while tab/tag changes filter */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <EpisodeCardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          /* Empty state */
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 gap-4 text-center"
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: "rgba(99,102,241,0.12)",
                border: "1px solid rgba(99,102,241,0.25)",
              }}
            >
              <Search className="w-7 h-7 text-indigo-400" />
            </div>
            <div>
              <p className="font-semibold text-white">No results found</p>
              <p className="text-sm text-white/50 mt-1">
                Try a different search term or clear your filters.
              </p>
            </div>
            <button
              onClick={() => {
                setSearchQuery("");
                setActiveTag(null);
                setActiveTab("all");
                setCurrentPage(1);
              }}
              className="px-4 py-2 rounded-xl text-white text-sm font-medium transition-colors"
              style={{ background: "#6366f1" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#4f46e5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#6366f1")}
            >
              Clear all filters
            </button>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeTab}-${activeTag}-${debouncedQuery}-${safeCurrentPage}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {pageEntries.map((entry, i) => (
                <EpisodeCard
                  key={entry.filename}
                  entry={entry}
                  generated={generated[entry.filename]}
                  index={i}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {/* ── Pagination ──────────────────────────────────── */}
        {totalPages > 1 && !isPending && filtered.length > 0 && (
          <div className="flex items-center justify-center gap-3 mt-10">
            <button
              onClick={() => handlePageChange(safeCurrentPage - 1)}
              disabled={safeCurrentPage <= 1}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium",
                "transition-all duration-150"
              )}
              style={
                safeCurrentPage <= 1
                  ? {
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.2)",
                      cursor: "not-allowed",
                    }
                  : {
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.7)",
                    }
              }
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>

            {/* Page number buttons (show up to 5) */}
            <div className="flex gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let page: number;
                if (totalPages <= 5) {
                  page = i + 1;
                } else if (safeCurrentPage <= 3) {
                  page = i + 1;
                } else if (safeCurrentPage >= totalPages - 2) {
                  page = totalPages - 4 + i;
                } else {
                  page = safeCurrentPage - 2 + i;
                }
                return (
                  <button
                    key={page}
                    onClick={() => handlePageChange(page)}
                    className="w-9 h-9 rounded-lg text-sm font-medium transition-all duration-150"
                    style={
                      page === safeCurrentPage
                        ? {
                            background: "#6366f1",
                            color: "#ffffff",
                            boxShadow: "0 0 16px rgba(99,102,241,0.3)",
                          }
                        : {
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: "rgba(255,255,255,0.6)",
                          }
                    }
                  >
                    {page}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => handlePageChange(safeCurrentPage + 1)}
              disabled={safeCurrentPage >= totalPages}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium",
                "transition-all duration-150"
              )}
              style={
                safeCurrentPage >= totalPages
                  ? {
                      background: "rgba(255,255,255,0.04)",
                      color: "rgba(255,255,255,0.2)",
                      cursor: "not-allowed",
                    }
                  : {
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.7)",
                    }
              }
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
