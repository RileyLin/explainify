"use client";

import React, { useRef, useCallback, useState } from "react";
import { toPng } from "html-to-image";
import type { ExplainerData } from "@/lib/schemas/base";
import { ExplainerViewer } from "./viewer";
import { ExplainerFooter } from "./footer";

interface ExplainerClientProps {
  data: ExplainerData;
  url: string;
  title: string;
  slug: string;
  isDraft: boolean;
}

export function ExplainerClient({ data, url, title, slug, isDraft }: ExplainerClientProps) {
  const diagramRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadPng = useCallback(async () => {
    if (!diagramRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(diagramRef.current, {
        cacheBust: true,
        backgroundColor: "#0a0a0a",
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${slug}.png`;
      a.click();
    } catch (err) {
      console.error("PNG export failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [slug, isExporting]);

  return (
    <>
      {isDraft && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-6 py-2 text-center">
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            📝 Draft — only visible to you.{" "}
            <a href="/create" className="underline hover:no-underline">
              Go back to create
            </a>{" "}
            to publish.
          </span>
        </div>
      )}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <ExplainerViewer data={data} diagramRef={diagramRef} />
        <ExplainerFooter
          url={url}
          title={title}
          slug={slug}
          onDownloadPng={handleDownloadPng}
        />
      </div>
    </>
  );
}
