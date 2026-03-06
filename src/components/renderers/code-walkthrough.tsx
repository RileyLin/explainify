"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createHighlighter, type Highlighter } from "shiki";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, FileCode } from "lucide-react";
import type { CodeWalkthroughData, CodeAnnotation } from "@/lib/schemas/code";

// ── Shiki highlighter cache ─────────────────────────────────────────
let highlighterPromise: Promise<Highlighter> | null = null;
function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: ["typescript", "javascript", "python", "rust", "go", "json", "html", "css", "bash", "sql", "yaml", "toml", "markdown"],
    });
  }
  return highlighterPromise;
}

// ── Annotation Badge ────────────────────────────────────────────────
function Badge({
  index,
  isActive,
  onClick,
}: {
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-all
        ${isActive ? "bg-blue-500 text-white scale-110" : "bg-muted-foreground/20 text-muted-foreground hover:bg-blue-400 hover:text-white"}
      `}
    >
      {index + 1}
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────
export function CodeWalkthrough({ data }: { data: CodeWalkthroughData }) {
  const [activeBlockId, setActiveBlockId] = useState(data.blocks[0].id);
  const [activeAnnotationIdx, setActiveAnnotationIdx] = useState(0);
  const [highlightedHtml, setHighlightedHtml] = useState<Record<string, string>>({});
  const codeRef = useRef<HTMLDivElement>(null);

  const activeBlock = data.blocks.find((b) => b.id === activeBlockId) ?? data.blocks[0];

  // Annotations for active block in stepOrder
  const blockAnnotations = useMemo(() => {
    return data.stepOrder
      .map((id) => data.annotations.find((a) => a.id === id))
      .filter((a): a is CodeAnnotation => a != null && a.blockId === activeBlockId);
  }, [data.stepOrder, data.annotations, activeBlockId]);

  const activeAnnotation = blockAnnotations[activeAnnotationIdx] ?? null;

  // Highlight code on mount/change
  useEffect(() => {
    let cancelled = false;
    getHighlighter().then((hl) => {
      if (cancelled) return;
      const htmlMap: Record<string, string> = {};
      for (const block of data.blocks) {
        // Check if language is loaded, fall back to 'text' if not
        const lang = hl.getLoadedLanguages().includes(block.language) ? block.language : "text";
        htmlMap[block.id] = hl.codeToHtml(block.code, {
          lang,
          themes: { dark: "github-dark", light: "github-light" },
        });
      }
      setHighlightedHtml(htmlMap);
    });
    return () => { cancelled = true; };
  }, [data.blocks]);

  // Scroll to highlighted line
  useEffect(() => {
    if (!activeAnnotation || !codeRef.current) return;
    const lines = codeRef.current.querySelectorAll(".line");
    const targetLine = lines[activeAnnotation.startLine - 1];
    if (targetLine) {
      targetLine.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeAnnotation]);

  const goStep = (dir: 1 | -1) => {
    setActiveAnnotationIdx((prev) =>
      Math.max(0, Math.min(blockAnnotations.length - 1, prev + dir))
    );
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-foreground">{data.meta.title}</h2>
        <p className="text-muted-foreground mt-1">{data.meta.summary}</p>
      </div>

      {/* Tab bar for multiple blocks */}
      {data.blocks.length > 1 && (
        <div className="flex gap-1 mb-3 border-b border-border">
          {data.blocks.map((block) => (
            <button
              key={block.id}
              onClick={() => { setActiveBlockId(block.id); setActiveAnnotationIdx(0); }}
              className={`
                flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px
                ${block.id === activeBlockId
                  ? "border-blue-500 text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
                }
              `}
            >
              <FileCode size={14} />
              {block.filename ?? block.id}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Code panel */}
        <div className="relative rounded-xl border border-border overflow-hidden bg-[#0d1117]">
          {activeBlock.filename && (
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border text-xs text-muted-foreground">
              <FileCode size={12} />
              {activeBlock.filename}
            </div>
          )}
          <div ref={codeRef} className="overflow-auto max-h-[500px] relative">
            {highlightedHtml[activeBlock.id] ? (
              <div className="relative">
                {/* Highlight overlay */}
                {activeAnnotation && (
                  <style>{`
                    .code-container .line:nth-child(n+${activeAnnotation.startLine}):nth-child(-n+${activeAnnotation.endLine}) {
                      background: rgba(59, 130, 246, 0.15) !important;
                      border-left: 3px solid #3b82f6;
                      padding-left: 13px !important;
                    }
                  `}</style>
                )}
                <div
                  className="code-container text-sm [&_pre]:!p-4 [&_pre]:!m-0 [&_.line]:px-4 [&_.line]:leading-6"
                  dangerouslySetInnerHTML={{ __html: highlightedHtml[activeBlock.id] }}
                />
                {/* Annotation badges in gutter */}
                <div className="absolute top-4 left-1 flex flex-col" style={{ lineHeight: "24px" }}>
                  {blockAnnotations.map((ann, idx) => {
                    const lineHeight = 24;
                    const top = (ann.startLine - 1) * lineHeight;
                    return (
                      <div key={ann.id} className="absolute" style={{ top }}>
                        <Badge
                          index={idx}
                          isActive={idx === activeAnnotationIdx}
                          onClick={() => setActiveAnnotationIdx(idx)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <pre className="p-4 text-sm text-gray-300 font-mono">{activeBlock.code}</pre>
            )}
          </div>
        </div>

        {/* Explanation panel */}
        <div className="flex flex-col gap-3">
          {/* Step controls */}
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
            <button
              onClick={() => goStep(-1)}
              disabled={activeAnnotationIdx === 0}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 text-foreground"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-medium text-muted-foreground flex-1 text-center">
              Step {activeAnnotationIdx + 1} of {blockAnnotations.length}
            </span>
            <button
              onClick={() => goStep(1)}
              disabled={activeAnnotationIdx === blockAnnotations.length - 1}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 text-foreground"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Explanation */}
          <AnimatePresence mode="wait">
            {activeAnnotation && (
              <motion.div
                key={activeAnnotation.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="bg-card border border-border rounded-xl p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold">
                    {activeAnnotationIdx + 1}
                  </span>
                  <h4 className="font-semibold text-foreground">{activeAnnotation.label}</h4>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {activeAnnotation.explanation}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-2">
                  Lines {activeAnnotation.startLine}–{activeAnnotation.endLine}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
